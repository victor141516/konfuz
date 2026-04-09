import { z } from "zod";

//#region src/schema-transformer.d.ts
/** The four core primitive Zod types the library can coerce from strings. */
type ZodCoreTypes = z.ZodString | z.ZodNumber | z.ZodBoolean | z.ZodEnum;
/**
 * Modifier wrappers that may legally surround a supported core type:
 * `.default()`, `.optional()`, `.nullable()`, `.readonly()`.
 */
type ZodModifier<T extends z.ZodTypeAny> = z.ZodDefault<T> | z.ZodOptional<T> | z.ZodNullable<T> | z.ZodReadonly<T>;
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
type SupportedZodTypes = ZodCoreTypes | ZodModifier<ZodCoreTypes> | ZodModifier<ZodModifier<ZodCoreTypes>> | ZodModifier<ZodModifier<ZodModifier<ZodCoreTypes>>> | ZodModifier<ZodModifier<ZodModifier<ZodModifier<ZodCoreTypes>>>>;
type SimpleType = 'string' | 'number' | 'boolean';
type ConfigFieldType = SupportedZodTypes | SimpleType;
/**
 * Optional user-supplied customisation for a single configuration field.
 * Create one with the `customConfigElement()` helper and use it in place of a
 * bare Zod schema when calling `configure()`.
 */
interface FieldConfig<T extends ConfigFieldType = ConfigFieldType> {
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
type ConfigInput = Record<string, ConfigFieldType | FieldConfig>;
/**
 * Creates a configuration field with custom env var and/or CLI flag names.
 *
 * @example
 * customConfigElement(z.number(), { envName: 'SERVER_PORT', cmdShort: 'p' })
 */
declare function customConfigElement<T extends SupportedZodTypes>(options: {
  type: T;
  envName?: string;
  cmdName?: string;
  cmdNameShort?: string;
  cmdDescription?: string;
  secret?: boolean;
}): FieldConfig<T>;
/** Converts a camelCase key to UPPER_SNAKE_CASE (e.g. `databaseHost` → `DATABASE_HOST`). */
declare function toEnvName(key: string): string;
/** Converts a camelCase key to kebab-case (e.g. `databaseHost` → `database-host`). */
declare function toCliName(key: string): string;
//#endregion
//#region src/print-config-sources.d.ts
declare function printConfiguredSources(configResult: unknown): void;
//#endregion
//#region src/index.d.ts
interface ParseMyConfOptions {
  envPath?: string | string[];
  argv?: string[];
}
type InferConfig<T extends ConfigInput> = { [K in keyof T]: T[K] extends z.ZodTypeAny ? z.infer<T[K]> : T[K] extends FieldConfig ? T[K]['type'] extends z.ZodTypeAny ? z.infer<T[K]['type']> : T[K]['type'] extends SimpleType ? SimpleToNative<T[K]['type']> : never : T[K] extends SimpleType ? SimpleToNative<T[K]> : never };
type SimpleToNative<T extends SimpleType> = T extends 'string' ? string : T extends 'number' ? number : T extends 'boolean' ? boolean : never;
type ConfigSource = 'cli' | 'env' | 'envFile' | 'default';
interface SourceValue {
  name: string;
  value: string;
}
interface ConfigSourceEntry {
  finalSource: ConfigSource;
  finalValue?: string;
  envFile?: SourceValue;
  env?: SourceValue;
  cli?: SourceValue;
  secret?: boolean;
}
declare function configure<T extends ConfigInput>(config: T, options?: ParseMyConfOptions): InferConfig<T>;
//#endregion
export { type ConfigFieldType, ConfigSource, ConfigSourceEntry, InferConfig, ParseMyConfOptions, type SimpleType, SourceValue, configure, customConfigElement, printConfiguredSources, toCliName, toEnvName };