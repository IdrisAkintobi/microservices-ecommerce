import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config';

export function authenticateService(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-service-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Use timing-safe comparison to prevent timing attacks
  const providedKey = Buffer.from(apiKey, 'utf8');
  const expectedKey = Buffer.from(config.SERVICE_API_KEY, 'utf8');

  const isValid =
    providedKey.length === expectedKey.length && timingSafeEqual(providedKey, expectedKey);

  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}
