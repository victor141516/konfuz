import { z } from "zod";

//#region src/schema-transformer.d.ts
/**
 * Optional user-supplied customisation for a single configuration field.
 * Create one with the `customConfigElement()` helper and use it in place of a
 * bare Zod schema when calling `configure()`.
 */
interface FieldConfig<T extends z.ZodTypeAny = z.ZodTypeAny> {
  /** The Zod schema that validates this field's value. */
  type: T;
  /** Override the default UPPER_SNAKE_CASE environment variable name. */
  envName?: string;
  /** Override the default kebab-case CLI long flag (e.g. `--my-port`). */
  cmdName?: string;
  /** Override the auto-generated single-character CLI short flag (e.g. `p`). */
  cmdNameShort?: string;
  /** Description shown next to this flag in `--help` output. */
  cmdDescription?: string;
}
/**
 * The shape of the plain object a user passes to `configure()`.
 * Each value is either a bare Zod schema or a `FieldConfig` created with
 * `customConfigElement()`.
 */
type ConfigInput = Record<string, z.ZodTypeAny | FieldConfig>;
/**
 * Creates a configuration field with custom env var and/or CLI flag names.
 *
 * @example
 * customConfigElement(z.number(), { envName: 'SERVER_PORT', cmdShort: 'p' })
 */
declare function customConfigElement<T extends z.ZodTypeAny>(type: T, options?: {
  envName?: string;
  cmdName?: string;
  cmdNameShort?: string;
  cmdDescription?: string;
}): FieldConfig<T>;
/** Converts a camelCase key to UPPER_SNAKE_CASE (e.g. `databaseHost` → `DATABASE_HOST`). */
declare function toEnvName(key: string): string;
/** Converts a camelCase key to kebab-case (e.g. `databaseHost` → `database-host`). */
declare function toCliName(key: string): string;
//#endregion
//#region src/index.d.ts
interface ParseMyConfOptions {
  envPath?: string;
  argv?: string[];
}
type InferConfig<T extends ConfigInput> = { [K in keyof T]: T[K] extends z.ZodTypeAny ? z.infer<T[K]> : T[K] extends FieldConfig ? z.infer<T[K]['type']> : never };
declare function configure<T extends ConfigInput>(config: T, options?: ParseMyConfOptions): InferConfig<T>;
//#endregion
export { ParseMyConfOptions, configure, customConfigElement, toCliName, toEnvName };