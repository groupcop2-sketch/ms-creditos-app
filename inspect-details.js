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

async function inspectTable(tableName) {
  const cols = await client.query(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'Creditos' and table_name = $1
    order by ordinal_position
  `, [tableName]);
  console.log(`\n=== Columns for ${tableName} ===`);
  console.table(cols.rows);

  const sample = await client.query(`select * from "Creditos"."${tableName}" limit 5`);
  console.log(`Sample rows for ${tableName}:`, sample.rows);
}

async function main() {
  await client.connect();

  await inspectTable('TBL_BANCOS');
  await inspectTable('TBL_TASAS_INVERSION');
  await inspectTable('TBL_PARAMETROS_FINANCIEROS');

  // Let's also check if there are any other tables with tasa, mora, plazo, formato
  const searchTables = await client.query(`
    select table_name from information_schema.tables 
    where table_schema = 'Creditos' 
    and (
      table_name ilike '%tasa%' 
      or table_name ilike '%mora%' 
      or table_name ilike '%plazo%' 
      or table_name ilike '%formato%' 
      or table_name ilike '%interes%'
      or table_name ilike '%usura%'
    )
  `);
  console.log('\nMatching tables for tasa/mora/plazo/formato:', searchTables.rows);

  await client.end();
}

main().catch(console.error);
