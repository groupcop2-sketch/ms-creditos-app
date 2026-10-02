const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT v_nom_usuario, v_correo FROM "Creditos"."TBL_USUARIOS" LIMIT 5')
  .then(res => {
    console.log('USUARIOS:', res.rows);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
