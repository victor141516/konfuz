import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, customConfigElement } from '../src/index';
import { z } from 'zod';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('configure', () => {
  const testDir = join(process.cwd(), '.temp');
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
      konfuzTestPort: z.number().default(3000),
      konfuzTestHost: z.string().default('localhost'),
    });

    expect(config).toEqual({
      konfuzTestPort: 3000,
      konfuzTestHost: 'localhost',
    });
  });

  it('accepts simple string type instead of Zod schema', () => {
    process.env.KONFUZ_TEST_NAME = 'test-name';

    const config = configure({
      konfuzTestName: 'string',
    });

    expect(config.konfuzTestName).toBe('test-name');
    expect(typeof config.konfuzTestName).toBe('string');
  });

  it('accepts simple number type instead of Zod schema', () => {
    process.env.KONFUZ_TEST_PORT = '8080';

    const config = configure({
      konfuzTestPort: 'number',
    });

    expect(config.konfuzTestPort).toBe(8080);
    expect(typeof config.konfuzTestPort).toBe('number');
  });

  it('accepts simple boolean type instead of Zod schema', () => {
    process.env.KONFUZ_TEST_DEBUG = 'true';

    const config = configure({
      konfuzTestDebug: 'boolean',
    });

    expect(config.konfuzTestDebug).toBe(true);
    expect(typeof config.konfuzTestDebug).toBe('boolean');
  });

  it('reads from .env file', () => {
    writeFileSync(
      envPath,
      'KONFUZ_TEST_PORT=8080\nKONFUZ_TEST_HOST=example.com\n'
    );

    const config = configure(
      {
        konfuzTestPort: z.number(),
        konfuzTestHost: z.string(),
      },
      { envPath }
    );

    expect(config.konfuzTestPort).toBe(8080);
    expect(config.konfuzTestHost).toBe('example.com');
  });

  describe('multiple envPath files', () => {
    it('merges values from multiple env files', () => {
      const base = join(testDir, '.env');
      const prod = join(testDir, '.env.production');
      writeFileSync(
        base,
        'KONFUZ_TEST_PORT=3000\nKONFUZ_TEST_HOST=localhost\n'
      );
      writeFileSync(prod, 'KONFUZ_TEST_HOST=prod.example.com\n');

      const config = configure(
        { konfuzTestPort: z.number(), konfuzTestHost: z.string() },
        { envPath: [base, prod] }
      );

      expect(config.konfuzTestPort).toBe(3000);
      expect(config.konfuzTestHost).toBe('prod.example.com');
    });

    it('later files override values from earlier files', () => {
      const base = join(testDir, '.env');
      const local = join(testDir, '.env.local');
      writeFileSync(
        base,
        'KONFUZ_TEST_PORT=3000\nKONFUZ_TEST_HOST=base-host\n'
      );
      writeFileSync(local, 'KONFUZ_TEST_PORT=4000\n');

      const config = configure(
        { konfuzTestPort: z.number(), konfuzTestHost: z.string() },
        { envPath: [base, local] }
      );

      expect(config.konfuzTestPort).toBe(4000);
      expect(config.konfuzTestHost).toBe('base-host');
    });

    it('env vars still override values from all env files', () => {
      const base = join(testDir, '.env');
      const local = join(testDir, '.env.local');
      writeFileSync(base, 'KONFUZ_TEST_PORT=3000\n');
      writeFileSync(local, 'KONFUZ_TEST_PORT=4000\n');
      process.env.KONFUZ_TEST_PORT = '9000';

      const config = configure(
        { konfuzTestPort: z.number() },
        { envPath: [base, local] }
      );

      expect(config.konfuzTestPort).toBe(9000);
    });

    it('silently ignores missing files in the array', () => {
      const base = join(testDir, '.env');
      writeFileSync(base, 'KONFUZ_TEST_PORT=3000\n');

      const config = configure(
        { konfuzTestPort: z.number() },
        { envPath: [base, join(testDir, '.env.nonexistent')] }
      );

      expect(config.konfuzTestPort).toBe(3000);
    });
  });

  it('environment variables override .env file', () => {
    writeFileSync(envPath, 'KONFUZ_TEST_PORT=8080\n');
    process.env.KONFUZ_TEST_PORT = '9000';

    const config = configure(
      {
        konfuzTestPort: z.number(),
      },
      { envPath }
    );

    expect(config.konfuzTestPort).toBe(9000);
  });

  it('CLI arguments override environment variables', () => {
    process.env.KONFUZ_TEST_PORT = '9000';
    mockArgs(['--konfuz-test-port', '7000']);

    const config = configure({
      konfuzTestPort: z.number(),
    });

    expect(config.konfuzTestPort).toBe(7000);
  });

  it('CLI arguments with collisions', () => {
    mockArgs([
      '-p',
      '1',
      '--pa',
      '2',
      '--pab',
      '3',
      '--pabp',
      '4',
      '-a',
      '5',
      '-b',
      '6',
      '-c',
      '7',
    ]);

    const config = configure({
      port: z.number(),
      portAlternative: z.number(),
      portAmigoBarcelona: z.number(),
      portAluminumBagettePractice: z.number(),
      potato: z.number(),
      path: z.number(),
      another: z.number(),
    });

    expect(config.port).toBe(1);
    expect(config.portAlternative).toBe(2);
    expect(config.portAmigoBarcelona).toBe(3);
    expect(config.portAluminumBagettePractice).toBe(4);
    expect(config.potato).toBe(5);
    expect(config.path).toBe(6);
    expect(config.another).toBe(7);
  });

  it('gives error for incorrect number type', () => {
    mockArgs(['--should-be-number', 'lala']);

    try {
      configure({
        shouldBeNumber: z.number(),
      });
    } catch (error) {
      expect((error as Error).toString().includes('Invalid input')).toBe(true);
    }
  });

  it('validates configuration against schema', () => {
    writeFileSync(envPath, 'KONFUZ_TEST_PORT=not-a-number\n');

    expect(() =>
      configure(
        {
          konfuzTestPort: z.number(),
        },
        { envPath }
      )
    ).toThrow(/Configuration validation failed/);
  });

  it('handles complex schema with multiple types', () => {
    mockArgs(['--konfuz-test-port', '3000', '--konfuz-test-enable-cache']);

    const config = configure({
      konfuzTestPort: z.number(),
      konfuzTestHost: z.string().default('localhost'),
      konfuzTestEnableCache: z.boolean().default(false),
    });

    expect(config.konfuzTestPort).toBe(3000);
    expect(config.konfuzTestHost).toBe('localhost');
    expect(config.konfuzTestEnableCache).toBe(true);
  });

  it('applies priority order correctly', () => {
    writeFileSync(
      envPath,
      'KONFUZ_TEST_PORT=1000\nKONFUZ_TEST_HOST=env-file-host\nKONFUZ_TEST_ENABLE_CACHE=false\n'
    );

    process.env.KONFUZ_TEST_PORT = '2000';
    process.env.KONFUZ_TEST_ENABLE_CACHE = 'true';

    mockArgs(['--konfuz-test-port', '3000', '--konfuz-test-host', 'cli-host']);

    const config = configure(
      {
        konfuzTestPort: z.number(),
        konfuzTestHost: z.string(),
        konfuzTestEnableCache: z.boolean(),
      },
      { envPath }
    );

    expect(config.konfuzTestPort).toBe(3000);
    expect(config.konfuzTestHost).toBe('cli-host');
    expect(config.konfuzTestEnableCache).toBe(true);
  });

  it('infers correct types from schema', () => {
    mockArgs([
      '--konfuz-test-port',
      '8080',
      '--konfuz-test-name',
      'myapp',
      '--konfuz-test-enabled',
    ]);

    const config = configure({
      konfuzTestPort: z.number(),
      konfuzTestName: z.string(),
      konfuzTestEnabled: z.boolean(),
    });

    expect(typeof config.konfuzTestPort).toBe('number');
    expect(typeof config.konfuzTestName).toBe('string');
    expect(typeof config.konfuzTestEnabled).toBe('boolean');
  });

  it('works with customConfigElement for custom env name', () => {
    process.env.KONFUZ_TEST_MY_CUSTOM_PORT = '5000';

    const config = configure({
      konfuzTestPort: customConfigElement({
        type: z.number(),
        envName: 'KONFUZ_TEST_MY_CUSTOM_PORT',
      }),
    });

    expect(config.konfuzTestPort).toBe(5000);
  });

  it('works with customConfigElement for custom cmd name', () => {
    mockArgs(['--custom-port', '6000']);

    const config = configure({
      konfuzTestPort: customConfigElement({
        type: z.number(),
        cmdName: '--custom-port',
      }),
    });

    expect(config.konfuzTestPort).toBe(6000);
  });

  it('works with customConfigElement for both env and cmd names', () => {
    process.env.KONFUZ_TEST_SERVER_PORT = '7000';

    const config = configure({
      konfuzTestPort: customConfigElement({
        type: z.number(),
        envName: 'KONFUZ_TEST_SERVER_PORT',
        cmdName: '--server-port',
      }),
    });

    expect(config.konfuzTestPort).toBe(7000);
  });

  it('customConfigElement with CLI argument using custom cmd name', () => {
    process.env.KONFUZ_TEST_PORT = '1000';
    mockArgs(['--custom-port', '8000']);

    const config = configure({
      konfuzTestPort: customConfigElement({
        type: z.number(),
        envName: 'KONFUZ_TEST_PORT',
        cmdName: '--custom-port',
      }),
    });

    expect(config.konfuzTestPort).toBe(8000);
  });

  it('customConfigElement with custom cmdNameShort', () => {
    mockArgs(['-p', '9000']);

    const config = configure({
      konfuzTestPort: customConfigElement({
        type: z.number(),
        cmdNameShort: 'p',
      }),
    });

    expect(config.konfuzTestPort).toBe(9000);
  });

  it('customConfigElement with cmdName and cmdNameShort', () => {
    mockArgs(['--server-port', '-s', '7500']);

    const config = configure({
      konfuzTestServerPort: customConfigElement({
        type: z.number(),
        cmdName: '--server-port',
        cmdNameShort: 's',
      }),
    });

    expect(config.konfuzTestServerPort).toBe(7500);
  });

  it('CLI arguments have priority over env file even when value matches default', () => {
    writeFileSync(envPath, 'KONFUZ_TEST_PORT=8080\n');

    mockArgs(['--konfuz-test-port', '3000']);

    const config = configure(
      {
        konfuzTestPort: z.number().default(3000),
      },
      { envPath }
    );

    expect(config.konfuzTestPort).toBe(3000);
  });

  it('shows CLI value in sources even when it matches default', () => {
    writeFileSync(envPath, 'KONFUZ_TEST_PORT=8080\n');

    mockArgs(['--konfuz-test-port', '3000']);

    const config = configure(
      {
        konfuzTestPort: z.number().default(3000),
      },
      { envPath }
    );

    const sources = (config as { __$sources__?: Record<string, unknown> })
      .__$sources__;
    expect(sources).toBeDefined();
    expect(sources!.konfuzTestPort.cli).toBeDefined();
    expect(sources!.konfuzTestPort.finalSource).toBe('cli');
    expect(sources!.konfuzTestPort.finalValue).toBe('3000');
  });

  describe('boolean parsing', () => {
    it('parameter without value should give true', () => {
      mockArgs(['--konfuz-test-enabled']);

      const config = configure({
        konfuzTestEnabled: z.boolean(),
      });

      expect(config.konfuzTestEnabled).toBe(true);
    });

    it('with --no-[parameter] should give false', () => {
      mockArgs(['--no-konfuz-test-enabled']);

      const config = configure({
        konfuzTestEnabled: z.boolean(),
      });

      expect(config.konfuzTestEnabled).toBe(false);
    });

    it('without parameter should give false', () => {
      mockArgs([]);

      const config = configure({
        konfuzTestEnabled: z.boolean().default(false),
      });

      expect(config.konfuzTestEnabled).toBe(false);
    });

    it('parameter with truthy and space separated value should give true', () => {
      mockArgs(['--konfuz-test-enabled', '1']);

      const config = configure({
        konfuzTestEnabled: z.boolean(),
      });

      expect(config.konfuzTestEnabled).toBe(true);
    });

    it('parameter with truthy and = separated value should give true', () => {
      mockArgs(['--konfuz-test-enabled=1']);

      const config = configure({
        konfuzTestEnabled: z.boolean(),
      });

      expect(config.konfuzTestEnabled).toBe(true);
    });

    it('parameter with falsy and space separated value should give false', () => {
      mockArgs(['--konfuz-test-enabled', '0']);

      const config = configure({
        konfuzTestEnabled: z.boolean(),
      });

      expect(config.konfuzTestEnabled).toBe(false);
    });

    it('parameter with falsy and = separated value should give false', () => {
      mockArgs(['--konfuz-test-enabled=0']);

      const config = configure({
        konfuzTestEnabled: z.boolean(),
      });

      expect(config.konfuzTestEnabled).toBe(false);
    });
  });
});
