import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, customConfigElement } from '../src/index';
import { z } from 'zod';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('configure', () => {
  const testDir = join(process.cwd(), 'test-env-temp');
  const envPath = join(testDir, '.env');

  const originalArgv = process.argv;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'argv', {
      value: originalArgv,
      writable: true,
    });
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (existsSync(envPath)) {
      unlinkSync(envPath);
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'argv', {
      value: originalArgv,
      writable: true,
    });
    if (existsSync(envPath)) {
      unlinkSync(envPath);
    }
  });

  function mockArgs(args: string[]) {
    Object.defineProperty(process, 'argv', {
      value: ['node', 'test', ...args],
      writable: true,
    });
  }

  it('returns default values when no config provided', () => {
    const config = configure({
      port: z.number().default(3000),
      host: z.string().default('localhost'),
    });

    expect(config).toEqual({
      port: 3000,
      host: 'localhost',
    });
  });

  it('reads from .env file', () => {
    writeFileSync(envPath, 'PORT=8080\nHOST=example.com\n');

    const config = configure(
      {
        port: z.number(),
        host: z.string(),
      },
      { envPath }
    );

    expect(config.port).toBe(8080);
    expect(config.host).toBe('example.com');
  });

  it('environment variables override .env file', () => {
    writeFileSync(envPath, 'PORT=8080\n');
    process.env.PORT = '9000';

    const config = configure(
      {
        port: z.number(),
      },
      { envPath }
    );

    expect(config.port).toBe(9000);
  });

  it('CLI arguments override environment variables', () => {
    process.env.PORT = '9000';
    mockArgs(['--port', '7000']);

    const config = configure({
      port: z.number(),
    });

    expect(config.port).toBe(7000);
  });

  it('validates configuration against schema', () => {
    writeFileSync(envPath, 'PORT=not-a-number\n');

    expect(() =>
      configure(
        {
          port: z.number(),
        },
        { envPath }
      )
    ).toThrow(/Configuration validation failed/);
  });

  it('handles complex schema with multiple types', () => {
    mockArgs(['--port', '3000', '--enable-cache']);

    const config = configure({
      port: z.number(),
      host: z.string().default('localhost'),
      enableCache: z.boolean().default(false),
    });

    expect(config.port).toBe(3000);
    expect(config.host).toBe('localhost');
    expect(config.enableCache).toBe(true);
  });

  it('applies priority order correctly', () => {
    writeFileSync(
      envPath,
      'PORT=1000\nHOST=env-file-host\nENABLE_CACHE=false\n'
    );

    process.env.PORT = '2000';
    process.env.ENABLE_CACHE = 'true';

    mockArgs(['--port', '3000', '--host', 'cli-host']);

    const config = configure(
      {
        port: z.number(),
        host: z.string(),
        enableCache: z.boolean(),
      },
      { envPath }
    );

    expect(config.port).toBe(3000);
    expect(config.host).toBe('cli-host');
    expect(config.enableCache).toBe(true);
  });

  it('infers correct types from schema', () => {
    mockArgs(['--port', '8080', '--name', 'myapp', '--enabled']);

    const config = configure({
      port: z.number(),
      name: z.string(),
      enabled: z.boolean(),
    });

    expect(typeof config.port).toBe('number');
    expect(typeof config.name).toBe('string');
    expect(typeof config.enabled).toBe('boolean');
  });

  it('works with customConfigElement for custom env name', () => {
    process.env.MY_CUSTOM_PORT = '5000';

    const config = configure({
      port: customConfigElement(z.number(), { envName: 'MY_CUSTOM_PORT' }),
    });

    expect(config.port).toBe(5000);
  });

  it('works with customConfigElement for custom cmd name', () => {
    mockArgs(['--custom-port', '6000']);

    const config = configure({
      port: customConfigElement(z.number(), { cmdName: '--custom-port' }),
    });

    expect(config.port).toBe(6000);
  });

  it('works with customConfigElement for both env and cmd names', () => {
    process.env.SERVER_PORT = '7000';

    const config = configure({
      port: customConfigElement(z.number(), {
        envName: 'SERVER_PORT',
        cmdName: '--server-port',
      }),
    });

    expect(config.port).toBe(7000);
  });

  it('customConfigElement with CLI argument using custom cmd name', () => {
    process.env.PORT = '1000';
    mockArgs(['--custom-port', '8000']);

    const config = configure({
      port: customConfigElement(z.number(), {
        envName: 'PORT',
        cmdName: '--custom-port',
      }),
    });

    expect(config.port).toBe(8000);
  });

  it('customConfigElement with custom cmdNameShort', () => {
    mockArgs(['-p', '9000']);

    const config = configure({
      port: customConfigElement(z.number(), { cmdNameShort: 'p' }),
    });

    expect(config.port).toBe(9000);
  });

  it('customConfigElement with cmdName and cmdNameShort', () => {
    mockArgs(['--server-port', '-s', '7500']);

    const config = configure({
      serverPort: customConfigElement(z.number(), {
        cmdName: '--server-port',
        cmdNameShort: 's',
      }),
    });

    expect(config.serverPort).toBe(7500);
  });
});
