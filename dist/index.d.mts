import { z } from "zod";

//#region src/schema-transformer.d.ts
interface CustomConfigElement<T extends z.ZodTypeAny = z.ZodTypeAny> {
  type: T;
  envName?: string;
  cmdName?: string;
}
type ConfigShape = Record<string, z.ZodTypeAny | CustomConfigElement>;
declare function customConfigElement<T extends z.ZodTypeAny>(type: T, options?: {
  envName?: string;
  cmdName?: string;
}): CustomConfigElement<T>;
declare function toEnvName(key: string): string;
declare function toCliName(key: string): string;
//#endregion
//#region src/index.d.ts
interface ParseMyConfOptions {
  envPath?: string;
  argv?: string[];
}
type InferConfig<T extends ConfigShape> = { [K in keyof T]: T[K] extends z.ZodTypeAny ? z.infer<T[K]> : T[K] extends CustomConfigElement ? z.infer<T[K]['type']> : never };
declare function configure<T extends ConfigShape>(config: T, options?: ParseMyConfOptions): InferConfig<T>;
//#endregion
export { ParseMyConfOptions, configure, customConfigElement, toCliName, toEnvName };