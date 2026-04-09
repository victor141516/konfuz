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

  describe('array of env file paths', () => {
    it('merges values from multiple files', () => {
      const base = join(testDir, '.env');
      const override = join(testDir, '.env.production');
      writeFileSync(base, 'PORT=3000\nHOST=localhost\n');
      writeFileSync(override, 'HOST=prod.example.com\n');

      const config = loadEnvFile([base, override]);

      expect(config).toEqual({
        PORT: '3000',
        HOST: 'prod.example.com',
      });
    });

    it('later files override values from earlier files', () => {
      const first = join(testDir, '.env');
      const second = join(testDir, '.env.local');
      const third = join(testDir, '.env.override');
      writeFileSync(first, 'A=1\nB=2\nC=3\n');
      writeFileSync(second, 'B=20\n');
      writeFileSync(third, 'C=300\n');

      const config = loadEnvFile([first, second, third]);

      expect(config).toEqual({ A: '1', B: '20', C: '300' });
    });

    it('preserves values from earlier files that are not overridden', () => {
      const base = join(testDir, '.env');
      const local = join(testDir, '.env.local');
      writeFileSync(base, 'PORT=3000\nHOST=localhost\nDEBUG=false\n');
      writeFileSync(local, 'DEBUG=true\n');

      const config = loadEnvFile([base, local]);

      expect(config).toEqual({
        PORT: '3000',
        HOST: 'localhost',
        DEBUG: 'true',
      });
    });

    it('silently skips files that do not exist', () => {
      const base = join(testDir, '.env');
      writeFileSync(base, 'PORT=3000\n');

      const config = loadEnvFile([base, '/nonexistent/.env.local']);

      expect(config).toEqual({ PORT: '3000' });
    });

    it('returns empty object when all files in the array are missing', () => {
      const config = loadEnvFile([
        '/nonexistent/.env',
        '/nonexistent/.env.local',
      ]);
      expect(config).toEqual({});
    });

    it('returns empty object for an empty array', () => {
      const config = loadEnvFile([]);
      expect(config).toEqual({});
    });
  });
});
