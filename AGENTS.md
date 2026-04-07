# AGENTS.md

## Project Overview

`konfuz` is a configuration management library for NPM (Node.js) applications. It reads configuration from multiple sources (.env files, environment variables, CLI arguments) with type safety provided by Zod schemas.

**Key characteristics:**

- Library intended for Node.js server-side applications
- ESM module format with both ESM and CJS build outputs
- Zod is a peer dependency (not bundled)
- Built with TypeScript, Vitest, Prettier, OXLint, and tsdown

## Architecture

### Configuration Flow

```
User Schema → extractSchemaInfo() → SchemaInfo (fields + shape)
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
            Env File Loader      CLI Parser (yargs)
                    ↓                   ↓
            parseEnvVariables()   parseCliArguments()
                    ↓                   ↓
                    └─────────┬─────────┘
                              ↓
                    Merged Config Object
                              ↓
                    Schema.safeParse()
                              ↓
                    Final Typed Config
```

### Priority Order (highest to lowest)

1. CLI arguments (e.g., `--port 3000`)
2. Environment variables (e.g., `PORT=3000`)
3. `.env` file (e.g., `PORT=3000`)

### Key Interfaces

**CustomConfigElement** (`src/schema-transformer.ts`)

```typescript
interface CustomConfigElement<T extends z.ZodTypeAny = z.ZodTypeAny> {
  type: T;
  envName?: string; // Custom env var name (default: UPPER_SNAKE_CASE)
  cmdName?: string; // Custom CLI flag (default: kebab-case)
  cmdShort?: string; // Custom short flag (auto-generated if not provided)
  cmdDescription?: string; // Custom CLI argument description (for --help)
}
```

**ConfigField** (`src/schema-transformer.ts`)

```typescript
interface ConfigField {
  name: string; // Original key name
  envName: string; // Environment variable name
  cmdName: string; // CLI long flag
  cmdShort?: string; // CLI short flag
  cmdDescription?: string; // CLI argument description (for --help)
  type: 'string' | 'number' | 'boolean' | 'enum';
  isOptional: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}
```

**SchemaInfo** (`src/schema-transformer.ts`)

```typescript
interface SchemaInfo {
  fields: ConfigField[]; // All parsed fields
  shape: Record<string, z.ZodType>; // Original Zod schemas
}
```

### Module Responsibilities

| File                        | Purpose                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `src/index.ts`              | Main entry - exports `configure()` and `customConfigElement()`                       |
| `src/schema-transformer.ts` | Schema introspection, name conversion (toEnvName, toCliName), ConfigField extraction |
| `src/loader.ts`             | Loads `.env` files using dotenv (internal, not exported)                             |
| `src/env-parser.ts`         | Parses environment variables based on SchemaInfo                                     |
| `src/cli-parser.ts`         | Parses CLI arguments using yargs                                                     |
| `src/short-param.ts`        | ShortParamGenerator class for auto-generating CLI short flags                        |

## Source Code Conventions

### Naming Conventions

- **Configuration keys**: camelCase (e.g., `databaseHost`)
- **Environment variables**: UPPER_SNAKE_CASE (e.g., `DATABASE_HOST`)
- **CLI long flags**: kebab-case (e.g., `--database-host`)
- **CLI short flags**: 1-2 characters (e.g., `-d`)

### Type Exports

Only the following are exported from `src/index.ts`:

- `configure()` - Main configuration function
- `customConfigElement()` - For custom env/CLI names
- `toEnvName()` - Utility for key → env name conversion
- `toCliName()` - Utility for key → CLI name conversion
- Types: `ParseMyConfOptions`, `CustomConfigElement`

Internal modules (`loader.ts`, `env-parser.ts`, etc.) are not exported.

### Short Param Generation Algorithm

The `ShortParamGenerator` class generates short CLI flags with collision avoidance:

1. First letter of first word: `port` → `p`
2. If taken, first letters of multiple words: `database-host` → `dh`
3. If taken, extend within last word: `path` (if `p` and `pa` taken) → `pat`
4. If no words left, fall back to alphabet: `a`, `b`, `c`, etc.

