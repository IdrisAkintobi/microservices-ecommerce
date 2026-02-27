#!/bin/bash
set -e

echo "🌱 Seeding databases..."

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Seed customers
echo "👥 Seeding customers..."
docker compose exec customer-service npm run seed -w @microservice/customer-service || true

# Seed products
echo "📦 Seeding products..."
docker compose exec product-service npm run seed -w @microservice/product-service || true

echo "✅ Seeding complete!"
