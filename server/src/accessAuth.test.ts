import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessConfigFromEnv, AuthIds, isDmAuth, isLocalDirect, makeAuthResolver, verifyAccessJwt, type AccessConfig } from './accessAuth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cfg: AccessConfig = { teamDomain: 'team.example.com', aud: 'aud-1', dmEmails: ['dm@example.com'] };
const keys = async (kid: string) => (kid === 'k1' ? publicKey : undefined);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Date.now();
function jwt(payload: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey; alg?: string } = {}) {
  const head = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1' });
  const body = b64({ aud: ['aud-1'], iss: 'https://team.example.com', exp: Math.floor(now / 1000) + 600, email: 'Player@Example.com', ...payload });
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

describe('verifyAccessJwt', () => {
  it('returns the lower-cased email of a valid token', async () => {
    expect(await verifyAccessJwt(jwt({}), cfg, keys, now)).toBe('player@example.com');
  });
  it('rejects wrong signature, audience, issuer, expiry, algorithm or key id', async () => {
    expect(await verifyAccessJwt(jwt({}, { key: other.privateKey }), cfg, keys, now)).toBeUndefined();
    expect(await verifyAccessJwt(jwt({ aud: ['someone-else'] }), cfg, keys, now)).toBeUndefined();
    expect(await verifyAccessJwt(jwt({ iss: 'https://evil.example.com' }), cfg, keys, now)).toBeUndefined();
    expect(await verifyAccessJwt(jwt({ exp: Math.floor(now / 1000) - 3600 }), cfg, keys, now)).toBeUndefined();
    expect(await verifyAccessJwt(jwt({}, { alg: 'none' }), cfg, keys, now)).toBeUndefined();
    expect(await verifyAccessJwt(jwt({}, { kid: 'k2' }), cfg, keys, now)).toBeUndefined();
    expect(await verifyAccessJwt('not.a.jwt', cfg, keys, now)).toBeUndefined();
    // a tampered payload with the original signature
    const [h, , s] = jwt({}).split('.');
    expect(await verifyAccessJwt(`${h}.${b64({ aud: ['aud-1'], iss: 'https://team.example.com', exp: 9e9, email: 'dm@example.com' })}.${s}`, cfg, keys, now)).toBeUndefined();
  });
  it('is off until both the team domain and the audience are configured', async () => {
    expect(await verifyAccessJwt(jwt({}), { ...cfg, aud: undefined }, keys, now)).toBeUndefined();
  });
});

const req = (remote: string, headers: Record<string, string> = {}) => ({ socket: { remoteAddress: remote }, headers }) as unknown as IncomingMessage;

describe('who is at the table', () => {
  it('local = http://localhost on the server machine, nothing proxied', () => {
    expect(isLocalDirect(req('127.0.0.1', { host: 'localhost:8787' }))).toBe(true);
    expect(isLocalDirect(req('::1', { host: 'localhost:8787' }))).toBe(true);
    expect(isLocalDirect(req('127.0.0.1', { host: '127.0.0.1:8787' }))).toBe(false);
    // a tunnel / tailscale serve also connects from loopback, but says so
    expect(isLocalDirect(req('127.0.0.1', { host: 'localhost:8787', 'cf-connecting-ip': '1.2.3.4' }))).toBe(false);
    expect(isLocalDirect(req('127.0.0.1', { host: 'localhost:8787', 'x-forwarded-for': '100.64.0.2' }))).toBe(false);
    expect(isLocalDirect(req('192.168.1.20', { host: 'localhost:8787' }))).toBe(false);
  });
  it('reads the token from the header or the CF_Authorization cookie; a bare email header counts for nothing', async () => {
    const resolve = makeAuthResolver(cfg, keys);
    expect(await resolve(req('127.0.0.1', { host: 'x', 'cf-access-jwt-assertion': jwt({}) }))).toEqual({ email: 'player@example.com', local: false });
    expect((await resolve(req('127.0.0.1', { host: 'x', cookie: `a=1; CF_Authorization=${jwt({ email: 'dm@example.com' })}` }))).email).toBe('dm@example.com');
    expect((await resolve(req('127.0.0.1', { host: 'x', 'cf-access-authenticated-user-email': 'dm@example.com' }))).email).toBeUndefined();
  });
  it('DM seat: a DM email login or the server machine', () => {
    expect(isDmAuth({ email: 'dm@example.com', local: false }, cfg)).toBe(true);
    expect(isDmAuth({ email: 'player@example.com', local: false }, cfg)).toBe(false);
    expect(isDmAuth({ local: true }, cfg)).toBe(true);
    expect(isDmAuth({ local: false }, cfg)).toBe(false);
  });
  it('reads its settings from the environment', () => {
    const c = accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com/', CF_ACCESS_AUD: 'a', DM_EMAILS: ' A@x.com, b@y.com ' });
    expect(c).toMatchObject({ teamDomain: 't.cloudflareaccess.com', aud: 'a', dmEmails: ['a@x.com', 'b@y.com'], certsUrl: 'https://t.cloudflareaccess.com/cdn-cgi/access/certs' });
  });
});

describe('AuthIds', () => {
  it('maps an email to a participant id, stores no email, survives a restart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'authids-')), 'auth-ids.json');
    const a = new AuthIds(file);
    a.set('Someone@Example.com', 'p1');
    expect(a.get('someone@example.com')).toBe('p1');
    expect(a.bound('p1')).toBe(true);
    expect(readFileSync(file, 'utf8')).not.toMatch(/example/i);
    expect(new AuthIds(file).get('SOMEONE@example.com')).toBe('p1');
    a.set('someone@example.com', 'p1', 'Aria');
    expect(new AuthIds(file).nameOf('p1')).toBe('Aria');
  });
});
