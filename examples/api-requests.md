# API Request Examples

This document provides practical examples of API requests using the seeded data.

## Seeded Data

### Customers
- Adebayo Okonkwo (adebayo.okonkwo@example.ng)
- Chioma Nwankwo (chioma.nwankwo@example.ng)
- Emeka Eze (emeka.eze@example.ng)
- Fatima Bello (fatima.bello@example.ng)
- Oluwaseun Adeyemi (oluwaseun.adeyemi@example.ng)

### Products
- Samsung Galaxy A54 - ₦285,000 (50 in stock)
- HP Laptop 15-inch - ₦520,000 (30 in stock)
- Wireless Mouse - ₦8,500 (200 in stock)
- Mechanical Keyboard - ₦35,000 (100 in stock)
- USB-C Charger - ₦12,000 (150 in stock)
- Bluetooth Earbuds - ₦25,000 (80 in stock)
- External Hard Drive 1TB - ₦45,000 (60 in stock)
- Webcam HD - ₦28,000 (75 in stock)

## Getting Started

### 1. Get Customer and Product IDs

```bash
./scripts/get-ids.sh
```

Example output:
```
👥 Customers:
   ID: 67890abcdef1234567890001 | Name: Adebayo Okonkwo | Email: adebayo.okonkwo@example.ng
   ID: 67890abcdef1234567890002 | Name: Chioma Nwankwo | Email: chioma.nwankwo@example.ng
   ...

📦 Products:
   ID: 67890abcdef1234567890101 | Name: Samsung Galaxy A54 | Price: ₦285,000
   ID: 67890abcdef1234567890102 | Name: HP Laptop 15-inch | Price: ₦520,000
   ...
```

## Complete Order Flow

### Step 1: Create Order

```bash
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{
    "customerId": "67890abcdef1234567890001",
    "productId": "67890abcdef1234567890103",
    "quantity": 2
  }'
```

Response:
```json
{
  "orderId": "67890abcdef1234567890201",
  "customerId": "67890abcdef1234567890001",
  "productId": "67890abcdef1234567890103",
  "quantity": 2,
  "amount": 17000,
  "status": "pending",
  "paymentToken": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### Step 2: Process Payment (Success)

```bash
curl -X POST "http://localhost:3004/payments?token=550e8400-e29b-41d4-a716-446655440000&simulate=success"
```

Response:
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440001",
  "orderId": "67890abcdef1234567890201",
  "amount": 17000,
  "status": "success"
}
```

### Step 3: Check Order Status

```bash
curl http://localhost:3003/orders/67890abcdef1234567890201 \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

Response:
```json
{
  "orderId": "67890abcdef1234567890201",
  "customerId": "67890abcdef1234567890001",
  "productId": "67890abcdef1234567890103",
  "quantity": 2,
  "amount": 17000,
  "status": "confirmed",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

Note: `paymentToken` is not included when status is not "pending"

## Testing Scenarios

### Scenario 1: Successful Order (Wireless Mouse)

```bash
# Create order for 2 wireless mice
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: order-mouse-$(date +%s)" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "productId": "WIRELESS_MOUSE_ID",
    "quantity": 2
  }'

# Process payment (success)
curl -X POST "http://localhost:3004/payments?token=PAYMENT_TOKEN&simulate=success"
```

Expected: Order confirmed, stock decremented by 2

### Scenario 2: Failed Payment (HP Laptop)

```bash
# Create order for 1 HP Laptop
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: order-laptop-$(date +%s)" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "productId": "HP_LAPTOP_ID",
    "quantity": 1
  }'

# Process payment (failure)
curl -X POST "http://localhost:3004/payments?token=PAYMENT_TOKEN&simulate=failure"
```

Expected: Order status "failed", stock reservation released

### Scenario 3: Idempotency Test

```bash
IDEMPOTENCY_KEY="test-idempotency-$(uuidgen)"

# First request
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $IDEMPOTENCY_KEY" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "productId": "PRODUCT_ID",
    "quantity": 1
  }'

# Second request (same key)
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $IDEMPOTENCY_KEY" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "productId": "PRODUCT_ID",
    "quantity": 1
  }'
```

Expected: Both requests return same orderId

### Scenario 4: Insufficient Stock

```bash
# Try to order 300 wireless mice (only 200 in stock)
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: order-bulk-$(date +%s)" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "productId": "WIRELESS_MOUSE_ID",
    "quantity": 300
  }'
```

Expected: 409 Conflict with error "Insufficient stock"

### Scenario 5: Invalid Customer

```bash
curl -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{
    "customerId": "000000000000000000000000",
    "productId": "PRODUCT_ID",
    "quantity": 1
  }'
```

Expected: 404 Not Found with error "Customer not found"

### Scenario 6: Expired Payment Session

```bash
# Create order
ORDER_RESPONSE=$(curl -s -X POST http://localhost:3003/orders \
  -H "Content-Type: application/json" \
  -H "x-service-key: super-secret-internal-key-change-in-prod" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "productId": "PRODUCT_ID",
    "quantity": 1
  }')

PAYMENT_TOKEN=$(echo $ORDER_RESPONSE | jq -r '.paymentToken')

# Wait for session to expire (or manually delete from ValKey)
# docker compose exec valkey valkey-cli DEL payment:session:$PAYMENT_TOKEN

# Try to pay
curl -X POST "http://localhost:3004/payments?token=$PAYMENT_TOKEN&simulate=success"
```

Expected: 409 Conflict with error "Payment session expired or already processed"

## Customer Service

### List All Customers

```bash
curl http://localhost:3001/customers \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

### Get Customer by ID

```bash
curl http://localhost:3001/customers/CUSTOMER_ID \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

## Product Service

### List All Products

```bash
curl http://localhost:3002/products \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

### Get Product by ID

```bash
curl http://localhost:3002/products/PRODUCT_ID \
  -H "x-service-key: super-secret-internal-key-change-in-prod"
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "idempotency-key header is required"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "error": "Customer not found"
}
```

### 409 Conflict (Insufficient Stock)
```json
{
  "error": "Insufficient stock",
  "available": 50,
  "requested": 100
}
```

### 409 Conflict (Expired Session)
```json
{
  "error": "Payment session expired or already processed"
}
```

## Automated Testing

Use the provided test script:

```bash
./scripts/test-flow.sh
```

This script:
1. Gets customer and product IDs
2. Creates an order
3. Tests idempotency
4. Processes payment
5. Checks order status
6. Verifies stock was decremented

## Tips

1. Always use unique idempotency keys (use `$(uuidgen)` or `$(date +%s)`)
2. Save customer and product IDs from `./scripts/get-ids.sh` for reuse
3. Check RabbitMQ UI (http://localhost:15672) to see event flow
4. Use `docker compose logs -f <service>` to debug issues
5. Payment sessions expire after 1 hour
6. Stock reservations expire after 1 hour if payment not completed
