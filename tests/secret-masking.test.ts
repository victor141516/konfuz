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
    process.env.API_KEY = 'my-secret-key';

    const config = configure({
      apiKey: customConfigElement(z.string(), {
        envName: 'API_KEY',
        secret: true,
      }),
    });

    // The value should still be accessible in the returned config
    expect(config.apiKey).toBe('my-secret-key');
  });

  it('redacts secret field value in error message when value is wrong type', () => {
    process.env.PORT = 'not-a-number';

    let message = '';
    try {
      configure({
        port: customConfigElement(z.number(), { secret: true }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).toContain('***');
    expect(message).not.toContain('not-a-number');
  });

  it('redacts secret field value in error message when field is missing', () => {
    let message = '';
    try {
      configure({
        apiKey: customConfigElement(z.string(), {
          envName: 'API_KEY',
          secret: true,
        }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    // For a missing field, *** replaces "nothing"
    expect(message).toContain('***');
    expect(message).not.toContain('nothing');
  });

  it('does not redact non-secret fields', () => {
    process.env.PORT = 'bad-value';

    let message = '';
    try {
      configure({ port: z.number() });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    expect(message).toContain('"bad-value"');
    expect(message).not.toContain('***');
  });

  it('redacts only secret fields when mixed with non-secret fields', () => {
    process.env.PORT = 'bad';

    let message = '';
    try {
      configure({
        port: z.number(),
        apiKey: customConfigElement(z.string(), {
          envName: 'API_KEY',
          secret: true,
        }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    // Non-secret bad value is shown
    expect(message).toContain('"bad"');
    // Secret missing field is redacted
    expect(message).toContain('***');
  });

  it('still tells the user which env var to set for a secret field', () => {
    let message = '';
    try {
      configure({
        apiKey: customConfigElement(z.string(), {
          envName: 'API_SECRET',
          secret: true,
        }),
      });
    } catch (e: unknown) {
      message = (e as Error).message;
    }

    // The hint should still appear even if the value is redacted
    expect(message).toContain('API_SECRET');
  });
});
