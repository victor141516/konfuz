import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configure, customConfigElement } from '../src/index';
import { z } from 'zod';

describe('friendly validation error messages', () => {
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

  it('includes [konfuz] prefix in error message', () => {
    expect(() => configure({ port: z.number() })).toThrowError(/\[konfuz\]/);
  });

  it('names the missing required field', () => {
    expect(() => configure({ port: z.number() })).toThrowError(/port/);
  });

  it('says "required field is missing" for absent required fields', () => {
    expect(() => configure({ port: z.number() })).toThrowError(
      /required field is missing/
    );
  });

  it('includes the expected type for missing fields', () => {
    expect(() => configure({ port: z.number() })).toThrowError(
      /expected number/
    );
  });

  it('shows the bad value when a wrong type is provided via env var', () => {
    process.env.PORT = 'not-a-number';
    expect(() => configure({ port: z.number() })).toThrowError(
      /"not-a-number"/
    );
  });

  it('includes the env var name in the hint', () => {
    expect(() => configure({ databaseHost: z.string() })).toThrowError(
      /DATABASE_HOST/
    );
  });

  it('includes the CLI long flag in the hint', () => {
    expect(() => configure({ databaseHost: z.string() })).toThrowError(
      /--database-host/
    );
  });

  it('includes the CLI short flag when auto-generated', () => {
    expect(() => configure({ port: z.number() })).toThrowError(/-p/);
  });

  it('reports multiple failing fields, each on its own line', () => {
    let message = '';
    try {
      configure({ port: z.number(), host: z.string(), apiKey: z.string() });
    } catch (e: unknown) {
      message = (e as Error).message;
    }
    expect(message).toContain('- port:');
    expect(message).toContain('- host:');
    expect(message).toContain('- apiKey:');
  });

  it('uses custom envName in the hint when set via customConfigElement', () => {
    expect(() =>
      configure({
        port: customConfigElement(z.number(), { envName: 'SERVER_PORT' }),
      })
    ).toThrowError(/SERVER_PORT/);
  });

  it('uses custom cmdName in the hint when set via customConfigElement', () => {
    expect(() =>
      configure({
        port: customConfigElement(z.number(), { cmdName: '--server-port' }),
      })
    ).toThrowError(/--server-port/);
  });

  it('handles invalid enum value', () => {
    process.env.STATUS = 'unknown';
    let message = '';
    try {
      configure({ status: z.enum(['active', 'inactive']) });
    } catch (e: unknown) {
      message = (e as Error).message;
    }
    expect(message).toContain('"unknown"');
    expect(message).toContain('"active"');
    expect(message).toContain('"inactive"');
  });

  it('handles too_small for a number constraint', () => {
    process.env.PORT = '0';
    let message = '';
    try {
      configure({ port: z.number().min(1) });
    } catch (e: unknown) {
      message = (e as Error).message;
    }
    expect(message).toContain('too small');
    expect(message).toContain('at least 1');
  });

  it('handles too_big for a number constraint', () => {
    process.env.PORT = '999';
    let message = '';
    try {
      configure({ port: z.number().max(100) });
    } catch (e: unknown) {
      message = (e as Error).message;
    }
    expect(message).toContain('too large');
    expect(message).toContain('at most 100');
  });

  it('handles too_small for a string length constraint', () => {
    process.env.NAME = 'ab';
    let message = '';
    try {
      configure({ name: z.string().min(3) });
    } catch (e: unknown) {
      message = (e as Error).message;
    }
    expect(message).toContain('too small');
    expect(message).toContain('at least 3 characters');
  });
});
