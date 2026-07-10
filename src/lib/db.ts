import pg from 'pg';

export type QueryResult<T> = { rowCount: number; rows: T[] };

export interface ClientLike {
  query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

// Creamos un Pool real de PostgreSQL (usa las variables PGHOST, PGUSER, PGPASSWORD, etc.)
export const pool = new pg.Pool();

