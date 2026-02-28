/**
 * Shared type definitions for cross-service communication.
 *
 * ALL exports are type-only — they are completely erased at compile time
 * and produce zero runtime JavaScript. This package has no dependencies.
 *
 * In production, these would live in a versioned private npm package
 * or be generated from a protobuf/OpenAPI schema.
 */

// ── Order lifecycle state machine ──────────────────────────────────────────
//
//   pending → confirmed (payment succeeded)
//          → failed (payment failed)
//          → cancelled (user cancelled)
//   confirmed → refunded (payment refunded)
//
export type OrderStatus =
  | 'pending'     // order created, awaiting payment
  | 'confirmed'   // payment succeeded
  | 'failed'      // payment failed
  | 'cancelled'   // user cancelled
  | 'refunded';   // payment refunded

// ── Payment outcome ────────────────────────────────────────────────────────
export type TransactionStatus = 'success' | 'failed';

// ── RabbitMQ event payloads ────────────────────────────────────────────────

/**
 * Published by: payment-service  →  exchange: microservice, key: payment.succeeded
 * Consumed by:  order-service (updates order status), product-service (decrements stock)
 */
export interface PaymentSucceededEvent {
  orderId: string;
  productId: string;
  quantity: number;
  amount: number;
  transactionId: string;
  timestamp: string; // ISO 8601
}

/**
 * Published by: payment-service  →  exchange: microservice, key: payment.failed
 * Consumed by:  order-service (updates order status), product-service (releases reservation)
 */
export interface PaymentFailedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  amount: number;
  error: string;
  timestamp: string; // ISO 8601
}

// ── Inbound HTTP request bodies ────────────────────────────────────────────

export interface CreateOrderRequest {
  customerId: string;
  productId: string;
  quantity: number;
}

export interface ProcessPaymentRequest {
  orderId: string;
  paymentMethod?: {
    type: 'card' | 'paypal';
    token: string;
  };
}

// ── Outbound HTTP response shapes ──────────────────────────────────────────

export interface OrderResponse {
  orderId: string;
  customerId: string;
  productId: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  paymentLink?: string; // Only present when status is 'pending'
  createdAt: string;
}

export interface PaymentResponse {
  transactionId: string;
  orderId: string;
  amount: number;
  status: 'success' | 'failed';
  error?: string;
}
