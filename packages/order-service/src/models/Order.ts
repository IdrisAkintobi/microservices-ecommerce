import mongoose, { Schema, Document } from 'mongoose';
import type { OrderStatus } from '@microservice/shared';

export interface IOrder extends Document {
  customerId: string;
  productId: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    customerId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform: (_doc, ret) => {
        const obj = ret as Record<string, unknown>;
        obj.id = ret._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      },
    },
  }
);

// Compound indexes for common query patterns
orderSchema.index({ customerId: 1, createdAt: -1 }); // Customer's orders by date
orderSchema.index({ status: 1, createdAt: -1 }); // Orders by status and date

orderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const Order = mongoose.model<IOrder>('Order', orderSchema);
