import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadEnvFile } from '../src/loader';
import { writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('loader', () => {
  const testDir = join(process.cwd(), 'test-env-temp');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    const envPath = join(testDir, '.env');
    if (existsSync(envPath)) {
      unlinkSync(envPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('loads .env file from current directory', () => {
    const envPath = join(testDir, '.env');
    writeFileSync(envPath, 'PORT=3000\nHOST=localhost\n');

    const config = loadEnvFile(envPath);

    expect(config).toEqual({
      PORT: '3000',
      HOST: 'localhost',
    });
  });

  it('returns empty object when .env does not exist', () => {
    const config = loadEnvFile('/nonexistent/path/.env');
    expect(config).toEqual({});
  });

  it('handles comments in .env file', () => {
    const envPath = join(testDir, '.env');
    writeFileSync(
      envPath,
      '# This is a comment\nPORT=3000\n# Another comment\nHOST=localhost\n'
    );

    const config = loadEnvFile(envPath);

    expect(config).toEqual({
      PORT: '3000',
      HOST: 'localhost',
    });
  });

  it('handles empty values', () => {
    const envPath = join(testDir, '.env');
    writeFileSync(envPath, 'EMPTY_VAR=\nPORT=3000\n');

    const config = loadEnvFile(envPath);

    expect(config).toEqual({
      EMPTY_VAR: '',
      PORT: '3000',
    });
  });
});
