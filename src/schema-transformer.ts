import { z } from 'zod';

/** The set of primitive field types the library understands and can coerce from strings. */
export type FieldType = 'string' | 'number' | 'boolean' | 'enum';

/**
 * Resolved metadata for a single configuration field.
 * Produced by `extractSchemaInfo()` and consumed by the env and CLI parsers.
 */
export interface FieldDescriptor {
  /** The original camelCase key from the user's config object. */
  name: string;
  /** The environment variable name (e.g. `DATABASE_HOST`). */
  envName: string;
  /** The CLI long flag name (e.g. `database-host`). */
  cmdName: string;
  /** The CLI short flag (e.g. `d`). Auto-generated if not provided. */
  cmdNameShort?: string;
  /** Description shown next to this flag in `--help` output. */
  cmdDescription?: string;
  /** The resolved primitive type of this field. */
  type: FieldType;
  /** Whether the field can be absent (has `.optional()` or `.default()`). */
  isOptional: boolean;
  /** The default value, if one was declared with `.default()`. */
  defaultValue?: unknown;
  /** Valid string values for `'enum'` typed fields. */
  enumValues?: string[];
  /**
   * When `true`, the value of this field is treated as sensitive (e.g. an API
   * key or password) and will be redacted in error messages and log output.
   */
  secret?: boolean;
}

/**
 * The result of `extractSchemaInfo()`.
 * Bundles the resolved field descriptors with the original Zod schemas so
 * consumers can perform their own Zod operations when needed.
 */
export interface SchemaDescriptor {
  /** Metadata for every field in the user's config. */
  fields: FieldDescriptor[];
  /**
   * The raw Zod schema for each field, keyed by the original camelCase field
   * name. Useful for callers that need to run their own `safeParse` calls.
   */
  zodSchemas: Record<string, z.ZodType>;
}

type SupportedZodTypes = z.ZodNumber | z.ZodString | z.ZodBoolean | z.ZodEnum;

export type SimpleType = 'string' | 'number' | 'boolean';

export type ConfigFieldType = SupportedZodTypes | SimpleType;

/**
 * Optional user-supplied customisation for a single configuration field.
 * Create one with the `customConfigElement()` helper and use it in place of a
 * bare Zod schema when calling `configure()`.
 */
export interface FieldConfig<T extends ConfigFieldType = ConfigFieldType> {
  /** The Zod schema or simple type that validates this field's value. */
  type: T;
  /** Override the default UPPER_SNAKE_CASE environment variable name. */
  envName?: string;
  /** Override the default kebab-case CLI long flag (e.g. `--my-port`). */
  cmdName?: string;
  /** Override the auto-generated single-character CLI short flag (e.g. `p`). */
  cmdNameShort?: string;
  /** Description shown next to this flag in `--help` output. */
  cmdDescription?: string;
  /**
   * Mark this field as sensitive. When `true`, its value is redacted
   * (shown as `***`) in error messages and log output.
   */
  secret?: boolean;
}

/**
 * The shape of the plain object a user passes to `configure()`.
 * Each value is either a bare Zod schema, a simple type string, or a `FieldConfig` created with
 * `customConfigElement()`.
 */
export type ConfigInput = Record<string, ConfigFieldType | FieldConfig>;

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Creates a configuration field with custom env var and/or CLI flag names.
 *
 * @example
 * customConfigElement(z.number(), { envName: 'SERVER_PORT', cmdShort: 'p' })
 */
export function customConfigElement<T extends SupportedZodTypes>(options: {
  type: T;
  envName?: string;
  cmdName?: string;
  cmdNameShort?: string;
  cmdDescription?: string;
  secret?: boolean;
}): FieldConfig<T> {
  return {
    type: options.type,
    envName: options?.envName,
    cmdName: options?.cmdName,
    cmdNameShort: options?.cmdNameShort,
    cmdDescription: options?.cmdDescription,
    secret: options?.secret,
  };
}

/** Converts a camelCase key to UPPER_SNAKE_CASE (e.g. `databaseHost` → `DATABASE_HOST`). */
export function toEnvName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

/** Converts a camelCase key to kebab-case (e.g. `databaseHost` → `database-host`). */
export function toCliName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Unwraps Zod wrapper types (Optional, Default) to determine the core FieldType. */
function inferFieldType(schema: z.ZodType): {
  type: FieldType;
  enumValues?: string[];
} {
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum)
    return { type: 'enum', enumValues: schema.options as string[] };
  if (schema instanceof z.ZodDefault)
    return inferFieldType(schema.def.innerType as z.ZodType);
  if (schema instanceof z.ZodOptional)
    return inferFieldType(schema.def.innerType as z.ZodType);
  return { type: 'string' };
}

