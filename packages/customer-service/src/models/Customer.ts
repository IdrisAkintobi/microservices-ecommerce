import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomer extends Document {
  name: string;
  email: string;
  createdAt: Date;
}

const customerSchema = new Schema<ICustomer>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
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

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema);
