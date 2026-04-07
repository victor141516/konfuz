import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCliArguments } from '../src/cli-parser';
import { extractSchemaInfo } from '../src/schema-transformer';
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

  it('applies default values for missing arguments', () => {
    const schema = {
      port: z.number().default(3000),
      host: z.string().default('localhost'),
    };

    const info = extractSchemaInfo(schema);

    mockArgs([]);

    const config = parseCliArguments(info);

    expect(config.port).toBe(3000);
    expect(config.host).toBe('localhost');
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
});
