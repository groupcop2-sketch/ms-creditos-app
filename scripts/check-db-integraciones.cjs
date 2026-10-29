const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '6543', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const cat = await pool.query('select * from "Creditos"."TBL_INTEGRACIONES"');
  console.log('--- TBL_INTEGRACIONES ---');
  console.log(cat.rows);

  const rel = await pool.query(`
    select tif.id_integracion_financiera, tif.id_financiera, tif.id_integracion, i.codigo, tif.client_id, tif.api_key, tif.ind_activo
    from "Creditos"."TBL_INTEGRACIONES_FINANCIERA" tif
    join "Creditos"."TBL_INTEGRACIONES" i on i.id_integracion = tif.id_integracion
  `);
  console.log('--- TBL_INTEGRACIONES_FINANCIERA ---');
  console.log(rel.rows);
  await pool.end();
}

main().catch(console.error);
