import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import {
  extractSchemaInfo,
  normalizeToZodObject,
} from '../src/schema-transformer';
import { resolveConfigSources } from '../src/source-resolution/resolver';

describe('source-resolver', () => {
  const testDir = join(process.cwd(), '.temp-source-resolver');
  const envPath = join(testDir, '.env');
  const defaultPath = join(testDir, 'default.json');
  const explicitPath = join(testDir, 'explicit.json');
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('resolves config values and source ledger through one interface', () => {
    const config = {
      port: z.number(),
      host: z.string(),
      debug: z.boolean(),
    };
    const info = extractSchemaInfo(config);
    const schema = normalizeToZodObject(config);

    writeFileSync(
      defaultPath,
      JSON.stringify({ port: 1000, host: 'default-host', debug: false })
    );
    writeFileSync(envPath, 'PORT=2000\nHOST=env-file-host\n');
    writeFileSync(
      explicitPath,
      JSON.stringify({ port: 3000, host: 'explicit-host', debug: true })
    );
    process.env.HOST = 'env-host';

    const result = resolveConfigSources(info, schema.shape, {
      configFile: defaultPath,
      envPath,
      argv: ['--config-file', explicitPath, '--port', '5000'],
    });

    expect(result.config).toEqual({
      port: 5000,
      host: 'env-host',
      debug: true,
    });
    expect(result.sources.port.finalSource).toBe('cli');
    expect(result.sources.host.finalSource).toBe('env');
    expect(result.sources.debug.finalSource).toBe('configFile');
    expect(result.sources.debug.defaultConfigFile).toBeUndefined();
  });
});
