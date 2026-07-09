import { supabase } from './supabase.js';

type QueryResult<T> = { rowCount: number; rows: T[] };

type ClientLike = {
  query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
};

class SupabasePoolClient implements ClientLike {
  async query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    return querySupabase<T>(text, values);
  }

  release(): void {
    // no-op for the Supabase-backed client
  }
}

class SupabasePool {
  async query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    return querySupabase<T>(text, values);
  }

  async connect(): Promise<ClientLike> {
    return new SupabasePoolClient();
  }

  async end(): Promise<void> {
    // no-op
  }
}

function normalizeTableName(text: string): string | null {
  const match = text.match(/from\s+"?([A-Za-z0-9_.-]+)"?/i);
  if (match?.[1]) {
    return match[1].split('.').pop() ?? match[1];
  }

  const updateMatch = text.match(/update\s+"?([A-Za-z0-9_.-]+)"?/i);
  if (updateMatch?.[1]) {
    return updateMatch[1].split('.').pop() ?? updateMatch[1];
  }

  const insertMatch = text.match(/insert\s+into\s+"?([A-Za-z0-9_.-]+)"?/i);
  if (insertMatch?.[1]) {
    return insertMatch[1].split('.').pop() ?? insertMatch[1];
  }

  return null;
}

function normalizeColumns(text: string): string | null {
  const selectMatch = text.match(/select\s+(.+?)\s+from/i);
  if (selectMatch?.[1]) {
    const columns = selectMatch[1].trim();
    if (columns === '1' || columns === '*') {
      return '*';
    }

    return columns;
  }

  return '*';
}

function parseInsertStatement(text: string): { table: string | null; columns: string[]; values: unknown[]; returning: string[] } {
  const match = text.match(/insert\s+into\s+"?([A-Za-z0-9_.-]+)"?\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)(?:\s*returning\s+(.+))?/i);
  if (!match) {
    return { table: null, columns: [], values: [], returning: [] };
  }

  const [, rawTable, rawColumns, rawValues, rawReturning] = match;
  const table = rawTable.split('.').pop() ?? rawTable;
  const columns = rawColumns.split(',').map((item) => item.trim()).filter(Boolean);
  const values = rawValues.split(',').map((item) => item.trim()).filter(Boolean);
  const returning = rawReturning
    ? rawReturning.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return { table, columns, values, returning };
}

async function querySupabase<T>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
  const trimmed = text.trim();
  const table = normalizeTableName(trimmed);

  if (!table) {
    return { rowCount: 0, rows: [] };
  }

  if (/^select/i.test(trimmed)) {
    const columns = normalizeColumns(trimmed);
    const selectQuery = supabase.from(table).select(columns);
    const { data, error } = await selectQuery;

    if (error) {
      console.warn(`Supabase query failed for ${table}:`, error.message);
      return { rowCount: 0, rows: [] };
    }

    return { rowCount: data?.length ?? 0, rows: (data ?? []) as T[] };
  }

  if (/^insert/i.test(trimmed)) {
    const { table: insertTable, columns, values: rawValues, returning } = parseInsertStatement(trimmed);
    if (!insertTable) {
      return { rowCount: 0, rows: [] };
    }

    const payload = columns.reduce<Record<string, unknown>>((acc, column, index) => {
      const parsedValue = values?.[index] ?? rawValues[index];
      acc[column] = parsedValue;
      return acc;
    }, {});

    const queryBuilder = supabase.from(insertTable).insert(payload);
    const { data, error } = returning.length
      ? await queryBuilder.select(returning.join(','))
      : await queryBuilder;

    if (error) {
      console.warn(`Supabase insert failed for ${insertTable}:`, error.message);
      return { rowCount: 0, rows: [] };
    }

    return {
      rowCount: data?.length ? data.length : 1,
      rows: (data ?? []) as T[]
    };
  }

  if (/^update/i.test(trimmed)) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.warn(`Supabase update skipped for ${table}:`, error.message);
      return { rowCount: 0, rows: [] };
    }

    return { rowCount: data?.length ?? 0, rows: (data ?? []) as T[] };
  }

  return { rowCount: 0, rows: [] };
}

export const pool = new SupabasePool();
