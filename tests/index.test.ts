import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const inMemoryFs = vi.hoisted(() => {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  function toPathString(path: unknown): string {
    return String(path);
  }

  function createNotFoundError(path: unknown): NodeJS.ErrnoException {
    const error = new Error(
      `ENOENT: no such file or directory, open '${String(path)}'`
    ) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    return error;
  }

  return {
    reset: () => {
      files.clear();
      directories.clear();
    },
    existsSync: (path: unknown) => {
      const pathString = toPathString(path);
      return files.has(pathString) || directories.has(pathString);
    },
    mkdirSync: (path: unknown) => {
      directories.add(toPathString(path));
      return undefined;
    },
    readFileSync: (path: unknown) => {
      const pathString = toPathString(path);
      const content = files.get(pathString);
      if (content === undefined) {
        throw createNotFoundError(path);
      }
      return content;
    },
    unlinkSync: (path: unknown) => {
      const pathString = toPathString(path);
      if (!files.delete(pathString)) {
        throw createNotFoundError(path);
      }
    },
    writeFileSync: (path: unknown, data: unknown) => {
      const content =
        typeof data === 'string'
          ? data
          : Buffer.from(data as Buffer).toString();
      files.set(toPathString(path), content);
    },
  };
});

vi.mock('fs', () => ({
  existsSync: inMemoryFs.existsSync,
  mkdirSync: inMemoryFs.mkdirSync,
  readFileSync: inMemoryFs.readFileSync,
  unlinkSync: inMemoryFs.unlinkSync,
  writeFileSync: inMemoryFs.writeFileSync,
}));

