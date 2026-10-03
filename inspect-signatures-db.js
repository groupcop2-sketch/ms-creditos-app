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
  const tables = [
    'TBL_CREDITO_FIRMAS',
    'TBL_CREDITO_FIRMA_EVENTOS',
    'TBL_DOCUMENTO_FIRMANTES',
    'TBL_CREDITO_DOCUMENTOS',
    'TBL_DOCUMENTOS_GENERADOS',
    'TBL_PLANTILLAS_DOCUMENTO'
  ];

  for (const t of tables) {
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'Creditos' AND table_name = $1
      ORDER BY ordinal_position;
    `, [t]);
    console.log(`\n=================== Creditos.${t} ===================`);
    cols.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable}, default: ${r.column_default})`));

    const count = await client.query(`SELECT count(*) FROM "Creditos"."${t}";`);
    console.log(`Rows: ${count.rows[0].count}`);
  }

  await client.end();
}

main().catch(console.error);
