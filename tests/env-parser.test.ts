import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEnvVariables } from '../src/env-parser';
import { extractSchemaInfo } from '../src/schema-transformer';
import { z } from 'zod';

describe('env-parser', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses environment variables based on schema', () => {
    const schema = z.object({
      port: z.number(),
      host: z.string(),
    });

    const info = extractSchemaInfo(schema);

    process.env.PORT = '3000';
    process.env.HOST = 'localhost';

    const config = parseEnvVariables(info, {});

    expect(config.port).toBe(3000);
    expect(config.host).toBe('localhost');
  });

  it('converts string values to numbers for number type', () => {
    const schema = z.object({
      port: z.number(),
    });

    const info = extractSchemaInfo(schema);

    process.env.PORT = '8080';

    const config = parseEnvVariables(info, {});

    expect(config.port).toBe(8080);
    expect(typeof config.port).toBe('number');
  });

  it('converts boolean string values', () => {
    const schema = z.object({
      enableCache: z.boolean(),
    });

    const info = extractSchemaInfo(schema);

    process.env.ENABLE_CACHE = 'true';

    const config = parseEnvVariables(info, {});

    expect(config.enableCache).toBe(true);
  });

  it('handles various boolean string representations', () => {
    const schema = z.object({
      flag1: z.boolean(),
      flag2: z.boolean(),
      flag3: z.boolean(),
      flag4: z.boolean(),
    });

    const info = extractSchemaInfo(schema);

    process.env.FLAG1 = 'true';
    process.env.FLAG2 = '1';
    process.env.FLAG3 = 'yes';
    process.env.FLAG4 = 'TRUE';

    const config = parseEnvVariables(info, {});

    expect(config.flag1).toBe(true);
    expect(config.flag2).toBe(true);
    expect(config.flag3).toBe(true);
    expect(config.flag4).toBe(true);
  });

  it('merges env file config with process.env', () => {
    const schema = z.object({
      port: z.number(),
      host: z.string(),
    });

    const info = extractSchemaInfo(schema);

    process.env.HOST = 'env-host';

    const envFileConfig = {
      PORT: '9000',
    };

    const config = parseEnvVariables(info, envFileConfig);

    expect(config.port).toBe(9000);
    expect(config.host).toBe('env-host');
  });

  it('process.env takes precedence over env file', () => {
    const schema = z.object({
      port: z.number(),
    });

    const info = extractSchemaInfo(schema);

    process.env.PORT = '4000';

    const envFileConfig = {
      PORT: '9000',
    };

    const config = parseEnvVariables(info, envFileConfig);

    expect(config.port).toBe(4000);
  });
});
