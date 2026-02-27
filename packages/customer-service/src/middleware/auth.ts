import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function authenticateService(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-service-key'];
  
  if (apiKey !== config.SERVICE_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  next();
}
