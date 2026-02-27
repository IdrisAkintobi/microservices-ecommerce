FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/payment-service/package.json ./packages/payment-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces

COPY tsconfig.base.json ./
COPY packages/payment-service/ ./packages/payment-service/
COPY packages/shared/ ./packages/shared/

RUN npm run build -w @microservice/shared
RUN npm run build -w @microservice/payment-service

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/payment-service/package.json ./packages/payment-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --omit=dev

COPY --from=builder /app/packages/payment-service/dist ./packages/payment-service/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3004

CMD ["npm", "run", "start", "-w", "@microservice/payment-service"]
