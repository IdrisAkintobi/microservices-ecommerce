# Complete Documentation

## Table of Contents

1. [Architecture](#architecture)
2. [Services](#services)
3. [Data Models](#data-models)
4. [API Reference](#api-reference)
5. [Security](#security)
6. [Development](#development)
7. [Troubleshooting](#troubleshooting)
8. [Production Guide](#production-guide)

---

## Architecture

### System Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /orders
     │ Headers: idempotency-key, x-service-key
     │ Body: { customerId, productId, quantity }
     ▼
┌─────────────────────────────────────────────────────────┐
│ Order Service (Port 3003)                               │
│ 1. Check idempotency key in ValKey                      │
│ 2. Validate customer exists (HTTP → customer-service)   │
│ 3. Reserve stock (HTTP → product-service)               │
│ 4. Calculate amount (product.price * quantity)          │
│ 5. Save order to MongoDB (status: pending)              │
│ 6. Store idempotency key in ValKey (24h TTL)            │
│ 7. Generate payment session ID (stored in ValKey, 1h)   │
│ 8. Return { orderId, amount, paymentToken, status }     │
└─────────────────────────────────────────────────────────┘
     │
     │ Client receives payment token
     ▼
┌─────────────────────────────────────────────────────────┐
│ Payment Service (Port 3004)                             │
│ 1. Retrieve payment session from ValKey                 │
│ 2. Extract orderId, productId, quantity, amount         │
│ 3. Delete session (consume once)                        │
│ 4. Simulate payment (90% success, 1s delay)             │
│ 5. Create transaction record                            │
│ 6. Publish payment.succeeded/failed event               │
│ 7. Return { transactionId, status, amount }             │
└─────────────────────────────────────────────────────────┘
     │
     │ payment.succeeded/failed event
     ▼
┌─────────────────────────────────────────────────────────┐
│ Order Service (RabbitMQ Consumer)                       │
│ 1. Consume payment event                                │
│ 2. Update order status (confirmed/failed)               │
│ 3. Acknowledge message                                  │
└─────────────────────────────────────────────────────────┘
     │
     │ payment.succeeded event (also consumed by)
     ▼
┌─────────────────────────────────────────────────────────┐
│ Product Service (RabbitMQ Consumer)                     │
│ 1. Consume payment.succeeded event                      │
│ 2. Decrement product stock in MongoDB                   │
│ 3. Acknowledge message                                  │
└─────────────────────────────────────────────────────────┘
```

### Design Principles

1. **User-Initiated Payment**: Payment requires explicit user action (realistic)
2. **JWT Security**: Payment links contain signed tokens (tamper-proof)
3. **Idempotency**: Duplicate requests return cached results
4. **Event-Driven Updates**: Order status updates asynchronously
5. **Service Independence**: Services own their data and logic

### Why ValKey Payment Sessions?

**Benefits:**

- ✅ No HTTP calls between services (payment has all data in session)
- ✅ Secure (session consumed once, prevents replay)
- ✅ Stateless services (session stored in ValKey)
- ✅ Scalable (works across replicas)
- ✅ Simple (no JWT signing/verification overhead)
- ✅ Auto-expiry (1 hour TTL)

**How It Works:**

1. Order service generates UUID session ID
2. Stores payment data in ValKey: `payment:session:{uuid}`
3. Returns session ID to client as `paymentToken`
4. Client calls payment service with token
5. Payment service retrieves session, deletes it (consume once)
6. Processes payment with session data

---

## Services

### Customer Service (Port 3001)

**Responsibility**: Customer management

**Database**: customer-db (MongoDB)

**Endpoints**:

- `GET /customers` - List all customers
- `GET /customers/:id` - Get customer by ID (for validation)
- `POST /customers/:id/orders` - Add order to customer (notification)

**Seed Data**: Adebayo Okonkwo, Chioma Nwankwo, Emeka Eze, Fatima Bello, Oluwaseun Adeyemi

### Product Service (Port 3002)

**Responsibility**: Product catalog, stock management

**Database**: product-db (MongoDB)

**Cache**: ValKey (stock reservations)

**Endpoints**:

- `GET /products` - List all products
- `GET /products/:id` - Get product by ID
- `POST /products/:id/reserve` - Reserve stock (called by order-service)

**Publishes**: Nothing

**Consumes**: `payment.succeeded` (decrements stock), `payment.failed` (releases reservation)

**Seed Data**: Samsung Galaxy A54 (₦285,000), HP Laptop 15-inch (₦520,000), Wireless Mouse (₦8,500), Mechanical Keyboard (₦35,000), USB-C Charger (₦12,000), Bluetooth Earbuds (₦25,000), External Hard Drive 1TB (₦45,000), Webcam HD (₦28,000)

### Order Service (Port 3003)

**Responsibility**: Order creation, payment session generation, status updates

**Database**: order-db (MongoDB)

**Cache**: ValKey (idempotency keys, payment sessions)

**Endpoints**:

- `POST /orders` - Create order, return payment token
- `GET /orders` - List orders with pagination and filters
- `GET /orders/:id` - Get order details

**Publishes**: Nothing

**Consumes**: `payment.succeeded`, `payment.failed`

**Dependencies**: customer-service, product-service, RabbitMQ, ValKey, MongoDB

### Payment Service (Port 3004)

**Responsibility**: Payment processing, transaction storage

**Database**: payment-db (MongoDB)

**Endpoints**:

- `POST /payments?token={jwt}&simulate=success|failure` - Process payment
- `GET /payments/transactions` - List transactions with pagination and filters
- `GET /payments/transactions/:id` - Get transaction by ID

**Publishes**: `payment.succeeded`, `payment.failed`

**Consumes**: Nothing

**Dependencies**: RabbitMQ, MongoDB

---

## Data Models

### Customer

```typescript
{
  _id: ObjectId,
  name: string,
  email: string,
  createdAt: Date
}
```

### Product

```typescript
{
  _id: ObjectId,
  name: string,
  price: number,
  stock: number,
  createdAt: Date
}
```

### Order

```typescript
{
  _id: ObjectId,
  customerId: string,
  productId: string,
  quantity: number,
  amount: number,  // calculated from product.price * quantity
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'refunded',
  createdAt: Date,
  updatedAt: Date
}
```

### Transaction

```typescript
{
  _id: ObjectId,
  transactionId: string,  // UUID
  orderId: string,
  amount: number,
  status: 'success' | 'failed',
  error?: string,
  createdAt: Date
}
```

### Payment Session (ValKey)

```typescript
{
  orderId: string,
  productId: string,
  quantity: number,
  amount: number,
  createdAt: string  // ISO 8601
}
```

Stored at: `payment:session:{uuid}` with 1 hour TTL

### Events

**payment.succeeded**

```typescript
{
  orderId: string,
  productId: string,
  quantity: number,
  amount: number,
  transactionId: string,
  timestamp: string  // ISO 8601
}
```

**payment.failed**

```typescript
{
  orderId: string,
  productId: string,
  quantity: number,
  amount: number,
  error: string,
  timestamp: string  // ISO 8601
}
```

---

## API Reference

### Create Order

**Endpoint**: `POST /orders`

**Headers**:

- `Content-Type: application/json`
- `x-service-key: super-secret-internal-key-change-in-prod`
- `idempotency-key: <uuid>`

**Request Body**:

```json
{
  "customerId": "67890abcdef1234567890abc",
  "productId": "67890abcdef1234567890def",
  "quantity": 2
}
```

**Response** (201):

```json
{
  "orderId": "67890abcdef1234567890xyz",
  "customerId": "67890abcdef1234567890abc",
  "productId": "67890abcdef1234567890def",
  "quantity": 2,
  "amount": 17000,
  "status": "pending",
  "paymentToken": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Note**: Use `paymentToken` to construct payment URL: `http://localhost:3004/payments?token={paymentToken}`

**Errors**:

- `400` - Missing idempotency-key or invalid request body
- `401` - Missing or invalid x-service-key
- `404` - Customer or product not found
- `409` - Duplicate idempotency key (returns cached order)

### Get Order

**Endpoint**: `GET /orders/:id`

**Headers**:

- `x-service-key: super-secret-internal-key-change-in-prod`

**Response** (200):

```json
{
  "orderId": "67890abcdef1234567890xyz",
  "customerId": "67890abcdef1234567890abc",
  "productId": "67890abcdef1234567890def",
  "quantity": 2,
  "amount": 17000,
  "status": "confirmed",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Note**: `paymentToken` is only included when status is "pending"

**Errors**:

- `401` - Missing or invalid x-service-key
- `404` - Order not found

### Process Payment

**Endpoint**: `POST /payments?token={sessionId}&simulate=success|failure`

**Query Parameters**:

- `token` (required) - Payment session ID from order response
- `simulate` (optional) - `success` or `failure` (for testing)

**Response** (200 for success):

```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "orderId": "67890abcdef1234567890xyz",
  "amount": 17000,
  "status": "success"
}
```

**Response** (402 for failure):

```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440001",
  "orderId": "67890abcdef1234567890xyz",
  "amount": 17000,
  "status": "failed",
  "error": "Payment declined by issuer"
}
```

**Errors**:

- `400` - Missing token parameter
- `409` - Payment session expired or already processed

---

## Security

### Service-to-Service Authentication

**Current**: X-Service-Key header (shared secret)

```typescript
// All inter-service calls require this header
headers: {
  'x-service-key': process.env.SERVICE_API_KEY
}
```

**Production**: Replace with mTLS (mutual TLS)

**Why mTLS?**

- Mutual authentication at TLS layer
- No token management overhead
- Certificate rotation via cert-manager
- Zero-trust network model
- Service mesh (Istio, Linkerd) handles automatically

### Payment Session Security

**Storage**: ValKey (in-memory, distributed)

**Session ID**: UUID v4 (cryptographically random)

**TTL**: 1 hour (auto-expires)

**Consume Once**: Session deleted after first use (prevents replay)

**Why ValKey Sessions over JWT?**

- Simpler (no signing/verification)
- Faster (no crypto overhead)
- Consume-once guarantee (delete after use)
- No shared secret management
- Auto-expiry built-in

**Session Key Format**: `payment:session:{uuid}`

### Idempotency

**Problem**: Client retries create duplicate orders

**Solution**: ValKey-based idempotency

```typescript
// 1. Client generates unique key
idempotency-key: uuid()

// 2. Order service checks ValKey
const cached = await valkey.get(`idempotency:${key}`);
if (cached) return cached;

// 3. Create order and cache
await valkey.set(`idempotency:${key}`, orderId, 'EX', 86400);
```

**TTL**: 24 hours (auto-expires)

**Why ValKey?**

- Distributed (works across replicas)
- Fast (sub-millisecond latency)
- Atomic (SET NX prevents race conditions)

---

## Development

### Prerequisites

- Docker & Docker Compose v2
- Node.js 24+
- jq (for test scripts)

### Local Setup

```bash
# Install dependencies
npm install

# Start infrastructure only
docker compose up mongodb rabbitmq valkey -d

# Run service locally
cd packages/order-service
npm run dev
```

### Project Structure

```
packages/
├── customer-service/
│   ├── src/
│   │   ├── config/          # DB, logger, env
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # Express routes
│   │   ├── middleware/      # Auth middleware
│   │   ├── seed.ts          # Seed script
│   │   └── server.ts        # Entry point
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── order-service/           # + queue/consumer.ts, services/
├── payment-service/         # + queue/publisher.ts, services/
├── product-service/
└── shared/                  # Shared TypeScript types
```

### Code Style

**TypeScript**:

- Use strict mode
- Prefer `const` over `let`
- Use async/await over promises
- Avoid `any` type

**Naming**:

- Files: kebab-case (`order-service.ts`)
- Classes: PascalCase (`OrderService`)
- Functions: camelCase (`createOrder`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)

**Error Handling**:

- Always log errors with context
- Use try/catch for async operations
- Return meaningful error messages
- Don't expose internal errors to clients

### Testing

**Automated Test**:

```bash
./scripts/test-flow.sh
```

**Manual Test**:

```bash
# Get IDs
./scripts/get-ids.sh

# Create order
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{"customerId":"...","productId":"...","quantity":1}'

# Process payment
curl -X POST "{paymentLink}&simulate=success"

# Check order status
curl http://localhost:3003/orders/{orderId} \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

---

## Troubleshooting

### Services Won't Start

**Symptom**: `Error: Cannot connect to MongoDB`

**Solution**:

```bash
# Check infrastructure
docker compose ps

# Wait for health checks (~30s)
docker compose logs mongodb rabbitmq valkey

# Restart
npm run down && npm run dev
```

### Port Already in Use

**Symptom**: `Error: bind: address already in use`

**Solution**:

```bash
# Find process
lsof -i :3003

# Kill process
kill -9 <PID>
```

### Seed Script Fails

**Symptom**: `❌ Customers already seeded`

**Solution**:

```bash
# Delete volumes and reseed
npm run down
npm run dev
npm run seed
```

### Order Creation Fails

**Symptom**: `{"error": "Customer not found"}`

**Solution**:

```bash
# Verify seed data
npm run seed

# Get valid IDs
./scripts/get-ids.sh
```

### JWT Verification Failed

**Symptom**: `401 Unauthorized`

**Solution**:

- Check JWT_SECRET is same in both services
- Check token hasn't expired (1 hour)
- Generate new secret: `npm run generate-keys`

### Order Status Not Updating

**Symptom**: Order stays "pending"

**Solution**:

```bash
# Check RabbitMQ
docker compose logs rabbitmq

# Check order-service consumer
docker compose logs order-service | grep "Consumed payment"

# Check payment-service publisher
docker compose logs payment-service | grep "Published payment"
```

### RabbitMQ Messages Not Processing

**Solution**:

1. Open http://localhost:15672 (guest/guest)
2. Check queues: `payment.succeeded`, `payment.failed`
3. Look for messages stuck in queues
4. Check service logs for errors

### Debugging Tips

**View Logs**:

```bash
# All services
npm run logs

# Specific service
docker compose logs -f order-service

# Last 100 lines
docker compose logs --tail=100 order-service
```

**Inspect Database**:

```bash
# MongoDB
docker compose exec mongodb mongosh
use order-db
db.orders.find().pretty()
```

**Inspect ValKey**:

```bash
# Connect
docker compose exec valkey valkey-cli

# List keys
KEYS *

# Get value
GET idempotency:YOUR-KEY

# Check TTL
TTL idempotency:YOUR-KEY
```

**Inspect RabbitMQ**:

```bash
# List queues
docker compose exec rabbitmq rabbitmqctl list_queues

# List exchanges
docker compose exec rabbitmq rabbitmqctl list_exchanges
```

---

## Production Guide

### What's Missing for Production

#### Infrastructure

**API Gateway**:

- Current: Services exposed directly
- Production: Kong, Traefik, or AWS API Gateway
- Benefits: Rate limiting, auth, routing, SSL termination

**mTLS**:

- Current: X-Service-Key header
- Production: Mutual TLS certificates
- Benefits: Stronger auth, automatic with service mesh

**Distributed Tracing**:

- Current: None
- Production: OpenTelemetry + Jaeger/Zipkin
- Benefits: Trace requests across services, identify bottlenecks

**Centralized Logging**:

- Current: Per-service logs
- Production: ELK stack (Elasticsearch, Logstash, Kibana)
- Benefits: Search logs, create dashboards, set alerts

**Metrics**:

- Current: None
- Production: Prometheus + Grafana
- Benefits: Monitor performance, resource usage, error rates

#### Resilience

**Circuit Breakers**:

- Current: None
- Production: Hystrix or Resilience4j
- Benefits: Prevent cascade failures, fail fast

**Rate Limiting**:

- Current: None
- Production: Rate limiting middleware or API Gateway
- Benefits: Prevent abuse, protect resources

**Outbox Pattern**:

- Current: Direct event publishing
- Production: Transactional outbox
- Benefits: Guaranteed event delivery, no lost messages

#### Business Logic

**Real Payment Gateway**:

- Current: Simulated payment
- Production: Stripe, PayPal, Square
- Benefits: Real transactions, 3D Secure, webhooks

**Inventory Service**:

- Current: None
- Production: Stock management with optimistic locking
- Benefits: Prevent overselling, track inventory

**Notification Service**:

- Current: None
- Production: Email/SMS notifications
- Benefits: Order confirmations, shipping updates

### Deployment

**Current**: Docker Compose (local dev only)

**Production**: Kubernetes

**Kubernetes Resources**:

- Deployments for each service
- Services for internal communication
- Ingress for external traffic
- ConfigMaps for environment variables
- Secrets for sensitive data
- HPA (Horizontal Pod Autoscaler) for scaling
- PersistentVolumes for databases

**CI/CD Pipeline**:

1. Lint + type check
2. Run unit tests
3. Build Docker images
4. Push to registry (ECR, GCR, Docker Hub)
5. Run integration tests
6. Deploy to staging
7. Run E2E tests
8. Deploy to production (blue-green or canary)

### Scaling

**Horizontal Scaling**:

- All services are stateless (except ValKey)
- Can run multiple replicas behind load balancer
- RabbitMQ distributes messages across consumers

**Database Sharding**:

- Each service owns its database
- Can shard by customer ID, region, etc.

**Caching**:

- Add ValKey cache for customer/product lookups
- Reduce DB load by 80-90%

### Cost Optimization

**Development**:

- Docker Compose (free)
- Single MongoDB instance
- Single RabbitMQ instance
- Single ValKey instance

**Production**:

- Managed services (MongoDB Atlas, Amazon MQ, ElastiCache)
- Right-size instances (start small, scale up)
- Spot instances for non-critical workloads
- Auto-scaling (scale down during off-hours)

### Monitoring

**Metrics to Track**:

- Request rate, latency, error rate (RED)
- Queue depth, message processing time
- DB connection pool usage
- Memory and CPU usage

**Alerts**:

- Service down
- High error rate (>5%)
- Queue backlog (>1000 messages)
- DB connection failures
- High latency (>1s)

### Further Reading

- [Microservices Patterns](https://microservices.io/patterns/index.html)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [mTLS in Kubernetes](https://kubernetes.io/docs/tasks/tls/managing-tls-in-a-cluster/)
