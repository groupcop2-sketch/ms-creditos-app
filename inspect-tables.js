import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '6543', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  const jumio = await client.query(`
    select * from "Creditos"."TBL_JUMIO_VERIFICACIONES"
    limit 5
  `);
  console.log('Jumio query result:', jumio.rows);

  await client.end();
}

main().catch(console.error);
