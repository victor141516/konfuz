import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadConfigFile,
  normalizeConfigFileOption,
  parseConfigFileCliOption,
} from '../src/config-file-loader';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

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
});
