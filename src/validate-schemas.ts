import { z } from 'zod';

const UNSUPPORTED_TYPE_NAMES = new Set([
  'ZodObject',
  'ZodArray',
  'ZodUnion',
  'ZodRecord',
  'ZodTuple',
  'ZodIntersection',
  'ZodDiscriminatedUnion',
  'ZodTransform',
  'ZodFunction',
  'ZodPromise',
  'ZodMap',
  'ZodSet',
]);

function isSupportedSchemaType(schema: z.ZodTypeAny): boolean {
  const name = schema.constructor.name;

  if (UNSUPPORTED_TYPE_NAMES.has(name)) return false;

  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodLazy
  ) {
    return true;
  }

  const def = (
    schema as {
      _def?: {
        innerType?: z.ZodTypeAny;
        type?: string;
        getter?: () => z.ZodTypeAny;
      };
    }
  )._def;
  if (def?.innerType) {
    return isSupportedSchemaType(def.innerType);
  }
  if (def?.getter) {
    try {
      return isSupportedSchemaType(def.getter());
    } catch {
      return false;
    }
  }

  return false;
}

function schemaFriendlyName(schema: z.ZodTypeAny): string {
  return schema.constructor.name.replace('Zod', '');
}

function isZodSchema(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const name = (value as { constructor?: { name?: string } }).constructor?.name;
  return name ? name.startsWith('Zod') : false;
}

export function validateSupportedSchemas(
  config: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(config)) {
    const isFieldCfg =
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as { type?: unknown }).type instanceof z.ZodType;
    const schema = isFieldCfg
      ? (value as { type: z.ZodTypeAny }).type
      : (value as z.ZodTypeAny);

    if (!isZodSchema(schema)) {
      throw new Error(
        `[konfuz] Unexpected config key "${key}": expected a Zod schema or ` +
          `customConfigElement(), got ${typeof schema}. ` +
          `Use z.string(), z.number(), z.boolean(), or z.enum() for config fields.`
      );
    }

    const zodSchema = schema as z.ZodTypeAny;
    const name = zodSchema.constructor.name;

    if (UNSUPPORTED_TYPE_NAMES.has(name)) {
      const friendlyName = schemaFriendlyName(zodSchema);
      const hint =
        name === 'ZodObject'
          ? `Use z.string() or z.number() for field "${key}".`
          : name === 'ZodArray'
            ? `Use z.string() for a single string field, or split into separate fields.`
            : name === 'ZodUnion'
              ? `Ensure all union members are supported types (string, number, boolean, enum).`
              : `Use z.string(), z.number(), z.boolean(), or z.enum() for field "${key}".`;
      throw new Error(
        `[konfuz] Unsupported schema type: ${friendlyName}. ` +
          `Only primitive types (string, number, boolean, enum) and their ` +
          `optional/default wrappers are supported. ${hint}`
      );
    }

    if (!isSupportedSchemaType(zodSchema)) {
      const friendlyName = schemaFriendlyName(zodSchema);
      throw new Error(
        `[konfuz] Unsupported schema type: ${friendlyName}. ` +
          `Use z.string(), z.number(), z.boolean(), or z.enum() for field "${key}".`
      );
    }
  }
}
