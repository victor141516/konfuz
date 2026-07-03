import { describe, it, expect } from 'vitest';
import {
  toEnvName,
  toCliName,
  extractSchemaInfo,
  customConfigElement,
  type ConfigSchemaType,
} from '../src/schema-transformer';
import { z } from 'zod';

function legacyRuntimeSchema(
  prototype: object,
  trait: string,
  extra: Record<string, unknown> = {}
): ConfigSchemaType {
  return Object.assign(Object.create(prototype) as Record<string, unknown>, {
    _zod: { traits: new Set([trait]) },
    safeParse: () => ({ success: true, data: undefined }),
    '~standard': {},
    ...extra,
  }) as unknown as ConfigSchemaType;
}

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
      });
      expect(info.fields[1]).toMatchObject({
        name: 'host',
        envName: 'HOST',
        cmdName: 'host',
        type: 'string',
      });
    });

    it('infers primitive type through optional fields', () => {
      const schema = {
        port: z.number().optional(),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields[0].type).toBe('number');
    });

    it('infers primitive type through fields with defaults', () => {
      const schema = {
        port: z.number().default(3000),
        host: z.string().default('localhost'),
      };

      const info = extractSchemaInfo(schema);

      expect(info.fields[0].type).toBe('number');
      expect(info.fields[1].type).toBe('string');
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

    it('falls back to runtime Zod type checks when def metadata is unavailable', () => {
      const legacyString = legacyRuntimeSchema(
        z.ZodString.prototype,
        'ZodString'
      );
      const legacyNumber = legacyRuntimeSchema(
        z.ZodNumber.prototype,
        'ZodNumber'
      );
      const legacyBoolean = legacyRuntimeSchema(
        z.ZodBoolean.prototype,
        'ZodBoolean'
      );
      const legacyEnum = legacyRuntimeSchema(z.ZodEnum.prototype, 'ZodEnum', {
        options: ['dev', 'prod'],
      });

      const info = extractSchemaInfo({
        legacyString,
        legacyNumber,
        legacyBoolean,
        legacyEnum,
        legacyDefault: legacyRuntimeSchema(
          z.ZodDefault.prototype,
          'ZodDefault',
          { def: { innerType: legacyNumber } }
        ),
        legacyOptional: legacyRuntimeSchema(
          z.ZodOptional.prototype,
          'ZodOptional',
          { def: { innerType: legacyBoolean } }
        ),
        legacyNullable: legacyRuntimeSchema(
          z.ZodNullable.prototype,
          'ZodNullable',
          { def: { innerType: legacyString } }
        ),
        legacyReadonly: legacyRuntimeSchema(
          z.ZodReadonly.prototype,
          'ZodReadonly',
          { def: { innerType: legacyEnum } }
        ),
        unknownWrapperWithoutInnerType: {
          def: { type: 'optional' },
          safeParse: () => ({ success: true, data: undefined }),
          '~standard': {},
        } as unknown as ConfigSchemaType,
      });

      const fields = Object.fromEntries(
        info.fields.map((field) => [field.name, field])
      );

      expect(fields.legacyString.type).toBe('string');
      expect(fields.legacyNumber.type).toBe('number');
      expect(fields.legacyBoolean.type).toBe('boolean');
      expect(fields.legacyEnum.type).toBe('enum');
      expect(fields.legacyEnum.enumValues).toEqual(['dev', 'prod']);
      expect(fields.legacyDefault.type).toBe('number');
      expect(fields.legacyOptional.type).toBe('boolean');
      expect(fields.legacyNullable.type).toBe('string');
      expect(fields.legacyReadonly.type).toBe('enum');
      expect(fields.unknownWrapperWithoutInnerType.type).toBe('string');
    });

    it('handles customConfigElement with envName', () => {
      const config = {
        port: customConfigElement({ type: z.number(), envName: 'CUSTOM_PORT' }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].envName).toBe('CUSTOM_PORT');
      expect(info.fields[0].cmdName).toBe('port');
    });

    it('handles customConfigElement with cmdName', () => {
      const config = {
        port: customConfigElement({ type: z.number(), cmdName: '--my-port' }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].envName).toBe('PORT');
      expect(info.fields[0].cmdName).toBe('--my-port');
    });

    it('handles customConfigElement with both envName and cmdName', () => {
      const config = {
        port: customConfigElement({
          type: z.number(),
          envName: 'MY_PORT',
          cmdName: '--port-number',
        }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].envName).toBe('MY_PORT');
      expect(info.fields[0].cmdName).toBe('--port-number');
    });

    it('extracts customConfigElement configPath', () => {
      const config = {
        port: customConfigElement({
          type: z.number(),
          configPath: '.server.',
        }),
      };

      const info = extractSchemaInfo(config);

      expect(info.fields[0].configPath).toBe('.server.');
    });

    it('rejects configPath values that do not start with a dot', () => {
      expect(() =>
        extractSchemaInfo({
          port: customConfigElement({
            type: z.number(),
            configPath: 'server.port',
          }),
        })
      ).toThrow('must start with "."');
    });

    it('rejects configPath values with empty middle segments', () => {
      expect(() =>
        extractSchemaInfo({
          port: customConfigElement({
            type: z.number(),
            configPath: '.server..port',
          }),
        })
      ).toThrow('empty middle segments');
    });
  });
});
