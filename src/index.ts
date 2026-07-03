import {
  extractSchemaInfo,
  normalizeToZodObject,
  customConfigElement,
  type ConfigSchemaType,
  type FieldConfig,
  type InferSchemaOutput,
  type ConfigInput,
  type SimpleType,
  type ConfigFieldType,
} from './schema-transformer';
import {
  resolveConfigSources,
  type SourceResolverOptions,
} from './source-resolution/resolver';
import type { InternalSources } from './source-resolution/ledger';
import { getPresentValueAsString } from './utils/source-values';

export interface ConfigureOptions extends SourceResolverOptions {}

export { customConfigElement };
export type { SimpleType, ConfigFieldType };

export type InferConfig<T extends ConfigInput> = {
  [K in keyof T]: T[K] extends ConfigSchemaType
    ? InferSchemaOutput<T[K]>
    : T[K] extends FieldConfig
      ? T[K]['type'] extends ConfigSchemaType
        ? InferSchemaOutput<T[K]['type']>
        : T[K]['type'] extends SimpleType
          ? SimpleToNative<T[K]['type']>
          : never
      : T[K] extends SimpleType
        ? SimpleToNative<T[K]>
        : never;
};

type SimpleToNative<T extends SimpleType> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : never;

export type {
  ConfigSource,
  ConfigSourceEntry,
  SourceValue,
} from './source-resolution/ledger';

export function configure<T extends ConfigInput>(
  config: T,
  options?: ConfigureOptions
): InferConfig<T> & InternalSources {
  const info = extractSchemaInfo(config as ConfigInput);

  const schema = normalizeToZodObject(config as ConfigInput);

  const sourceResolution = resolveConfigSources(info, options);

  const result = schema.safeParse(sourceResolution.config);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const fieldName = String(issue.path[0]);
      const field = info.fields.find((f) => f.name === fieldName);
      if (field?.secret) {
        return `${fieldName}: ***`;
      }
      return `${fieldName}: ${issue.message}`;
    });
    const errors = issues.join(', ');
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  const data = result.data as InferConfig<T> & InternalSources;
  for (const [name, entry] of Object.entries(sourceResolution.sources)) {
    if (entry.finalSource !== 'default' || entry.finalValue !== undefined) {
      continue;
    }

    const defaultValue = getPresentValueAsString(data, name);
    if (defaultValue === undefined) {
      continue;
    }

    entry.default = { name: 'zod', value: defaultValue };
    entry.finalValue = defaultValue;
  }

  data.__$sources__ = sourceResolution.sources;

  return data;
}

export { toEnvName, toCliName } from './schema-transformer';
export { printConfiguredSources } from './print-config-sources';
