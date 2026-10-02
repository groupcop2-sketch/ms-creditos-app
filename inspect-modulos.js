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

  const modulos = await client.query('select id_modulo, v_nom_modulo, v_desc_modulo from "Creditos"."TBL_MODULOS" order by id_modulo');
  console.log(JSON.stringify(modulos.rows, null, 2));

  const submodulos = await client.query('select * from "Creditos"."TBL_SUB_MODULOS" order by id_sub_modulo');
  console.log('=== TBL_SUB_MODULOS ===');
  console.table(submodulos.rows);

  await client.end();
}

main().catch(console.error);
