import { createHmac, createPublicKey, randomBytes, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Who is at the table, as Cloudflare Access proved it. Behind a Cloudflare Tunnel + Access app, every
 * request reaching us carries a signed JWT (`Cf-Access-Jwt-Assertion` header / `CF_Authorization`
 * cookie) with the email the person logged in with. We verify that signature against the team's public
 * keys — a bare email header is never trusted, since anyone on the LAN / tailnet could send one.
 *
 *   CF_ACCESS_TEAM_DOMAIN  e.g. myteam.cloudflareaccess.com
 *   CF_ACCESS_AUD          the Access application's "Application Audience (AUD) tag"
 *   DM_EMAILS              comma-separated emails that always sit in the DM seat
 *
 * Sitting at the server itself (http://localhost, no proxy in between) also counts as the DM.
 */

export interface TableAuth {
  /** Verified login email (lower-case), when the request came through Cloudflare Access. */
  email?: string;
  /** Opened directly on the server machine (http://localhost…, nothing proxied). */
  local: boolean;
}

export interface AccessConfig {
  teamDomain?: string;
  aud?: string;
  dmEmails: string[];
  /** Where the signing keys live (defaults to the team's /cdn-cgi/access/certs). */
  certsUrl?: string;
}

export function accessConfigFromEnv(env = process.env): AccessConfig {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || undefined;
  return {
    teamDomain,
    aud: env.CF_ACCESS_AUD?.trim() || undefined,
    dmEmails: (env.DM_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    certsUrl: env.CF_ACCESS_CERTS_URL?.trim() || (teamDomain ? `https://${teamDomain}/cdn-cgi/access/certs` : undefined),
  };
}

// ---------------------------------------------------------------- JWT (RS256) verification

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
export type KeyProvider = (kid: string) => Promise<KeyObject | undefined>;

/** Signing keys fetched from `url`, cached for an hour (refetched early when an unknown `kid` shows up). */
export function remoteKeys(url: string): KeyProvider {
  let keys = new Map<string, KeyObject>();
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;
  const refresh = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Cloudflare Access certs: HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const next = new Map<string, KeyObject>();
    for (const k of body.keys ?? []) {
      if (k.kty === 'RSA' && k.kid) next.set(k.kid, createPublicKey({ key: k as never, format: 'jwk' }));
    }
    keys = next;
    fetchedAt = Date.now();
  };
  return async (kid) => {
    const stale = Date.now() - fetchedAt > 60 * 60_000;
    // an unknown kid may mean the keys rotated; don't hammer the endpoint for garbage tokens though
    const rotated = !keys.has(kid) && Date.now() - fetchedAt > 60_000;
    if (stale || rotated) {
      inflight ??= refresh().finally(() => (inflight = null));
      try {
        await inflight;
      } catch (err) {
        console.warn((err as Error).message);
      }
    }
    return keys.get(kid);
  };
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** The verified email inside a Cloudflare Access token, or undefined if anything about it is off. */
export async function verifyAccessJwt(token: string, cfg: AccessConfig, keyFor: KeyProvider, now = Date.now()): Promise<string | undefined> {
  if (!cfg.teamDomain || !cfg.aud) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(b64url(parts[0]).toString('utf8'));
    payload = JSON.parse(b64url(parts[1]).toString('utf8'));
  } catch {
    return undefined;
  }
  if (header.alg !== 'RS256' || !header.kid) return undefined;
  const key = await keyFor(header.kid);
  if (!key) return undefined;
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]));
  if (!ok) return undefined;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(cfg.aud)) return undefined;
  if (payload.iss !== `https://${cfg.teamDomain}`) return undefined;
  const t = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < t - 30) return undefined;
  if (typeof payload.nbf === 'number' && payload.nbf > t + 30) return undefined;
  return typeof payload.email === 'string' && payload.email.includes('@') ? payload.email.trim().toLowerCase() : undefined;
}

// ---------------------------------------------------------------- the request

const LOOPBACK = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/;

/** Opened on the server machine itself as http://localhost — no tunnel / proxy headers at all. */
export function isLocalDirect(req: IncomingMessage): boolean {
  if (!LOOPBACK.test(req.socket.remoteAddress ?? '')) return false;
  const h = req.headers;
  if (h['x-forwarded-for'] || h['cf-connecting-ip'] || h['cf-access-jwt-assertion'] || h['tailscale-user-login'] || h['forwarded']) return false;
  return /^localhost(:\d+)?$/i.test(h.host ?? '');
}

function accessToken(req: IncomingMessage): string | undefined {
  const h = req.headers['cf-access-jwt-assertion'];
  if (typeof h === 'string' && h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.cookie ?? '');
  return m?.[1];
}

export function makeAuthResolver(cfg: AccessConfig, keyFor?: KeyProvider) {
  const keys = keyFor ?? (cfg.certsUrl ? remoteKeys(cfg.certsUrl) : async () => undefined);
  return async (req: IncomingMessage): Promise<TableAuth> => {
    const local = isLocalDirect(req);
    const token = accessToken(req);
    const email = token ? await verifyAccessJwt(token, cfg, keys) : undefined;
    return { email, local };
  };
}

export function isDmAuth(auth: TableAuth, cfg: AccessConfig): boolean {
  return auth.local || (!!auth.email && cfg.dmEmails.includes(auth.email));
}

// ---------------------------------------------------------------- email → participant id

/**
 * Which participant each login email is (so a player keeps their character on any device). Emails are
 * never stored: only an HMAC of them, keyed by a random salt that lives next to it (server/data, not in git).
 */
export class AuthIds {
  private salt: string;
  private ids: Record<string, string>;
  constructor(private file: string) {
    let data: { salt?: string; ids?: Record<string, string> } = {};
    if (existsSync(file)) {
      try {
        data = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        /* start over */
      }
    }
    this.salt = data.salt ?? randomBytes(32).toString('hex');
    this.ids = data.ids ?? {};
    if (!data.salt) this.save();
  }
  private key(email: string): string {
    return createHmac('sha256', this.salt).update(email.trim().toLowerCase()).digest('hex');
  }
  get(email: string): string | undefined {
    return this.ids[this.key(email)];
  }
  /** Whether some email is already bound to this participant id. */
  bound(participantId: string): boolean {
    return Object.values(this.ids).includes(participantId);
  }
  set(email: string, participantId: string): void {
    const k = this.key(email);
    if (this.ids[k] === participantId) return;
    this.ids[k] = participantId;
    this.save();
  }
  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify({ salt: this.salt, ids: this.ids }, null, 2));
    } catch (err) {
      console.error('auth ids: cannot save', (err as Error).message);
    }
  }
}
