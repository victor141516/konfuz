import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    const schema = {
      konfuzTestPort: z.number(),
      konfuzTestHost: z.string(),
    };

    const info = extractSchemaInfo(schema);

    process.env.KONFUZ_TEST_PORT = '3000';
    process.env.KONFUZ_TEST_HOST = 'localhost';

    const config = parseEnvVariables(info, {});

    expect(config.konfuzTestPort).toBe(3000);
    expect(config.konfuzTestHost).toBe('localhost');
  });

  it('converts string values to numbers for number type', () => {
    const schema = {
      konfuzTestPort: z.number(),
    };

    const info = extractSchemaInfo(schema);

    process.env.KONFUZ_TEST_PORT = '8080';

    const config = parseEnvVariables(info, {});

    expect(config.konfuzTestPort).toBe(8080);
    expect(typeof config.konfuzTestPort).toBe('number');
  });

  it('converts boolean string values', () => {
    const schema = {
      konfuzTestEnableCache: z.boolean(),
    };

    const info = extractSchemaInfo(schema);

    process.env.KONFUZ_TEST_ENABLE_CACHE = 'true';

    const config = parseEnvVariables(info, {});

    expect(config.konfuzTestEnableCache).toBe(true);
  });

  it('handles various boolean string representations', () => {
    const schema = {
      konfuzTestFlag1: z.boolean(),
      konfuzTestFlag2: z.boolean(),
      konfuzTestFlag3: z.boolean(),
      konfuzTestFlag4: z.boolean(),
    };

    const info = extractSchemaInfo(schema);

    process.env.KONFUZ_TEST_FLAG1 = 'true';
    process.env.KONFUZ_TEST_FLAG2 = '1';
    process.env.KONFUZ_TEST_FLAG3 = 'yes';
    process.env.KONFUZ_TEST_FLAG4 = 'TRUE';

    const config = parseEnvVariables(info, {});

    expect(config.konfuzTestFlag1).toBe(true);
    expect(config.konfuzTestFlag2).toBe(true);
    expect(config.konfuzTestFlag3).toBe(true);
    expect(config.konfuzTestFlag4).toBe(true);
  });

  it('merges env file config with process.env', () => {
    const schema = {
      konfuzTestPort: z.number(),
      konfuzTestHost: z.string(),
    };

    const info = extractSchemaInfo(schema);

    process.env.KONFUZ_TEST_HOST = 'env-host';

    const envFileConfig = {
      KONFUZ_TEST_PORT: '9000',
    };

    const config = parseEnvVariables(info, envFileConfig);

    expect(config.konfuzTestPort).toBe(9000);
    expect(config.konfuzTestHost).toBe('env-host');
  });

  it('process.env takes precedence over env file', () => {
    const schema = {
      konfuzTestPort: z.number(),
    };

    const info = extractSchemaInfo(schema);

    process.env.KONFUZ_TEST_PORT = '4000';

    const envFileConfig = {
      KONFUZ_TEST_PORT: '9000',
    };

    const config = parseEnvVariables(info, envFileConfig);

    expect(config.konfuzTestPort).toBe(4000);
  });
});
