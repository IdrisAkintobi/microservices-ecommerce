FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/customer-service/package.json ./packages/customer-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces

COPY tsconfig.base.json ./
COPY packages/customer-service/ ./packages/customer-service/
COPY packages/shared/ ./packages/shared/

RUN npm run build -w @microservice/shared
RUN npm run build -w @microservice/customer-service

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/customer-service/package.json ./packages/customer-service/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --omit=dev

COPY --from=builder /app/packages/customer-service/dist ./packages/customer-service/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@microservice/customer-service"]
