import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseConfigFileValues } from '../src/config-file-parser';
import { parseConfigLookupPath } from '../src/config-lookup-path';
import {
  customConfigElement,
  extractSchemaInfo,
} from '../src/schema-transformer';
import type { LoadedConfigFile } from '../src/config-file-loader';

describe('config-file-parser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function file(data: Record<string, unknown>): LoadedConfigFile {
    return {
      path: 'konfuz.json',
      resolvedPath: '/app/konfuz.json',
      data,
    };
  }

  it('reads declared root keys and ignores unknown keys', () => {
    const info = extractSchemaInfo({
      port: z.number(),
      host: z.string(),
    });

    const result = parseConfigFileValues(
      info,
      file({ port: 3000, host: 'localhost', extra: true })
    );

    expect(result.config).toEqual({ port: 3000, host: 'localhost' });
    expect(result.sourceValues.port).toEqual({
      name: 'konfuz.json:.port',
      value: '3000',
    });
    expect(result.sourceValues.host).toEqual({
      name: 'konfuz.json:.host',
      value: '"localhost"',
    });
  });

  it('treats JSON null as a present value', () => {
    const info = extractSchemaInfo({
      port: z.number().nullable(),
    });

    const result = parseConfigFileValues(info, file({ port: null }));

    expect(result.config).toEqual({ port: null });
    expect(result.sourceValues.port.value).toBe('null');
  });

  it('supports custom configPath lookup semantics', () => {
    const info = extractSchemaInfo({
      rootAlias: customConfigElement({
        type: z.string(),
        configPath: '.otherName',
      }),
      nestedDefaultName: customConfigElement({
        type: z.number(),
        configPath: '.server.',
      }),
      nestedFullPath: customConfigElement({
        type: z.boolean(),
        configPath: '.server.flags.enabled',
      }),
      literalKey: customConfigElement({
        type: z.string(),
        configPath: '.server[0]',
      }),
    });

    const result = parseConfigFileValues(
      info,
      file({
        otherName: 'aliased',
        server: {
          nestedDefaultName: 8080,
          flags: { enabled: true },
        },
        'server[0]': 'literal',
      })
    );

    expect(result.config).toEqual({
      rootAlias: 'aliased',
      nestedDefaultName: 8080,
      nestedFullPath: true,
      literalKey: 'literal',
    });
    expect(result.sourceValues.nestedDefaultName.name).toBe(
      'konfuz.json:.server.nestedDefaultName'
    );
  });

  it('allows duplicate configPath values across fields', () => {
    const info = extractSchemaInfo({
      first: customConfigElement({ type: z.string(), configPath: '.shared' }),
      second: customConfigElement({ type: z.string(), configPath: '.shared' }),
    });

    const result = parseConfigFileValues(info, file({ shared: 'value' }));

    expect(result.config).toEqual({ first: 'value', second: 'value' });
  });

  it('warns and treats a field as missing for non-object intermediate values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = extractSchemaInfo({
      port: customConfigElement({
        type: z.number(),
        configPath: '.server.port',
      }),
    });

    const result = parseConfigFileValues(info, file({ server: 3000 }));

    expect(result.config).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Found non-object value')
    );
  });

  it('resolves configPath display paths', () => {
    const info = extractSchemaInfo({
      defaultRoot: z.string(),
      explicitRoot: customConfigElement({
        type: z.string(),
        configPath: '.',
      }),
      nestedDefault: customConfigElement({
        type: z.string(),
        configPath: '.server.',
      }),
    });

    expect(
      parseConfigLookupPath({
        fieldName: info.fields[0].name,
        configPath: info.fields[0].configPath,
      }).displayPath
    ).toBe('.defaultRoot');
    expect(
      parseConfigLookupPath({
        fieldName: info.fields[1].name,
        configPath: info.fields[1].configPath,
      }).displayPath
    ).toBe('.explicitRoot');
    expect(
      parseConfigLookupPath({
        fieldName: info.fields[2].name,
        configPath: info.fields[2].configPath,
      }).displayPath
    ).toBe('.server.nestedDefault');
  });
});
