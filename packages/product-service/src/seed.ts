import { connectDB, disconnectDB } from './config/db';
import { Product } from './models/Product';
import { logger } from './config/logger';

async function seed() {
  await connectDB();

  const existingCount = await Product.countDocuments();
  if (existingCount > 0) {
    logger.info('Products already seeded, skipping');
    await disconnectDB();
    return;
  }

  const products = [
    { name: 'Samsung Galaxy A54', price: 285000, stock: 50 },
    { name: 'HP Laptop 15-inch', price: 520000, stock: 30 },
    { name: 'Wireless Mouse', price: 8500, stock: 200 },
    { name: 'Mechanical Keyboard', price: 35000, stock: 100 },
    { name: 'USB-C Charger', price: 12000, stock: 150 },
    { name: 'Bluetooth Earbuds', price: 25000, stock: 80 },
    { name: 'External Hard Drive 1TB', price: 45000, stock: 60 },
    { name: 'Webcam HD', price: 28000, stock: 75 },
  ];

  await Product.insertMany(products);
  logger.info({ count: products.length }, 'Products seeded');
  await disconnectDB();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
