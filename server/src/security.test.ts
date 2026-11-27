import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp, RateLimiter, TokenBucket } from './security.js';

const req = (remote: string, headers: Record<string, string> = {}) =>
  ({ socket: { remoteAddress: remote }, headers }) as unknown as IncomingMessage;

describe('clientIp', () => {
  it('trusts forwarding headers only from a local proxy', () => {
    expect(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req('::1', { 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2');
    // a direct client can't pretend to be someone else
    expect(clientIp(req('198.51.100.9', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('198.51.100.9');
    expect(clientIp(req('127.0.0.1'))).toBe('127.0.0.1');
  });
});

describe('RateLimiter', () => {
  it('allows max hits per window, then blocks until the window resets', () => {
    const lim = new RateLimiter(3, 1000);
    expect([lim.hit('a', 0), lim.hit('a', 1), lim.hit('a', 2), lim.hit('a', 3)]).toEqual([true, true, true, false]);
    expect(lim.blocked('a', 500)).toBe(true);
    expect(lim.hit('b', 500)).toBe(true); // per key
    expect(lim.hit('a', 1000)).toBe(true);
    expect(lim.blocked('a', 1001)).toBe(false);
  });
});

describe('TokenBucket', () => {
  it('lets a burst through, drops a flood, refills over time', () => {
    const b = new TokenBucket(3, 1);
    const t0 = Date.now();
    expect([b.take(t0), b.take(t0), b.take(t0), b.take(t0)]).toEqual([true, true, true, false]);
    expect(b.take(t0 + 1000)).toBe(true);
    expect(b.take(t0 + 1000)).toBe(false);
  });
});
