const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const hash = await bcrypt.hash('Admin123*', 10);
  await pool.query('UPDATE "Creditos"."TBL_USUARIOS" SET "v_contraseña" = $1 WHERE "v_nom_usuario" = $2', [hash, 'admin']);
  // check if admin user exists
  const check = await pool.query('SELECT id_usuario, v_nom_usuario, v_correo FROM "Creditos"."TBL_USUARIOS" WHERE v_nom_usuario = $1', ['admin']);
  if (check.rows.length === 0) {
    // update valeplaba or add admin
    console.log('Admin does not exist, setting password for valeplaba@hotmail.com');
    await pool.query('UPDATE "Creditos"."TBL_USUARIOS" SET "v_contraseña" = $1 WHERE "v_nom_usuario" = $2', [hash, 'valeplaba@hotmail.com']);
  }
  console.log('Password set to Admin123*');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
