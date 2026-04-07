import { parse } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface EnvFileConfig {
  [key: string]: string;
}

export function loadEnvFile(envPath?: string): EnvFileConfig {
  const path = envPath ?? resolve(process.cwd(), '.env');

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = parse(content);
    return parsed;
  } catch {
    return {};
  }
}
