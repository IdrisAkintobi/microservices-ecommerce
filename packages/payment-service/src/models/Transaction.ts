import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  transactionId: string;
  orderId: string;
  amount: number;
  status: 'success' | 'failed';
  error?: string;
  createdAt: Date;
}

const transactionSchema = new Schema<ITransaction>({
  transactionId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  status: { 
    type: String, 
    enum: ['success', 'failed'],
    required: true 
  },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
}, {
  toJSON: {
    transform: (_doc, ret) => {
      const obj = ret as Record<string, unknown>;
      obj.id = ret._id.toString();
      delete obj._id;
      delete obj.__v;
      return obj;
    }
  }
});

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
