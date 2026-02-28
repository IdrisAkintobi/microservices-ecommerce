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

export async function reserveStock(
  productId: string, 
  quantity: number
): Promise<{ price: number } | { error: string; available?: number }> {
  try {
    const response = await fetch(`${config.PRODUCT_SERVICE_URL}/products/${productId}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': config.SERVICE_API_KEY,
      },
      body: JSON.stringify({ quantity }),
    });
    
    if (response.ok) {
      const data = await response.json() as { price: number };
      return data;
    }

    if (response.status === 404) {
      return { error: 'Product not found' };
    }

    if (response.status === 409) {
      const data = await response.json() as { error: string; available: number };
      return { error: data.available === 0 ? 'Out of stock' : 'Insufficient stock.', available: data.available };
    }

    return { error: 'Failed to reserve stock' };
  } catch (err) {
    logger.error({ err, productId, quantity }, 'Failed to reserve stock');
    return { error: 'Failed to reserve stock' };
  }
}
