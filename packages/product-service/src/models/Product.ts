import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  price: number;
  stock: number;
  createdAt: Date;
}

const productSchema = new Schema<IProduct>({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  createdAt: { type: Date, default: Date.now },
}, {
  toJSON: {
    transform: (_doc, ret) => {
      const obj = ret as Record<string, unknown>;
      obj.id = ret._id.toString();
      delete obj._id;
      delete obj.__v;
      return obj;
    },
  },
});

export const Product = mongoose.model<IProduct>('Product', productSchema);
