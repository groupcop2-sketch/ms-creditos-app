import pg from 'pg';
// Creamos un Pool real de PostgreSQL (usa las variables PGHOST, PGUSER, PGPASSWORD, etc.)
export const pool = new pg.Pool();
