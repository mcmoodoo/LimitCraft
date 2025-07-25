import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const query = async (text: string, params?: any[]): Promise<pg.QueryResult<any>> => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export const getClient = async (): Promise<pg.PoolClient> => {
  const client = await pool.connect();
  const originalQuery = client.query;
  const originalRelease = client.release;
  
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Add type-safe query wrapper
  (client as any).query = ((...args: any[]) => {
    (client as any).lastQuery = args;
    return originalQuery.apply(client, args);
  });
  
  client.release = ((releaseConnection?: boolean) => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease.call(client, releaseConnection);
  }) as typeof client.release;
  
  return client;
};

export default pool;