/**
 * Returns the default value declared on a `ZodDefault` schema, or `undefined`
 * if the schema has no default.
 */
function extractDefaultValue(schema: z.ZodType): unknown {
  if (schema instanceof z.ZodDefault) {
    const defaultValue = schema.def.defaultValue;
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  }
  return undefined;
}

/** Returns `true` when the schema allows the field to be absent at parse time. */
function isFieldOptional(schema: z.ZodType): boolean {
  if (schema instanceof z.ZodOptional) return true;
  if (schema instanceof z.ZodDefault) return true;
  if (schema instanceof z.ZodReadonly)
    return isFieldOptional(schema.def.innerType as z.ZodType);
  return false;
}

function simpleTypeToZod(type: SimpleType): SupportedZodTypes {
  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
  }
}

function isSimpleType(value: unknown): value is SimpleType {
  return (
    typeof value === 'string' && ['string', 'number', 'boolean'].includes(value)
  );
}

/** Type guard: returns `true` when a config entry is a `FieldConfig` rather than a bare Zod schema or simple type. */
function isFieldConfig(
  value: ConfigFieldType | FieldConfig
): value is FieldConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value.type instanceof z.ZodType || isSimpleType(value.type))
  );
}

// ---------------------------------------------------------------------------
// Public schema-analysis functions
// ---------------------------------------------------------------------------

/**
 * Analyses a user-provided config object (or `z.ZodObject`) and returns a
 * `SchemaDescriptor` containing per-field metadata and the raw Zod schemas.
 */
export function extractSchemaInfo(config: ConfigInput): SchemaDescriptor {
  const fields: FieldDescriptor[] = [];
  const zodSchemas: Record<string, z.ZodType> = {};

  const entries = Object.entries(config) as [
    string,
    FieldConfig | ConfigFieldType,
  ][];

  for (const [key, value] of entries) {
    let schema: z.ZodType;
    let customEnvName: string | undefined;
    let customCmdName: string | undefined;
    let customCmdNameShort: string | undefined;
    let customCmdDescription: string | undefined;

    let secret: boolean | undefined;

    if (isFieldConfig(value)) {
      schema = isSimpleType(value.type)
        ? simpleTypeToZod(value.type)
        : value.type;
      customEnvName = value.envName;
      customCmdName = value.cmdName;
      customCmdNameShort = value.cmdNameShort;
      customCmdDescription = value.cmdDescription;
      secret = value.secret;
    } else if (isSimpleType(value)) {
      schema = simpleTypeToZod(value);
    } else {
      schema = value;
    }

    zodSchemas[key] = schema;

    const { type, enumValues } = inferFieldType(schema);

    fields.push({
      name: key,
      envName: customEnvName ?? toEnvName(key),
      cmdName: customCmdName ?? toCliName(key),
      cmdNameShort: customCmdNameShort,
      cmdDescription: customCmdDescription,
      type,
      isOptional: isFieldOptional(schema),
      defaultValue: extractDefaultValue(schema),
      enumValues,
      secret,
    });
  }

  return { fields, zodSchemas };
}

/**
 * Extracts all default values from a Zod shape (the `.shape` property of a
 * `z.ZodObject`), returning them as a plain key/value record.
 */
export function extractDefaults(
  shape: Record<string, z.ZodType>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(shape)) {
    const defaultValue = extractDefaultValue(schema);
    if (defaultValue !== undefined) {
      defaults[key] = defaultValue;
    }
  }

  return defaults;
}

/**
 * Converts a `ConfigInput` into a `z.ZodObject` suitable for final validation
 * with `safeParse()`.
 */
export function normalizeToZodObject<T extends ConfigInput>(
  config: T
): z.ZodObject<Record<string, SupportedZodTypes>> {
  const shape: Record<string, SupportedZodTypes> = {};

  for (const [key, value] of Object.entries(config)) {
    if (isFieldConfig(value)) {
      shape[key] = isSimpleType(value.type)
        ? simpleTypeToZod(value.type)
        : value.type;
    } else if (isSimpleType(value)) {
      shape[key] = simpleTypeToZod(value);
    } else {
      shape[key] = value;
    }
  }

  return z.object(shape);
}
