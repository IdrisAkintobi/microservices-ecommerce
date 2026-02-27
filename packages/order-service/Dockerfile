FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/order-service/package.json ./packages/order-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces

COPY tsconfig.base.json ./
COPY packages/order-service/ ./packages/order-service/
COPY packages/shared/ ./packages/shared/

RUN npm run build -w @microservice/shared
RUN npm run build -w @microservice/order-service

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/order-service/package.json ./packages/order-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --omit=dev

COPY --from=builder /app/packages/order-service/dist ./packages/order-service/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3003

CMD ["npm", "run", "start", "-w", "@microservice/order-service"]
