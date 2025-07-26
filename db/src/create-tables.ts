import { db, client } from './connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Creating orders table and enum...');

  try {
    // Create enum type (with error handling for existing type)
    try {
      await db.execute(sql`
        CREATE TYPE order_status AS ENUM('pending', 'filled', 'cancelled', 'expired')
      `);
      console.log('✅ Created order_status enum');
    } catch (error: any) {
      if (error.code === '42710') {
        console.log('✅ order_status enum already exists');
      } else {
        throw error;
      }
    }

    // Create orders table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        order_hash varchar(66) NOT NULL UNIQUE,
        maker_asset varchar(42) NOT NULL,
        taker_asset varchar(42) NOT NULL,
        making_amount numeric NOT NULL,
        taking_amount numeric NOT NULL,
        maker_address varchar(42) NOT NULL,
        expires_in timestamp NOT NULL,
        signature text NOT NULL,
        maker_traits text NOT NULL,
        extension text NOT NULL,
        status order_status DEFAULT 'pending' NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    console.log('✅ Created orders table');

    console.log('✅ Database setup completed successfully!');
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
