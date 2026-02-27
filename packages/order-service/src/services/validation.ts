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

export async function validateProduct(productId: string): Promise<{ price: number } | null> {
  try {
    const response = await fetch(`${config.PRODUCT_SERVICE_URL}/products/${productId}`, {
      headers: { 'x-service-key': config.SERVICE_API_KEY },
    });
    
    if (!response.ok) return null;
    
    const product = await response.json() as { price: number };
    return { price: product.price };
  } catch (err) {
    logger.warn({ err, productId }, 'Product validation failed');
    return null;
  }
}
