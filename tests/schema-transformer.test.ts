import { describe, it, expect } from 'vitest';
import {
  toEnvName,
  toCliName,
  extractSchemaInfo,
  extractDefaults,
  customConfigElement,
} from '../src/schema-transformer';
import { z } from 'zod';

describe('schema-transformer', () => {
  describe('toEnvName', () => {
    it('converts camelCase to UPPER_SNAKE_CASE', () => {
      expect(toEnvName('databaseHost')).toBe('DATABASE_HOST');
      expect(toEnvName('port')).toBe('PORT');
      expect(toEnvName('enableCache')).toBe('ENABLE_CACHE');
    });

    it('handles consecutive uppercase letters', () => {
      expect(toEnvName('myAPIKey')).toBe('MY_API_KEY');
      expect(toEnvName('XMLParser')).toBe('XML_PARSER');
    });

    it('handles single words', () => {
      expect(toEnvName('port')).toBe('PORT');
      expect(toEnvName('host')).toBe('HOST');
    });
  });

  describe('toCliName', () => {
    it('converts camelCase to kebab-case', () => {
      expect(toCliName('databaseHost')).toBe('database-host');
      expect(toCliName('port')).toBe('port');
      expect(toCliName('enableCache')).toBe('enable-cache');
    });
  });

  describe('extractSchemaInfo', () => {
    it('extracts field information from simple schema', () => {
      const schema = {
        port: z.number(),
        host: z.string(),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields).toHaveLength(2);
      expect(info.fields[0]).toMatchObject({
        name: 'port',
        envName: 'PORT',
        cmdName: 'port',
        type: 'number',
        isOptional: false,
      });
      expect(info.fields[1]).toMatchObject({
        name: 'host',
        envName: 'HOST',
        cmdName: 'host',
        type: 'string',
        isOptional: false,
      });
    });

    it('handles optional fields', () => {
      const schema = {
        port: z.number().optional(),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields[0].isOptional).toBe(true);
    });

    it('handles fields with defaults', () => {
      const schema = {
        port: z.number().default(3000),
        host: z.string().default('localhost'),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields[0].isOptional).toBe(true);
      expect(info.fields[0].defaultValue).toBe(3000);
      expect(info.fields[1].isOptional).toBe(true);
      expect(info.fields[1].defaultValue).toBe('localhost');
    });

    it('handles boolean fields', () => {
      const schema = {
        enableCache: z.boolean(),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields[0].type).toBe('boolean');
    });

    it('handles enum fields', () => {
      const schema = {
        environment: z.enum(['development', 'production']),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields[0].type).toBe('enum');
      expect(info.fields[0].enumValues).toEqual(['development', 'production']);
    });

    it('handles customConfigElement with envName', () => {
      const config = {
        port: customConfigElement(z.number(), { envName: 'CUSTOM_PORT' }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].envName).toBe('CUSTOM_PORT');
      expect(info.fields[0].cmdName).toBe('port');
    });

    it('handles customConfigElement with cmdName', () => {
      const config = {
        port: customConfigElement(z.number(), { cmdName: '--my-port' }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].envName).toBe('PORT');
      expect(info.fields[0].cmdName).toBe('--my-port');
    });

    it('handles customConfigElement with both envName and cmdName', () => {
      const config = {
        port: customConfigElement(z.number(), {
          envName: 'MY_PORT',
          cmdName: '--port-number',
        }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].envName).toBe('MY_PORT');
      expect(info.fields[0].cmdName).toBe('--port-number');
    });
  });

  describe('extractDefaults', () => {
    it('extracts default values from schema', () => {
      const schema = {
        port: z.number().default(3000),
        host: z.string().default('localhost'),
      };

      const defaults = extractDefaults(schema);

      expect(defaults).toEqual({
        port: 3000,
        host: 'localhost',
      });
    });

    it('returns empty object when no defaults', () => {
      const schema = {
        port: z.number(),
        host: z.string(),
      };

      const defaults = extractDefaults(schema);

      expect(defaults).toEqual({});
    });
  });
});
