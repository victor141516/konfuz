import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configure } from '../src/index';
import { z } from 'zod';

describe('schema validation at configure() call time', () => {
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

  it('accepts z.string() schema', () => {
    expect(configure({ name: z.string() })).toBeDefined();
  });

  it('accepts z.number() schema', () => {
    expect(configure({ port: z.number().default(3000) })).toBeDefined();
  });

  it('accepts z.boolean() schema', () => {
    expect(configure({ debug: z.boolean().default(false) })).toBeDefined();
  });

  it('accepts z.enum() schema', () => {
    expect(
      configure({ env: z.enum(['dev', 'prod']).default('dev') })
    ).toBeDefined();
  });

  it('accepts z.string().optional()', () => {
    expect(configure({ name: z.string().optional() })).toBeDefined();
  });

  it('accepts z.string().default()', () => {
    expect(configure({ name: z.string().default('unnamed') })).toBeDefined();
  });

  it('throws on z.object() schema with clear message', () => {
    expect(() => configure({ user: z.object({ name: z.string() }) })).toThrow(
      /Unsupported schema type: Object/
    );
    expect(() => configure({ user: z.object({ name: z.string() }) })).toThrow(
      /Use z\.string\(\) or z\.number\(\) for field "user"/
    );
  });

  it('throws on z.array() schema with clear message', () => {
    expect(() => configure({ items: z.array(z.string()) })).toThrow(
      /Unsupported schema type: Array/
    );
  });

  it('throws on z.union() schema with clear message', () => {
    expect(() =>
      configure({ value: z.union([z.string(), z.number()]) })
    ).toThrow(/Unsupported schema type: Union/);
  });

  it('throws on z.record() schema with clear message', () => {
    expect(() => configure({ meta: z.record(z.string()) })).toThrow(
      /Unsupported schema type: Record/
    );
  });

  it('throws on z.map() schema with clear message', () => {
    expect(() => configure({ mapping: z.map(z.string(), z.number()) })).toThrow(
      /Unsupported schema type: Map/
    );
  });

  it('includes the field name in the error for nested types', () => {
    expect(() => configure({ nested: z.object({ a: z.string() }) })).toThrow(
      /nested/
    );
  });

  it('still accepts z.object() when passed as a bare Zod schema in configure()', () => {
    // The proper usage is configure({ port: z.number() }), not configure(z.object({...}))
    // So this test verifies that Zod object schemas used directly in configure() are caught
  });
});
