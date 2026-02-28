import { config } from '../config';
import { logger } from '../config/logger';

export async function validateCustomer(customerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${config.CUSTOMER_SERVICE_URL}/customers/${customerId}`, {
      headers: { 'x-service-key': config.SERVICE_API_KEY },
    });
    return response.ok;
  } catch (err) {
    logger.warn({ err, customerId }, 'Customer validation failed');
    return false;
  }
}

export async function reserveStock(productId: string, quantity: number): Promise<{ price: number } | null> {
  try {
    const response = await fetch(`${config.PRODUCT_SERVICE_URL}/products/${productId}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': config.SERVICE_API_KEY,
      },
      body: JSON.stringify({ quantity }),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json() as { price: number };
    return data;
  } catch (err) {
    logger.error({ err, productId, quantity }, 'Failed to reserve stock');
    return null;
  }
}
