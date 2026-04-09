import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printConfiguredSources } from '../src/print-config-sources';
import { z } from 'zod';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('printConfiguredSources', () => {
  const testDir = join(process.cwd(), 'test-env-temp');
  const envPath = join(testDir, '.env');
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'argv', {
      value: ['node', 'test'],
      writable: true,
    });
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (existsSync(envPath)) unlinkSync(envPath);
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'argv', {
      value: originalArgv,
      writable: true,
    });
    if (existsSync(envPath)) unlinkSync(envPath);
  });

  it('logs to console with [konfuz] prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printConfiguredSources({
      port: z.number().default(3000),
    });

    expect(spy.mock.calls[0][0] as string).toContain('[konfuz]');
    spy.mockRestore();
  });

  it('shows source for each field', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(envPath, 'PORT=9000\n');

    printConfiguredSources({ port: z.number() }, { envPath });

    const output = spy.mock.calls.join(' ');
    expect(output).toMatch(/port/);
    expect(output).toMatch(/\(envFile\)/);
    spy.mockRestore();
  });

  it('shows (default) for fields resolved from schema defaults', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printConfiguredSources({
      port: z.number().default(3000),
      host: z.string().default('localhost'),
    });

    const output = spy.mock.calls.join(' ');
    expect(output).toMatch(/\(default\)/);
    spy.mockRestore();
  });

  it('shows (env) when value comes from process.env', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.PORT = '7000';

    printConfiguredSources({ port: z.number() });

    const output = spy.mock.calls.join(' ');
    expect(output).toMatch(/\(env\)/);
    spy.mockRestore();
  });

  it('shows (cli) when value comes from CLI arguments', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    Object.defineProperty(process, 'argv', {
      value: ['node', 'test', '--port', '5000'],
      writable: true,
    });

    printConfiguredSources({ port: z.number() });

    const output = spy.mock.calls.join(' ');
    expect(output).toMatch(/\(cli\)/);
    spy.mockRestore();
  });

  it('prints (envFile) for values loaded from env files', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(envPath, 'PORT=3000\n');

    printConfiguredSources({ port: z.number() }, { envPath });

    const output = spy.mock.calls.join(' ');
    expect(output).toMatch(/\(envFile\)/);
    spy.mockRestore();
  });

  it('supports multiple env files', () => {
    const base = join(testDir, '.env');
    const override = join(testDir, '.env.production');
    writeFileSync(base, 'PORT=3000\nHOST=localhost\n');
    writeFileSync(override, 'HOST=prod.example.com\n');

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printConfiguredSources(
      { port: z.number(), host: z.string() },
      { envPath: [base, override] }
    );

    const output = spy.mock.calls.join(' ');
    expect(output).toMatch(/port.*\(envFile\)/);
    expect(output).toMatch(/host.*\(envFile\)/);
    spy.mockRestore();
  });
});
