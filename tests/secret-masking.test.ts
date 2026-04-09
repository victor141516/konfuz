import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configure, customConfigElement } from '../src/index';
import { z } from 'zod';

describe('secret field masking', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'argv', {
      value: ['node', 'test'],
      writable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'argv', {
      value: originalArgv,
      writable: true,
    });
  });

  it('accepts secret: true on customConfigElement', () => {
    process.env.KONFUZ_TEST_API_KEY = 'my-secret-key';

    const config = configure({
      apiKey: customConfigElement({
        type: z.string(),
        envName: 'KONFUZ_TEST_API_KEY',
        secret: true,
      }),
    });

    // The value should still be accessible in the returned config
    expect(config.apiKey).toBe('my-secret-key');
  });

  it('redacts secret field value in error message when value is wrong type', () => {
    process.env.KONFUZ_TEST_PORT = 'not-a-number';

    let message = '';
    try {
      configure({
        port: customConfigElement({ type: z.number(), secret: true }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).toContain('***');
    expect(message).not.toContain('not-a-number');
    expect(message).toContain('port');
  });

  it('redacts secret field value in error message when field is missing', () => {
    let message = '';
    try {
      configure({
        apiKey: customConfigElement({
          type: z.string(),
          envName: 'KONFUZ_TEST_API_KEY',
          secret: true,
        }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).toContain('***');
    expect(message).toContain('apiKey');
  });

  it('does not redact non-secret fields', () => {
    process.env.KONFUZ_TEST_PORT = 'bad-value';

    let message = '';
    try {
      configure({ port: z.number() });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).not.toContain('***');
    expect(message).toContain('port');
    expect(message).toContain('Invalid input');
  });

  it('redacts only secret fields when mixed with non-secret fields', () => {
    process.env.KONFUZ_TEST_PORT = 'bad';

    let message = '';
    try {
      configure({
        port: z.number(),
        apiKey: customConfigElement({
          type: z.string(),
          envName: 'KONFUZ_TEST_API_KEY',
          secret: true,
        }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).toContain('port');
    expect(message).toContain('***');
    expect(message).not.toContain('KONFUZ_TEST_API_KEY');
  });

  it('still tells the user which env var to set for a secret field', () => {
    let message = '';
    try {
      configure({
        apiKey: customConfigElement({
          type: z.string(),
          envName: 'KONFUZ_TEST_API_SECRET',
          secret: true,
        }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).toContain('apiKey');
    expect(message).toContain('***');
  });
});
