import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './connection.js';

async function main() {
  console.log('Running migrations...');

  try {
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
