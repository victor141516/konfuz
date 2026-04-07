import { z } from 'zod';

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'enum';

export interface ConfigField {
  name: string;
  envName: string;
  cmdName: string;
  cmdNameShort?: string;
  type: ConfigFieldType;
  isOptional: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

export interface SchemaInfo {
  fields: ConfigField[];
  shape: Record<string, z.ZodType>;
}

export interface CustomConfigElement<T extends z.ZodTypeAny = z.ZodTypeAny> {
  type: T;
  envName?: string;
  cmdName?: string;
  cmdNameShort?: string;
}

export type ConfigShape = Record<string, z.ZodTypeAny | CustomConfigElement>;

export function customConfigElement<T extends z.ZodTypeAny>(
  type: T,
  options?: { envName?: string; cmdName?: string; cmdNameShort?: string }
): CustomConfigElement<T> {
  return {
    type,
    envName: options?.envName,
    cmdName: options?.cmdName,
    cmdNameShort: options?.cmdNameShort,
  };
}

export function toEnvName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

export function toCliName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function getFieldType(schema: z.ZodType): {
  type: ConfigFieldType;
  enumValues?: string[];
} {
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'enum', enumValues: schema.options };
  }
  if (schema instanceof z.ZodDefault) {
    return getFieldType(schema._def.innerType);
  }
  if (schema instanceof z.ZodOptional) {
    return getFieldType(schema._def.innerType);
  }
  return { type: 'string' };
}

function hasDefault(schema: z.ZodType): boolean {
  if (schema instanceof z.ZodDefault) {
    return true;
  }
  return false;
}

function getDefaultValue(schema: z.ZodType): unknown {
  if (schema instanceof z.ZodDefault) {
    const defaultValue = schema._def.defaultValue;
    if (typeof defaultValue === 'function') {
      return defaultValue();
    }
    return defaultValue;
  }
  return undefined;
}

function isOptional(schema: z.ZodType): boolean {
  if (schema instanceof z.ZodOptional) {
    return true;
  }
  if (schema instanceof z.ZodDefault) {
    return true;
  }
  if (schema instanceof z.ZodReadonly) {
    return isOptional(schema._def.innerType);
  }
  return false;
}

function isCustomConfigElement(
  value: z.ZodTypeAny | CustomConfigElement
): value is CustomConfigElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type instanceof z.ZodType
  );
}

export function extractSchemaInfo(
  config: ConfigShape | z.ZodObject<z.ZodRawShape>
): SchemaInfo {
  const fields: ConfigField[] = [];
  const shape: Record<string, z.ZodType> = {};

  let entries: [string, z.ZodTypeAny | CustomConfigElement][];

  if (config instanceof z.ZodObject) {
    entries = Object.entries(config.shape);
  } else {
    entries = Object.entries(config);
  }

  for (const [key, value] of entries) {
    let schema: z.ZodType;
    let customEnvName: string | undefined;
    let customCmdName: string | undefined;
    let customcmdNameShort: string | undefined;

    if (isCustomConfigElement(value)) {
      schema = value.type;
      customEnvName = value.envName;
      customCmdName = value.cmdName;
      customcmdNameShort = value.cmdNameShort;
    } else {
      schema = value;
    }

    shape[key] = schema;

    const { type, enumValues } = getFieldType(schema);

    fields.push({
      name: key,
      envName: customEnvName ?? toEnvName(key),
      cmdName: customCmdName ?? toCliName(key),
      cmdNameShort: customcmdNameShort,
      type,
      isOptional: isOptional(schema),
      defaultValue: hasDefault(schema) ? getDefaultValue(schema) : undefined,
      enumValues,
    });
  }

  return { fields, shape };
}

export function extractDefaults(
  shape: Record<string, z.ZodType>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(shape)) {
    if (hasDefault(value)) {
      defaults[key] = getDefaultValue(value);
    }
  }

  return defaults;
}

export function normalizeToZodObject<T extends ConfigShape>(
  config: T
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(config)) {
    if (isCustomConfigElement(value)) {
      shape[key] = value.type;
    } else {
      shape[key] = value;
    }
  }

  return z.object(shape);
}
