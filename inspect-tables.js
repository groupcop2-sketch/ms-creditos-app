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

  const clients = await client.query(`
    select id_cliente, v_num_identificacion, v_nombre_completo, v_correo, fec_creacion
    from "Creditos"."TBL_CLIENTES_PORTAL"
    order by id_cliente desc
    limit 5
  `);
  console.log('Clientes:');
  console.table(clients.rows);

  await client.end();
}

main().catch(console.error);
