# Microservices E-Commerce Platform

Event-driven microservices demo with Node.js 24, TypeScript, MongoDB, RabbitMQ, and ValKey.

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start all services
npm run dev

# 3. Seed data (in new terminal, wait ~30s)
npm run seed

# 4. Test the system
./scripts/test-flow.sh
```

## Architecture Overview

```
Client → POST /orders → Order Service
         ↓ validates customer & reserves stock
         ↓ creates order (pending)
         ↓ generates payment session (ValKey)
         ↓ returns payment token
         
Client → POST /payments?token={sessionId} → Payment Service
         ↓ retrieves session from ValKey
         ↓ processes payment
         ↓ publishes payment.succeeded/failed event
         ↓ returns transaction result
         
Order Service (consumer) → updates order status
Product Service (consumer) → decrements stock
```

## Services

| Service | Port | Database | Purpose |
|---------|------|----------|---------|
| customer-service | 3001 | customer-db | Customer management |
| product-service | 3002 | product-db | Product catalog + stock management |
| order-service | 3003 | order-db | Order creation + payment sessions |
| payment-service | 3004 | payment-db | Payment processing + transactions |
| MongoDB | 27017 | - | Data storage |
| RabbitMQ | 5672, 15672 | - | Event messaging |
| ValKey | 6379 | - | Idempotency + caching |

## Key Features

- **Payment Sessions**: ValKey-based payment tokens with 1h TTL (consume once)
- **Stock Reservations**: Temporary stock holds in ValKey during checkout
- **Idempotency**: Duplicate order prevention with 24h TTL
- **Event-Driven**: Async order/stock updates via RabbitMQ
- **Service Auth**: X-Service-Key header for inter-service communication
- **Type Safety**: TypeScript strict mode throughout
- **Resilience**: Retry logic, health checks, graceful shutdown

## Tech Stack

- Node.js 24 (native env support, no dotenv)
- TypeScript 5.7 (strict mode)
- Express 5
- Mongoose 8.9 (TypeScript schemas)
- RabbitMQ 3.13 (event messaging)
- ValKey 7.2 (Redis fork)
- MongoDB 7
- Docker Compose

## API Examples

### Create Order
```bash
# Get customer and product IDs first
./scripts/get-ids.sh

# Create order (use real IDs from above)
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{
    "customerId": "67890abcdef1234567890abc",
    "productId": "67890abcdef1234567890def",
    "quantity": 2
  }'

# Response:
{
  "orderId": "67890abcdef1234567890xyz",
  "amount": 17000,
  "status": "pending",
  "paymentToken": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### Process Payment
```bash
# Use paymentToken from order response
curl -X POST "http://localhost:3004/payments?token=550e8400-e29b-41d4-a716-446655440000&simulate=success"

# Response:
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440001",
  "orderId": "67890abcdef1234567890xyz",
  "amount": 17000,
  "status": "success"
}
```

## Common Commands

```bash
npm run dev          # Start all services
npm run down         # Stop and remove volumes
npm run logs         # View all logs
npm run health       # Check service health
npm run seed         # Seed databases
npm run build        # Build all services
```

## Monitoring

- **RabbitMQ UI**: http://localhost:15672 (guest/guest)
- **Logs**: `docker compose logs -f <service-name>`
- **Health**: `npm run health`

## Documentation

- [DOCS.md](DOCS.md) - Complete documentation (architecture, API, troubleshooting)
- [examples/api-requests.md](examples/api-requests.md) - API examples

## Production Considerations

This is a demo. For production, add:

- **mTLS** for service-to-service auth
- **API Gateway** (Kong, Traefik)
- **Distributed Tracing** (OpenTelemetry)
- **Centralized Logging** (ELK stack)
- **Kubernetes** instead of Docker Compose
- **Real Payment Gateway** (Stripe, PayPal)
- **Circuit Breakers** and rate limiting
- **Outbox Pattern** for guaranteed event delivery

## License

MIT
