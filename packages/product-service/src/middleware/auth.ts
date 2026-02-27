import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function authenticateService(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-service-key'];
  
  if (apiKey !== config.SERVICE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  return next();
}
