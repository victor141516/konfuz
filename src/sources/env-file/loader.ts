import { parse } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface EnvFileConfig {
  [key: string]: string;
}

function loadSingleEnvFile(envPath: string): EnvFileConfig {
  try {
    const content = readFileSync(envPath, 'utf-8');
    return parse(content);
  } catch {
    return {};
  }
}

export function loadEnvFile(envPath?: string | string[]): EnvFileConfig {
  if (Array.isArray(envPath)) {
    return envPath.reduce<EnvFileConfig>((acc, p) => {
      return { ...acc, ...loadSingleEnvFile(p) };
    }, {});
  }

  const path = envPath ?? resolve(process.cwd(), '.env');
  return loadSingleEnvFile(path);
}
