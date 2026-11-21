# konfuz API reference

### `configure<T extends ConfigInput>(config: T, options?: ConfigureOptions): InferConfig<T> & { __$sources__: Record<string, ConfigSourceEntry> }`

Main function to configure and parse application configuration.

**Parameters:**

- `config`: Plain object with Zod schemas, simple types ('string', 'number', 'boolean'), or `customConfigElement()` calls
- `options.envPath`: Optional path to `.env` file (string or array for multiple files)
- `options.argv`: Optional CLI arguments array (defaults to `process.argv`)
- `options.configFile`: Optional JSON config support (`true`, `false`, a default path string, or `{ defaultPath: string }`)

**Returns:** The parsed configuration object with type inference and a `__$sources__` property for source tracking.

### `customConfigElement(options: FieldConfigOptions): FieldConfig`

Creates a configuration field with custom options.

**Options:**

```typescript
interface FieldConfigOptions<T extends ConfigFieldType = ConfigFieldType> {
  type: T;
  envName?: string;
  cmdName?: string;
  cmdNameShort?: string;
  cmdDescription?: string;
  configPath?: string;
  secret?: boolean;
}
```

### `printConfiguredSources(configResult: object): void`

Prints a formatted table showing configuration sources for each field.

### `toEnvName(key: string): string`

Converts a camelCase key to UPPER_SNAKE_CASE (e.g., `databaseHost` → `DATABASE_HOST`).

### `toCliName(key: string): string`

Converts a camelCase key to kebab-case (e.g., `databaseHost` → `database-host`).

