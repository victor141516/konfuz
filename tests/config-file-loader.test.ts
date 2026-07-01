import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadConfigFile,
  normalizeConfigFileOption,
  parseConfigFileCliOption,
  resolveConfigFileSource,
} from '../src/config-file-loader';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { extractSchemaInfo } from '../src/schema-transformer';

describe('config-file-loader', () => {
  const testDir = join(process.cwd(), '.temp-config-loader');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('normalizes disabled and enabled config file options', () => {
    expect(normalizeConfigFileOption(undefined)).toEqual({ enabled: false });
    expect(normalizeConfigFileOption(false)).toEqual({ enabled: false });
    expect(normalizeConfigFileOption(true)).toEqual({ enabled: true });
    expect(normalizeConfigFileOption('konfuz.json')).toEqual({
      enabled: true,
      defaultPath: 'konfuz.json',
    });
    expect(
      normalizeConfigFileOption({ defaultPath: 'config/defaults' })
    ).toEqual({
      enabled: true,
      defaultPath: 'config/defaults',
    });
  });

  it('rejects empty configured default paths', () => {
    expect(() => normalizeConfigFileOption('')).toThrow('options.configFile');
    expect(() => normalizeConfigFileOption({ defaultPath: '' })).toThrow(
      'options.configFile.defaultPath'
    );
  });

  it('strips --config-file from argv and supports both CLI forms', () => {
    expect(
      parseConfigFileCliOption(['--config-file', 'local.json', '--port', '1'])
    ).toEqual({
      argv: ['--port', '1'],
      explicitPath: 'local.json',
    });

    expect(
      parseConfigFileCliOption(['--host', 'localhost', '--config-file=app.cfg'])
    ).toEqual({
      argv: ['--host', 'localhost'],
      explicitPath: 'app.cfg',
    });
  });

  it('rejects empty or missing --config-file paths', () => {
    expect(() => parseConfigFileCliOption(['--config-file'])).toThrow(
      '--config-file requires a JSON file path'
    );
    expect(() => parseConfigFileCliOption(['--config-file='])).toThrow(
      '--config-file requires a JSON file path'
    );
    expect(() =>
      parseConfigFileCliOption(['--config-file', '--port', '3000'])
    ).toThrow('--config-file requires a JSON file path');
  });

  it('loads JSON from relative paths without requiring a .json extension', () => {
    const filePath = join(testDir, 'konfuz.config');
    writeFileSync(filePath, '{"port":3000}');

    const loaded = loadConfigFile('.temp-config-loader/konfuz.config', {
      required: true,
    });

    expect(loaded?.path).toBe('.temp-config-loader/konfuz.config');
    expect(loaded?.data).toEqual({ port: 3000 });
  });

  it('silently ignores missing default files but throws for missing explicit files', () => {
    expect(
      loadConfigFile(join(testDir, 'missing.json'), { required: false })
    ).toBeUndefined();
    expect(() =>
      loadConfigFile(join(testDir, 'missing.json'), { required: true })
    ).toThrow('JSON config file not found');
  });

  it('throws for invalid JSON and non-object root values', () => {
    const invalid = join(testDir, 'invalid.json');
    const arrayRoot = join(testDir, 'array.json');
    writeFileSync(invalid, '{bad json');
    writeFileSync(arrayRoot, '[1,2,3]');

    expect(() => loadConfigFile(invalid, { required: true })).toThrow(
      'Failed to parse JSON config file'
    );
    expect(() => loadConfigFile(arrayRoot, { required: true })).toThrow(
      'must contain a JSON object at the root'
    );
  });

  it('resolves JSON config source through one interface', () => {
    const defaultPath = join(testDir, 'default.json');
    const explicitPath = join(testDir, 'explicit.json');
    writeFileSync(defaultPath, '{"port":3000,"host":"default"}');
    writeFileSync(explicitPath, '{"host":"explicit"}');

    const result = resolveConfigFileSource(
      extractSchemaInfo({
        port: z.number().default(1000),
        host: z.string(),
      }),
      defaultPath,
      ['--config-file', explicitPath, '--port', '5000']
    );

    expect(result.argv).toEqual(['--port', '5000']);
    expect(result.defaultConfigFile.config).toEqual({});
    expect(result.configFile.config).toEqual({ host: 'explicit' });
    expect(result.configFile.sourceValues.host).toEqual({
      name: `${explicitPath}:.host`,
      value: '"explicit"',
    });
  });
});
