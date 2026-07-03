import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseCliArguments,
  parseExplicitCliArguments,
} from '../src/sources/cli/parser';
import {
  customConfigElement,
  extractSchemaInfo,
} from '../src/schema-transformer';
import { z } from 'zod';

describe('cli-parser', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(process, 'argv', {
      value: ['node', 'test', ...originalArgv.slice(2)],
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'argv', {
      value: originalArgv,
      writable: true,
    });
  });

  function mockArgs(args: string[]) {
    Object.defineProperty(process, 'argv', {
      value: ['node', 'test', ...args],
      writable: true,
    });
  }

  it('parses string CLI arguments', () => {
    const schema = {
      host: z.string(),
    };

    const info = extractSchemaInfo(schema);

    mockArgs(['--host', 'localhost']);

    const config = parseCliArguments(info);

    expect(config.host).toBe('localhost');
  });

  it('parses number CLI arguments', () => {
    const schema = {
      port: z.number(),
    };

    const info = extractSchemaInfo(schema);

    mockArgs(['--port', '3000']);

    const config = parseCliArguments(info);

    expect(config.port).toBe(3000);
  });

  it('parses boolean CLI arguments', () => {
    const schema = {
      verbose: z.boolean(),
    };

    const info = extractSchemaInfo(schema);

    mockArgs(['--verbose']);

    const config = parseCliArguments(info);

    expect(config.verbose).toBe(true);
  });

  it('converts kebab-case to camelCase', () => {
    const schema = {
      databaseHost: z.string(),
    };

    const info = extractSchemaInfo(schema);

    mockArgs(['--database-host', 'db.example.com']);

    const config = parseCliArguments(info);

    expect(config.databaseHost).toBe('db.example.com');
  });

  it('returns empty config when no arguments provided', () => {
    const schema = {
      port: z.number(),
    };

    const info = extractSchemaInfo(schema);

    mockArgs([]);

    const config = parseCliArguments(info);

    expect(config).toEqual({});
  });

  it('can omit defaults and report only provided CLI source values', () => {
    const schema = {
      port: z.number().default(3000),
      host: z.string().default('localhost'),
    };

    const info = extractSchemaInfo(schema);

    const result = parseExplicitCliArguments(info, {
      argv: ['--host', 'example.com', '--unknown', 'value'],
    });

    expect(result).toEqual({
      config: { host: 'example.com' },
      rawValues: {},
      sourceValues: { host: 'example.com' },
    });
  });

  it('applies enum choices and descriptions to configured CLI options', () => {
    const info = extractSchemaInfo({
      mode: customConfigElement({
        type: z.enum(['dev', 'prod']),
        cmdDescription: 'Runtime mode',
      }),
    });

    const result = parseExplicitCliArguments(info, {
      argv: ['--mode', 'prod'],
    });

    expect(result).toEqual({
      config: { mode: 'prod' },
      rawValues: {},
      sourceValues: { mode: 'prod' },
    });
  });

  it('returns invalid boolean strings as raw values from the legacy parser', () => {
    const info = extractSchemaInfo({
      enabled: z.boolean(),
    });

    const result = parseCliArguments(info, {
      argv: ['--enabled', 'maybe'],
    });

    expect(result).toEqual({
      config: {},
      rawValues: { enabled: 'maybe' },
      sourceValues: {},
    });
  });
});
