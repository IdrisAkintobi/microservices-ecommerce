FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/product-service/package.json ./packages/product-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces

COPY tsconfig.base.json ./
COPY packages/product-service/ ./packages/product-service/
COPY packages/shared/ ./packages/shared/

RUN npm run build -w @microservice/shared
RUN npm run build -w @microservice/product-service

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/product-service/package.json ./packages/product-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --omit=dev

COPY --from=builder /app/packages/product-service/dist ./packages/product-service/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3002

CMD ["npm", "run", "start", "-w", "@microservice/product-service"]
