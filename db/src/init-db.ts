import postgres from 'postgres';

const dbName = process.env.DB_NAME || 'our-limit-order-db';
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/postgres`;

async function main() {
  console.log(`Creating database "${dbName}" if it doesn't exist...`);

  const client = postgres(connectionString, {
    max: 1,
  });

  try {
    await client`CREATE DATABASE ${client(dbName)}`;
    console.log(`✅ Database "${dbName}" created successfully!`);
  } catch (error: any) {
    if (error.code === '42P04') {
      console.log(`✅ Database "${dbName}" already exists.`);
    } else {
      console.error('❌ Database creation failed:', error);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main();
