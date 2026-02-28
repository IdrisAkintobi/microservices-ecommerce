import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  SERVICE_API_KEY: z.string().min(1, 'SERVICE_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  VALKEY_URL: z.string().url().default('redis://valkey:6379'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
