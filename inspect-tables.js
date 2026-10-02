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

  const tables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('Creditos', 'public')
    order by table_schema, table_name
  `);
  console.log('Tables in Creditos and public:');
  console.table(tables.rows);

  await client.end();
}

main().catch(console.error);
