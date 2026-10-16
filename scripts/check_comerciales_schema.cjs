const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 6543,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const c1 = await pool.query('SELECT count(*)::int as count FROM "Creditos"."TBL_COMERCIALES"');
  console.log('TBL_COMERCIALES count:', c1.rows[0].count);
  const c2 = await pool.query('SELECT count(*)::int as count FROM "Creditos"."TBL_ASESORES"');
  console.log('TBL_ASESORES count:', c2.rows[0].count);
  const c3 = await pool.query('SELECT * FROM "Creditos"."TBL_ASESORES" LIMIT 5');
  console.log('TBL_ASESORES samples:', c3.rows);
  const c4 = await pool.query('SELECT * FROM "Creditos"."TBL_COMERCIALES" LIMIT 5');
  console.log('TBL_COMERCIALES samples:', c4.rows);
  await pool.end();
}
check().catch(console.error);
