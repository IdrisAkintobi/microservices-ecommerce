import { connectDB, disconnectDB } from './config/db';
import { Customer } from './models/Customer';
import { logger } from './config/logger';

async function seed() {
  await connectDB();

  const customers = [
    { name: 'Adebayo Okonkwo', email: 'adebayo.okonkwo@example.ng' },
    { name: 'Chioma Nwankwo', email: 'chioma.nwankwo@example.ng' },
    { name: 'Emeka Eze', email: 'emeka.eze@example.ng' },
    { name: 'Fatima Bello', email: 'fatima.bello@example.ng' },
    { name: 'Oluwaseun Adeyemi', email: 'oluwaseun.adeyemi@example.ng' },
  ];

  let created = 0;
  let updated = 0;

  for (const customerData of customers) {
    try {
      const result = await Customer.findOneAndUpdate(
        { email: customerData.email }, // Find by unique field
        customerData, // Update data
        {
          upsert: true, // Create if doesn't exist
          new: true, // Return updated document
          setDefaultsOnInsert: true, // Set defaults on insert
        }
      );

      if (result.isNew) {
        created++;
      } else {
        updated++;
      }
    } catch (err) {
      logger.error({ err, email: customerData.email }, 'Failed to upsert customer');
    }
  }

  logger.info({ created, updated, total: customers.length }, 'Customer seeding completed');
  await disconnectDB();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
