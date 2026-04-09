import { z } from "zod";

//#region src/schema-transformer.d.ts
type SupportedZodTypes = z.ZodNumber | z.ZodString | z.ZodBoolean | z.ZodEnum;
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
interface ConfigResult {
  __$sources__?: Record<string, ConfigSourceEntry>;
  [key: string]: unknown;
}
declare function printConfiguredSources(configResult: ConfigResult): void;
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
declare module 'zod' {
  interface ZodError {
    __$sources__?: Record<string, ConfigSourceEntry>;
  }
}
declare function configure<T extends ConfigInput>(config: T, options?: ParseMyConfOptions): InferConfig<T> & {
  __$sources__?: Record<string, ConfigSourceEntry>;
};
//#endregion
export { type ConfigFieldType, ConfigSource, ConfigSourceEntry, InferConfig, ParseMyConfOptions, type SimpleType, SourceValue, configure, customConfigElement, printConfiguredSources, toCliName, toEnvName };