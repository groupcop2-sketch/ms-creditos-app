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

async function migrate() {
  console.log('--- Migrating TBL_ASESORES and TBL_COMERCIALES to reference TBL_FINANCIERA ---');

  // 1. Add id_financiera column to TBL_ASESORES
  await pool.query(`
    ALTER TABLE "Creditos"."TBL_ASESORES"
      ADD COLUMN IF NOT EXISTS id_financiera INTEGER NULL REFERENCES "Creditos"."TBL_FINANCIERA"(id_financiera);
  `);
  console.log('Added id_financiera to TBL_ASESORES');

  // 2. Add id_financiera column to TBL_COMERCIALES
  await pool.query(`
    ALTER TABLE "Creditos"."TBL_COMERCIALES"
      ADD COLUMN IF NOT EXISTS id_financiera INTEGER NULL REFERENCES "Creditos"."TBL_FINANCIERA"(id_financiera);
  `);
  console.log('Added id_financiera to TBL_COMERCIALES');

  // 3. Make id_libranzera nullable on TBL_ASESORES and TBL_COMERCIALES if it was NOT NULL
  await pool.query(`
    ALTER TABLE "Creditos"."TBL_ASESORES" ALTER COLUMN id_libranzera DROP NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE "Creditos"."TBL_COMERCIALES" ALTER COLUMN id_libranzera DROP NOT NULL;
  `);
  console.log('Made id_libranzera nullable on both tables');

  // 4. Update existing records with matching id_financiera from TBL_FINANCIERA
  await pool.query(`
    UPDATE "Creditos"."TBL_ASESORES" a
    SET id_financiera = f.id_financiera
    FROM "Creditos"."TBL_FINANCIERA" f
    WHERE a.id_financiera IS NULL
      AND (a.id_libranzera = f.id_libranzera OR f.id_financiera = 1);
  `);

  await pool.query(`
    UPDATE "Creditos"."TBL_COMERCIALES" c
    SET id_financiera = f.id_financiera
    FROM "Creditos"."TBL_FINANCIERA" f
    WHERE c.id_financiera IS NULL
      AND (c.id_libranzera = f.id_libranzera OR f.id_financiera = 1);
  `);
  console.log('Updated existing rows with id_financiera = 1 (P&S Soluciones Financieras SAS)');

  // 5. Verify
  const r1 = await pool.query('SELECT id_asesor, id_financiera, id_libranzera, v_nombre_completo FROM "Creditos"."TBL_ASESORES"');
  console.log('TBL_ASESORES updated:', r1.rows);
  const r2 = await pool.query('SELECT id_comercial, id_financiera, id_libranzera, v_nombre_completo FROM "Creditos"."TBL_COMERCIALES"');
  console.log('TBL_COMERCIALES updated:', r2.rows);

  await pool.end();
}

migrate().catch(console.error);
