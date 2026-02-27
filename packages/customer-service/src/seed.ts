import { connectDB, disconnectDB } from './config/db';
import { Customer } from './models/Customer';
import { logger } from './config/logger';

async function seed() {
  await connectDB();

  const existingCount = await Customer.countDocuments();
  if (existingCount > 0) {
    logger.info('Customers already seeded, skipping');
    await disconnectDB();
    return;
  }

  const customers = [
    { name: 'Adebayo Okonkwo', email: 'adebayo.okonkwo@example.ng' },
    { name: 'Chioma Nwankwo', email: 'chioma.nwankwo@example.ng' },
    { name: 'Emeka Eze', email: 'emeka.eze@example.ng' },
    { name: 'Fatima Bello', email: 'fatima.bello@example.ng' },
    { name: 'Oluwaseun Adeyemi', email: 'oluwaseun.adeyemi@example.ng' },
  ];

  await Customer.insertMany(customers);
  logger.info({ count: customers.length }, 'Customers seeded');
  await disconnectDB();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
