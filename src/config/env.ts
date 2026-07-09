import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

function loadEnvFile() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '.env'),
    resolve(process.cwd(), '..', '..', '.env')
  ];

  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (!envPath) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().default(''),
  PGDATABASE: z.string().default('P&S'),
  JWT_SECRET: z.string().min(1).default('dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  DATABASE_URL: z.string().optional(),
  APP_PUBLIC_URL: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ZAPSIGN_API_URL: z.string().default('https://api.zapsign.com.br/api/v1'),
  ZAPSIGN_API_TOKEN: z.string().optional(),
  ZAPSIGN_WEBHOOK_SECRET: z.string().optional()
});

export const env = envSchema.parse(process.env);
