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

  const intRows = await client.query(`
    select * from "Creditos"."TBL_INTEGRACIONES"
  `);
  console.log('Integraciones:');
  console.table(intRows.rows);

  const finRows = await client.query(`
    select * from "Creditos"."TBL_FINANCIERA"
  `);
  console.log('Financieras:');
  console.table(finRows.rows);

  const finIntRows = await client.query(`
    select tif.*, i.codigo as cod_integracion
    from "Creditos"."TBL_INTEGRACIONES_FINANCIERA" tif
    join "Creditos"."TBL_INTEGRACIONES" i on i.id_integracion = tif.id_integracion
  `);
  console.log('Integraciones por Financiera:');
  console.table(finIntRows.rows);

  await client.end();
}

main().catch(console.error);
