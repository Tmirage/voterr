import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';

interface RateLimitRecord {
  count: number;
  windowStart: number;
  windowMs: number;
}

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  skipFailedRequests?: boolean;
  skip?: (req: Request) => boolean;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

const CLEANUP_INTERVAL = 60000;

setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((data: RateLimitRecord, key: string) => {
    if (now - data.windowStart > data.windowMs) {
      rateLimitStore.delete(key);
    }
  });
}, CLEANUP_INTERVAL);

function createRateLimiter(
  options: RateLimitOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const {
    windowMs = 60000,
    max = 100,
    keyGenerator = (req: Request) => {
      const authReq = req as AuthenticatedRequest;
      return req.ip || String(authReq.session?.userId) || 'anonymous';
    },
    skipFailedRequests = false,
    skip = () => false,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now - record.windowStart > windowMs) {
      record = { count: 0, windowStart: now, windowMs };
      rateLimitStore.set(key, record);
    }

    record.count++;

    const remaining = Math.max(0, max - record.count);
    const resetTime = Math.ceil((record.windowStart + windowMs - now) / 1000);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(resetTime));

    if (record.count > max) {
      res.set('Retry-After', String(resetTime));
      res.status(429).json({
        error: 'Too many requests, please try again later',
        retryAfter: resetTime,
      });
      return;
    }

    if (skipFailedRequests) {
      const originalEnd = res.end.bind(res) as typeof res.end;
      const currentRecord = record;
      (res as { end: typeof res.end }).end = function (...args: unknown[]): Response {
        if (res.statusCode >= 400) {
          currentRecord.count--;
        }
        return (originalEnd as (...args: unknown[]) => Response)(...args);
      } as typeof res.end;
    }

    next();
  };
}

export const authLimiter = createRateLimiter({
  windowMs: 60000,
  max: 30,
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  skipFailedRequests: true,
});
