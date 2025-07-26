import { db, client } from './connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Resetting database (dropping all tables and types)...');

  try {
    // Drop table and enum
    await db.execute(sql`DROP TABLE IF EXISTS orders CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS order_status CASCADE`);

    console.log('✅ Database reset completed successfully!');
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