import {
  configure,
  customConfigElement,
  printConfiguredSources,
} from '../src/index';
import { z } from 'zod';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('configure', () => {
  const testDir = join(process.cwd(), '.temp');
  const envPath = join(testDir, '.env');
  const jsonPaths = [
    'disabled.json',
    'default.json',
    'explicit.json',
    'native.json',
    'secret.json',
    'string-port.json',
  ].map((fileName) => join(testDir, fileName));

  const originalArgv = process.argv;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    inMemoryFs.reset();
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
    for (const jsonPath of jsonPaths) {
      if (existsSync(jsonPath)) {
        unlinkSync(jsonPath);
      }
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(config).toMatchObject({
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

  it('does not let invalid env file values fall back to schema defaults', () => {
    writeFileSync(envPath, 'KONFUZ_TEST_PORT=not-a-number\n');

    expect(() =>
      configure(
        {
          konfuzTestPort: z.number().default(3000),
        },
        { envPath }
      )
    ).toThrow(/Configuration validation failed/);
  });

  it('does not let invalid process env values fall back to schema defaults', () => {
    process.env.KONFUZ_TEST_ENABLED = 'not-a-boolean';

    expect(() =>
      configure({
        konfuzTestEnabled: z.boolean().default(false),
      })
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

  describe('JSON config files', () => {
    it('does not load JSON when configFile is disabled and treats --config-file as inert', () => {
      const disabledPath = join(testDir, 'disabled.json');
      writeFileSync(disabledPath, '{"konfuzTestPort":9000}');

      const config = configure(
        {
          konfuzTestPort: z.number().default(3000),
        },
        { argv: ['--config-file', disabledPath] }
      );

      expect(config.konfuzTestPort).toBe(3000);
      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.konfuzTestPort.finalSource).toBe('default');
      expect(sources!.konfuzTestPort.cli).toBeUndefined();
      expect(sources!.konfuzTestPort.configFile).toBeUndefined();
    });

    it('does not bind disabled --config-file to a same-named config field', () => {
      const config = configure(
        {
          configFile: z.string().default('field-default'),
          konfuzTestPort: z.number().default(3000),
        },
        {
          argv: ['--config-file', 'ignored.json', '--konfuz-test-port', '5000'],
        }
      );

      expect(config.configFile).toBe('field-default');
      expect(config.konfuzTestPort).toBe(5000);

      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.configFile.cli).toBeUndefined();
      expect(sources!.configFile.finalSource).toBe('default');
      expect(sources!.konfuzTestPort.finalSource).toBe('cli');
    });

    it('enables JSON support without requiring a file when configFile is true', () => {
      const config = configure(
        {
          konfuzTestPort: z.number().default(3000),
        },
        { configFile: true, argv: [] }
      );

      expect(config.konfuzTestPort).toBe(3000);
    });

    it('loads an explicit JSON file from --config-file and strips the meta option before field CLI parsing', () => {
      const explicitPath = join(testDir, 'explicit.json');
      writeFileSync(
        explicitPath,
        JSON.stringify({ konfuzTestPort: 5000, konfuzTestHost: 'json-host' })
      );

      const config = configure(
        {
          konfuzTestPort: z.number().default(3000),
          konfuzTestHost: z.string(),
        },
        {
          configFile: true,
          argv: ['--config-file', explicitPath],
        }
      );

      expect(config.konfuzTestPort).toBe(5000);
      expect(config.konfuzTestHost).toBe('json-host');

      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.konfuzTestPort.finalSource).toBe('configFile');
      expect(sources!.konfuzTestPort.configFile).toEqual({
        name: `${explicitPath}:.konfuzTestPort`,
        value: '5000',
      });
      expect(sources!.konfuzTestHost.configFile).toEqual({
        name: `${explicitPath}:.konfuzTestHost`,
        value: '"json-host"',
      });
      expect(sources!.konfuzTestHost.finalValue).toBe('json-host');
      expect(sources!.konfuzTestPort.cli).toBeUndefined();
    });

    it('loads a configured default JSON file at lower priority than .env files', () => {
      const defaultPath = join(testDir, 'default.json');
      writeFileSync(
        defaultPath,
        JSON.stringify({
          konfuzTestPort: 1000,
          konfuzTestHost: 'default-json-host',
        })
      );
      writeFileSync(envPath, 'KONFUZ_TEST_PORT=2000\n');

      const config = configure(
        {
          konfuzTestPort: z.number(),
          konfuzTestHost: z.string(),
        },
        { configFile: defaultPath, envPath, argv: [] }
      );

      expect(config.konfuzTestPort).toBe(2000);
      expect(config.konfuzTestHost).toBe('default-json-host');

      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.konfuzTestPort.finalSource).toBe('envFile');
      expect(sources!.konfuzTestHost.finalSource).toBe('defaultConfigFile');
      expect(sources!.konfuzTestHost.finalValue).toBe('default-json-host');
    });

    it('rejects field CLI flags that collide with --config-file when JSON support is enabled', () => {
      expect(() =>
        configure(
          {
            configFile: z.string().default('field-value'),
          },
          { configFile: true, argv: [] }
        )
      ).toThrow('--config-file is reserved');

      expect(() =>
        configure(
          {
            customName: customConfigElement({
              type: z.string().default('field-value'),
              cmdName: '--config-file',
            }),
          },
          { configFile: true, argv: [] }
        )
      ).toThrow('Field "customName"');
    });

    it('uses explicit JSON instead of layering it on top of configured default JSON', () => {
      const defaultPath = join(testDir, 'default.json');
      const explicitPath = join(testDir, 'explicit.json');
      writeFileSync(
        defaultPath,
        JSON.stringify({ konfuzTestPort: 1000, konfuzTestHost: 'default' })
      );
      writeFileSync(
        explicitPath,
        JSON.stringify({ konfuzTestHost: 'explicit' })
      );

      const config = configure(
        {
          konfuzTestPort: z.number().default(3000),
          konfuzTestHost: z.string(),
        },
        {
          configFile: { defaultPath },
          argv: ['--config-file', explicitPath],
        }
      );

      expect(config.konfuzTestPort).toBe(3000);
      expect(config.konfuzTestHost).toBe('explicit');

      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.konfuzTestPort.defaultConfigFile).toBeUndefined();
      expect(sources!.konfuzTestHost.finalSource).toBe('configFile');
    });

    it('applies the full priority order across default JSON, .env, explicit JSON, env, and CLI', () => {
      const defaultPath = join(testDir, 'default.json');
      const explicitPath = join(testDir, 'explicit.json');
      writeFileSync(
        defaultPath,
        JSON.stringify({
          konfuzTestPort: 1000,
          konfuzTestHost: 'default-host',
          konfuzTestDebug: false,
        })
      );
      writeFileSync(
        envPath,
        'KONFUZ_TEST_PORT=2000\nKONFUZ_TEST_HOST=env-file-host\n'
      );
      writeFileSync(
        explicitPath,
        JSON.stringify({
          konfuzTestPort: 3000,
          konfuzTestHost: 'explicit-host',
          konfuzTestDebug: true,
        })
      );
      process.env.KONFUZ_TEST_HOST = 'env-host';

      const config = configure(
        {
          konfuzTestPort: z.number(),
          konfuzTestHost: z.string(),
          konfuzTestDebug: z.boolean(),
        },
        {
          configFile: defaultPath,
          envPath,
          argv: ['--config-file', explicitPath, '--konfuz-test-port', '5000'],
        }
      );

      expect(config.konfuzTestPort).toBe(5000);
      expect(config.konfuzTestHost).toBe('env-host');
      expect(config.konfuzTestDebug).toBe(true);

      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.konfuzTestPort.finalSource).toBe('cli');
      expect(sources!.konfuzTestHost.finalSource).toBe('env');
      expect(sources!.konfuzTestDebug.finalSource).toBe('configFile');
    });

    it('supports nested configPath lookup and native JSON value validation', () => {
      const nativePath = join(testDir, 'native.json');
      writeFileSync(
        nativePath,
        JSON.stringify({
          server: {
            port: 3000,
            enabled: true,
          },
        })
      );

      const config = configure(
        {
          konfuzTestPort: customConfigElement({
            type: z.number(),
            configPath: '.server.port',
          }),
          enabled: customConfigElement({
            type: z.boolean(),
            configPath: '.server.',
          }),
        },
        {
          configFile: true,
          argv: [`--config-file=${nativePath}`],
        }
      );

      expect(config.konfuzTestPort).toBe(3000);
      expect(config.enabled).toBe(true);
    });

    it('does not coerce JSON string values for number schemas', () => {
      const stringPortPath = join(testDir, 'string-port.json');
      writeFileSync(stringPortPath, '{"konfuzTestPort":"3000"}');

      expect(() =>
        configure(
          {
            konfuzTestPort: z.number(),
          },
          {
            configFile: true,
            argv: ['--config-file', stringPortPath],
          }
        )
      ).toThrow(/Configuration validation failed/);
    });

    it('throws for empty and missing explicit JSON config paths', () => {
      expect(() =>
        configure(
          {
            konfuzTestPort: z.number().default(3000),
          },
          { configFile: true, argv: ['--config-file='] }
        )
      ).toThrow('--config-file requires a JSON file path');

      expect(() =>
        configure(
          {
            konfuzTestPort: z.number().default(3000),
          },
          {
            configFile: true,
            argv: ['--config-file', join(testDir, 'missing.json')],
          }
        )
      ).toThrow('JSON config file not found');
    });

    it('redacts secret JSON values when printing sources and validation errors', () => {
      const secretPath = join(testDir, 'secret.json');
      writeFileSync(secretPath, '{"apiKey":"super-secret"}');
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const config = configure(
        {
          apiKey: customConfigElement({
            type: z.string(),
            configPath: '.apiKey',
            secret: true,
          }),
        },
        {
          configFile: true,
          argv: ['--config-file', secretPath],
        }
      );

      expect(config.apiKey).toBe('super-secret');
      const sources = (config as { __$sources__?: Record<string, any> })
        .__$sources__;
      expect(sources!.apiKey.configFile.value).toBe('"super-secret"');

      printConfiguredSources(config);

      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('Default JSON');
      expect(output).toContain('JSON file');
      expect(output).toContain('***');
      expect(output).not.toContain('super-secret');

      writeFileSync(secretPath, '{"apiKey":123}');
      expect(() =>
        configure(
          {
            apiKey: customConfigElement({
              type: z.string(),
              configPath: '.apiKey',
              secret: true,
            }),
          },
          {
            configFile: true,
            argv: ['--config-file', secretPath],
          }
        )
      ).toThrow(/apiKey: \*\*\*/);
    });
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

    it('does not let invalid CLI boolean values fall back to schema defaults', () => {
      expect(() =>
        configure(
          {
            konfuzTestEnabled: z.boolean().default(false),
          },
          {
            argv: ['--konfuz-test-enabled', 'maybe'],
          }
        )
      ).toThrow(/Configuration validation failed/);
    });
  });
});
