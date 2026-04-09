import { loadEnvFile } from './loader';
import { parseEnvVariables } from './env-parser';
import { parseCliArguments } from './cli-parser';
import {
  extractSchemaInfo,
  extractDefaults,
  normalizeToZodObject,
  type ConfigInput,
} from './schema-transformer';
import type { SchemaDescriptor } from './schema-transformer';
import { hideBin } from 'yargs/helpers';

export type ConfigSource = 'cli' | 'env' | 'envFile' | 'default';

export interface ConfigSourceInfo {
  source: ConfigSource;
  rawValue?: string;
}

function formatValue(value: unknown, isSecret: boolean): string {
  if (isSecret) return '***';
  return String(value ?? '');
}

function formatSourceMapEntry(
  info: SchemaDescriptor,
  result: Record<string, unknown>,
  map: Record<string, ConfigSourceInfo>
): void {
  const lines: string[] = ['[konfuz] Resolved configuration:\n'];

  for (const field of info.fields) {
    const name = field.name;
    const isSecret = !!field.secret;
    const displayValue = formatValue(
      result[name],
      isSecret && map[name]?.source !== 'default'
    );
    const src = map[name]?.source ?? 'unknown';

    lines.push(`  ${name}  ${displayValue.padEnd(20)} (${src})`);
  }

  console.log(lines.join('\n'));
}

/**
 * Re-runs the same configuration resolution done by `configure()` and prints
 * a table showing where each value came from: CLI argument, environment variable,
 * `.env` file, or schema default.
 *
 * This is a standalone utility — it does not validate or return the config.
 */
export function printConfiguredSources<T extends ConfigInput>(
  config: T,
  options?: { envPath?: string | string[]; argv?: string[] }
): void {
  const info = extractSchemaInfo(config as any);
  const schema = normalizeToZodObject(config as any);
  const defaults = extractDefaults(schema.shape);

  const envFileConfig = options?.envPath
    ? loadEnvFile(options.envPath)
    : loadEnvFile();

  const { config: envConfig } = parseEnvVariables(info, envFileConfig);
  const cliConfig: Record<string, unknown> = parseCliArguments(info, {
    argv: options?.argv,
  }) as any;

  const merged: Record<string, unknown> = {
    ...defaults,
    ...envConfig,
    ...cliConfig,
  };

  const noCliArgs = (options?.argv ?? hideBin(process.argv)).length === 0;

  const map: Record<string, ConfigSourceInfo> = {};

  for (const field of info.fields) {
    const name = field.name;
    if (!(name in merged)) continue;

    const cliValue = cliConfig[name];
    const envVal = process.env[field.envName];
    const envFileRaw = envFileConfig[field.envName];

    if (cliValue !== undefined && !(noCliArgs && defaults[name] === cliValue)) {
      map[name] = { source: 'cli', rawValue: String(cliValue) };
    } else if (envVal !== undefined) {
      map[name] = { source: 'env', rawValue: envVal };
    } else if (envFileRaw !== undefined) {
      map[name] = { source: 'envFile', rawValue: envFileRaw };
    } else {
      map[name] = { source: 'default' };
    }
  }

  formatSourceMapEntry(info, merged, map);
}
