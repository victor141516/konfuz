import { z } from 'zod';
import { parseConfigLookupPath } from './sources/config-file/lookup-path';

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
  /** Dot-notation path used to read this value from an opt-in JSON config file. */
  configPath?: string;
  /** The resolved primitive type of this field. */
  type: FieldType;
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
 * Contains the field metadata needed to map external sources to config keys.
 */
export interface SchemaDescriptor {
  /** Metadata for every field in the user's config. */
  fields: FieldDescriptor[];
}

/** The four core primitive Zod types the library can coerce from strings. */
type ZodCoreTypes = z.ZodString | z.ZodNumber | z.ZodBoolean | z.ZodEnum;

/**
 * Modifier wrappers that may legally surround a supported core type:
 * `.default()`, `.optional()`, `.nullable()`, `.readonly()`.
 */
type ZodModifier<T extends z.ZodTypeAny> =
  | z.ZodDefault<T>
  | z.ZodOptional<T>
  | z.ZodNullable<T>
  | z.ZodReadonly<T>;

/**
 * A Zod schema accepted by this library: one of the four supported primitives
 * (`string`, `number`, `boolean`, `enum`), optionally wrapped any number of
 * times by `.default()`, `.optional()`, `.nullable()`, or `.readonly()`.
 *
 * Up to four levels of wrapping are supported, which covers every realistic
 * use-case (e.g. `z.number().default(0).nullable().optional()` is valid).
 * Unsupported types such as `z.date()` or `z.array(z.string())` are rejected
 * at the TypeScript level.
 */
export type SupportedZodTypes =
  | ZodCoreTypes
  | ZodModifier<ZodCoreTypes>
  | ZodModifier<ZodModifier<ZodCoreTypes>>
  | ZodModifier<ZodModifier<ZodModifier<ZodCoreTypes>>>
  | ZodModifier<ZodModifier<ZodModifier<ZodModifier<ZodCoreTypes>>>>;

export type SimpleType = 'string' | 'number' | 'boolean';

export type ConfigFieldType = SupportedZodTypes | SimpleType;

const FIELD_CONFIG_MARKER: unique symbol = Symbol('konfuz.fieldConfig');

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
  /** Dot-notation path used to read this value from an opt-in JSON config file. */
  configPath?: string;
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

type ZodDefLike = {
  type?: string;
  innerType?: z.ZodType;
};

type ZodSchemaLike = z.ZodType & {
  def?: ZodDefLike;
  _def?: ZodDefLike;
  _zod?: { def?: ZodDefLike };
  options?: string[];
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Creates a configuration field with custom env var and/or CLI flag names.
 *
 * @example
 * customConfigElement({ type: z.number(), envName: 'SERVER_PORT', cmdNameShort: 'p' })
 */
export function customConfigElement<T extends SupportedZodTypes>(options: {
  type: T;
  envName?: string;
  cmdName?: string;
  cmdNameShort?: string;
  cmdDescription?: string;
  configPath?: string;
  secret?: boolean;
}): FieldConfig<T> {
  const element: FieldConfig<T> = {
    type: options.type,
    envName: options?.envName,
    cmdName: options?.cmdName,
    cmdNameShort: options?.cmdNameShort,
    cmdDescription: options?.cmdDescription,
    configPath: options?.configPath,
    secret: options?.secret,
  };

  Object.defineProperty(element, FIELD_CONFIG_MARKER, { value: true });
  return element;
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

/** Unwraps Zod wrapper types (Default, Optional, Nullable, Readonly) to determine the core FieldType. */
function inferFieldType(schema: z.ZodType): {
  type: FieldType;
  enumValues?: string[];
} {
  const def = getZodDef(schema);
  switch (def?.type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return {
        type: 'enum',
        enumValues: (schema as ZodSchemaLike).options as string[],
      };
    case 'default':
    case 'optional':
    case 'nullable':
    case 'readonly':
      if (def.innerType) {
        return inferFieldType(def.innerType);
      }
      break;
  }

  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum)
    return { type: 'enum', enumValues: schema.options as string[] };
  if (schema instanceof z.ZodDefault)
    return inferFieldType(schema.def.innerType as z.ZodType);
  if (schema instanceof z.ZodOptional)
    return inferFieldType(schema.def.innerType as z.ZodType);
  if (schema instanceof z.ZodNullable)
    return inferFieldType(schema.def.innerType as z.ZodType);
  if (schema instanceof z.ZodReadonly)
    return inferFieldType(schema.def.innerType as z.ZodType);
  return { type: 'string' };
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

function getZodDef(schema: z.ZodType): ZodDefLike | undefined {
  const schemaLike = schema as ZodSchemaLike;
  return schemaLike.def ?? schemaLike._def ?? schemaLike._zod?.def;
}

function isFieldConfig(
  value: ConfigFieldType | FieldConfig
): value is FieldConfig {
  if (value === null || typeof value !== 'object') return false;

  return (
    (value as { [FIELD_CONFIG_MARKER]?: unknown })[FIELD_CONFIG_MARKER] === true
  );
}

// ---------------------------------------------------------------------------
// Public schema-analysis functions
// ---------------------------------------------------------------------------

/**
 * Analyses a user-provided config object and returns the per-field metadata
 * needed to read external configuration sources.
 */
export function extractSchemaInfo(config: ConfigInput): SchemaDescriptor {
  const fields: FieldDescriptor[] = [];

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
    let customConfigPath: string | undefined;

    let secret: boolean | undefined;

    if (isFieldConfig(value)) {
      schema = isSimpleType(value.type)
        ? simpleTypeToZod(value.type)
        : value.type;
      customEnvName = value.envName;
      customCmdName = value.cmdName;
      customCmdNameShort = value.cmdNameShort;
      customCmdDescription = value.cmdDescription;
      customConfigPath = value.configPath;
      secret = value.secret;
    } else if (isSimpleType(value)) {
      schema = simpleTypeToZod(value);
    } else {
      schema = value;
    }

    const { type, enumValues } = inferFieldType(schema);

    if (customConfigPath !== undefined) {
      parseConfigLookupPath({
        fieldName: key,
        configPath: customConfigPath,
      });
    }

    fields.push({
      name: key,
      envName: customEnvName ?? toEnvName(key),
      cmdName: customCmdName ?? toCliName(key),
      cmdNameShort: customCmdNameShort,
      cmdDescription: customCmdDescription,
      configPath: customConfigPath,
      type,
      enumValues,
      secret,
    });
  }

  return { fields };
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
