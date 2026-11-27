import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

/**
 * Hardening for running the table on the open internet (e.g. behind a Cloudflare Tunnel): the real
 * client IP, simple rate limits, and security headers. Everything is in memory; a restart resets it.
 */

const LOOPBACK = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/;

/**
 * The client's IP. A tunnel / reverse proxy (cloudflared, tailscale serve) connects from this machine,
 * so only then are its forwarding headers trusted; a direct client can't spoof them.
 */
export function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '';
  if (!LOOPBACK.test(remote)) return remote;
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || remote;
}

/** "At most `max` hits per `windowMs` per key" (fixed window). */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Count one hit; false = over the limit. */
  hit(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now >= h.reset) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      if (this.hits.size > 5000) this.sweep(now);
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }

  /** Over the limit right now, without counting a hit. */
  blocked(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    return !!h && now < h.reset && h.n >= this.max;
  }

  private sweep(now: number): void {
    for (const [k, h] of this.hits) if (now >= h.reset) this.hits.delete(k);
  }
}

/** Express middleware: 429 once an IP passes `max` requests per `windowMs`. */
export function rateLimit(max: number, windowMs: number, message = 'Quá nhiều yêu cầu, thử lại sau ít phút') {
  const lim = new RateLimiter(max, windowMs);
  return (req: Request, res: Response, next: NextFunction) => {
    if (lim.hit(clientIp(req))) return next();
    res.status(429).json({ error: message });
  };
}

/**
 * Per-socket message budget (token bucket): bursts are fine (dragging a token streams previews),
 * a flood is not. `take()` false = drop the message.
 */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private capacity: number,
    private perSecond: number,
  ) {
    this.tokens = capacity;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/**
 * Security headers. The CSP allows only this site's own scripts (plus blob: for the audio worklet);
 * images, map backgrounds and dddice's API / sockets stay reachable from anywhere they live. The
 * table's own campaign pages (/campaign/*.html) carry a small inline script and Google Fonts.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const campaign = req.path.startsWith('/campaign/');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' blob:${campaign ? " 'unsafe-inline'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      'img-src * data: blob:',
      "media-src 'self' blob: data:",
      "connect-src 'self' ws: wss: https:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
  next();
}
