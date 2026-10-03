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
    select id_empresa, v_codigo, v_razon_social
    from "Creditos"."TBL_EMPRESAS"
  `);
  console.log('Empresas:');
  console.table(tables.rows);

  await client.end();
}

main().catch(console.error);
