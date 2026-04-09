import { z } from 'zod';
import type { SchemaDescriptor } from './schema-transformer';

/**
 * Formats a Zod validation error into a developer-friendly multi-line message
 * that names the failing field, describes what went wrong, and tells the user
 * which env var or CLI flag to set to fix it.
 */
export function formatValidationError(
  error: z.ZodError,
  info: SchemaDescriptor,
  merged: Record<string, unknown>,
  rawValues: Record<string, string> = {}
): string {
  const lines: string[] = ['[konfuz] Configuration validation failed:\n'];

  for (const issue of error.issues) {
    const fieldName = String(issue.path[0]);
    const field = info.fields.find((f) => f.name === fieldName);

    // Prefer the coerced/merged value; fall back to the original raw string
    // for cases where coercion silently failed (e.g. "abc" → NaN → undefined).
    // Redact the value entirely for secret fields.
    const rawDisplay = merged[fieldName] ?? rawValues[fieldName];
    const displayValue = field?.secret ? '***' : rawDisplay;
    const description = describeIssue(issue, displayValue);

    lines.push(`  - ${fieldName}: ${description}`);

    if (field) {
      const cliFlag = `--${field.cmdName}`;
      const shortFlag = field.cmdNameShort ? `, -${field.cmdNameShort}` : '';
      lines.push(
        `    → set ${field.envName} (env var)  or  ${cliFlag}${shortFlag} (CLI flag)`
      );
    }

    lines.push('');
  }

  // Remove the trailing blank line
  if (lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}

function describeIssue(issue: z.ZodIssue, resolvedValue: unknown): string {
  switch (issue.code) {
    case 'invalid_type': {
      const typedIssue = issue as z.core.$ZodIssueInvalidType;
      if (resolvedValue === undefined) {
        return `required field is missing (expected ${typedIssue.expected})`;
      }
      const got = formatValue(resolvedValue);
      return `expected ${typedIssue.expected}, got ${got}`;
    }

    case 'invalid_value': {
      const typedIssue = issue as z.core.$ZodIssueInvalidValue;
      const got = formatValue(resolvedValue);
      const options = (typedIssue.values as string[])
        .map((o) => `"${o}"`)
        .join(', ');
      return `invalid value ${got}, must be one of: ${options}`;
    }

    case 'too_small': {
      const typedIssue = issue as z.core.$ZodIssueTooSmall;
      const got = formatValue(resolvedValue);
      const origin = typedIssue.origin;
      const bound =
        origin === 'string'
          ? `at least ${typedIssue.minimum} character${Number(typedIssue.minimum) === 1 ? '' : 's'}`
          : `at least ${typedIssue.minimum}`;
      return `value ${got} is too small — must be ${bound}`;
    }

    case 'too_big': {
      const typedIssue = issue as z.core.$ZodIssueTooBig;
      const got = formatValue(resolvedValue);
      const origin = typedIssue.origin;
      const bound =
        origin === 'string'
          ? `at most ${typedIssue.maximum} character${Number(typedIssue.maximum) === 1 ? '' : 's'}`
          : `at most ${typedIssue.maximum}`;
      return `value ${got} is too large — must be ${bound}`;
    }

    default:
      return issue.message;
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}
