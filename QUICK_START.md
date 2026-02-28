# Quick Start Guide

## Prerequisites

- Docker & Docker Compose v2
- Node.js 24+
- jq: `brew install jq` (macOS) or `apt-get install jq` (Linux)

## Setup (5 minutes)

### 1. Start Services
```bash
cp .env.example .env
npm run dev
```

Wait ~30 seconds for health checks to pass.

### 2. Seed Data
```bash
npm run seed
```

### 3. Test
```bash
./scripts/test-flow.sh
```

You should see:
```
✅ Order created: 507f...
✅ Idempotency test passed
✅ Payment link: http://localhost:3004/payments?token=...
✅ Payment processed: success
✅ Order status: confirmed
```

## Manual Testing

### Get Customer and Product IDs
```bash
./scripts/get-ids.sh
```

### Create Order
```bash
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{
    "customerId": "CUSTOMER_ID_HERE",
    "productId": "PRODUCT_ID_HERE",
    "quantity": 2
  }'
```

### Process Payment
```bash
# Use paymentToken from order response
curl -X POST "http://localhost:3004/payments?token=PAYMENT_TOKEN_HERE&simulate=success"
```

### Check Order Status
```bash
curl http://localhost:3003/orders/ORDER_ID \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| customer-service | 3001 | http://localhost:3001 |
| product-service | 3002 | http://localhost:3002 |
| order-service | 3003 | http://localhost:3003 |
| payment-service | 3004 | http://localhost:3004 |
| RabbitMQ UI | 15672 | http://localhost:15672 |

## Common Issues

### Services won't start
```bash
npm run down && npm run dev
```

### Port already in use
```bash
lsof -i :3003
kill -9 <PID>
```

### Seed fails
```bash
npm run down  # Deletes volumes
npm run dev
npm run seed
```

### Order stays pending
```bash
docker compose logs payment-service order-service
```

## Debugging

### View Logs
```bash
npm run logs                          # All services
docker compose logs -f order-service  # Specific service
```

### Check Health
```bash
npm run health
```

### Inspect Database
```bash
docker compose exec mongodb mongosh
use order-db
db.orders.find().pretty()
```

### Inspect ValKey
```bash
docker compose exec valkey valkey-cli
KEYS *
GET idempotency:YOUR-KEY
```

### Inspect RabbitMQ
Open http://localhost:15672 (guest/guest)

## Stop Services
```bash
npm run down
```

## Next Steps

- Read [DOCS.md](DOCS.md) for complete documentation
- Check [examples/api-requests.md](examples/api-requests.md) for more API examples
- Explore the code in `packages/`