## Build and Test Commands

```bash
# Build the library (outputs to dist/)
pnpm run build

# Run tests
pnpm test

# Lint with OXLint
pnpm run lint

# Format with Prettier
pnpm run format

# Full check before publishing
pnpm run build && pnpm run lint && pnpm test
```

## Testing Strategy

Tests are located in `tests/` directory with corresponding source files:

- `tests/index.test.ts` - Integration tests for `configure()`
- `tests/schema-transformer.test.ts` - Tests for name conversion and schema extraction
- `tests/cli-parser.test.ts` - Tests for CLI argument parsing
- `tests/env-parser.test.ts` - Tests for environment variable parsing
- `tests/loader.test.ts` - Tests for `.env` file loading
- `tests/short-param.test.ts` - Tests for short param generation

Use `vi.resetModules()` when mocking process.env or process.argv in tests.

## API Reference

### configure<T extends ConfigShape>(config: T, options?: ParseMyConfOptions): InferConfig<T>

Main function to configure and parse application configuration.

**Parameters:**

- `config`: Plain object with Zod schemas or `customConfigElement()` calls
- `options.envPath`: Optional path to `.env` file (default: `./.env`)
- `options.argv`: Optional CLI arguments array (default: `process.argv`)

**Returns:** Inferred type from the schema with all values resolved.

**Example:**

```typescript
const config = configure({
  port: z.number().default(3000),
  host: z.string(),
  verbose: customConfigElement(z.boolean(), { cmdShort: 'v' }),
});
```

### customConfigElement<T extends z.ZodTypeAny>(type: T, options?: Options): CustomConfigElement<T>

Creates a configuration element with custom naming.

**Parameters:**

- `type`: Zod schema (e.g., `z.number()`, `z.string()`)
- `options.envName`: Custom environment variable name
- `options.cmdName`: Custom CLI flag name
- `options.cmdShort`: Custom CLI short flag
- `options.cmdDescription`: Custom CLI argument description (shown in --help)

**Example:**

```typescript
customConfigElement(z.number(), {
  envName: 'SERVER_PORT',
  cmdName: '--server-port',
  cmdShort: 's',
  cmdDescription: 'The port number to listen on',
});
```

## Common Patterns

### Testing Configuration

When testing code that uses `configure()`, reset modules and mock environment:

```typescript
beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  Object.defineProperty(process, 'argv', {
    value: originalArgv,
    writable: true,
  });
});
```

### Custom CLI Short Flags

When using `cmdShort`, yargs requires the `alias` option. The value should NOT include the leading dash:

```typescript
// Correct
customConfigElement(z.number(), { cmdShort: 'p' }); // Maps to -p

// If cmdShort starts with dash (for auto-generation), it's handled specially
// The ShortParamGenerator strips the leading dash
```

### Zod Schema Requirements

The `configure()` function accepts:

- Plain objects with Zod schemas: `{ port: z.number() }`
- Plain objects with `customConfigElement()`: `{ port: customConfigElement(z.number(), {...}) }`

It does NOT accept `z.object({...})` - pass the object directly instead.

## Dependencies

**Peer Dependency:**

- `zod` - Schema validation and type inference

**Dev Dependencies:**

- `vitest` - Testing framework
- `tsdown` - Bundler (ESM output without `.js` extensions in source)
- `prettier` - Code formatting
- `oxlint` - Linting
- `dotenv` - `.env` file parsing (bundled)
- `yargs` - CLI argument parsing (bundled)

## Important Notes

1. **tsdown bundles dependencies**: dotenv and yargs are bundled into `dist/index.mjs` and `dist/index.cjs`, so users don't need to install them separately.

2. **ESM with .js extensions**: Source files use imports without `.js` extensions. tsdown handles this during build. Do NOT add `.js` extensions to source files.

3. **ShortParamGenerator is stateful**: The global generator instance tracks assigned short params. It's reset at the start of each `parseCliArguments()` call.

4. **Zod optional vs default**: Fields with `.default()` are treated as optional internally but provide a default value. Fields with `.optional()` are truly optional.
