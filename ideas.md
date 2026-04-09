# konfuz — Ideas & Feedback

## 1. Multiple `.env` file support ✅

Instead of accepting only a single file path via `envPath`, accept an array of paths.
Files are loaded in order; each subsequent file's values override those from the previous one.
Values not overridden are preserved. This lets users do patterns like `.env` → `.env.production` → `.env.local`.

**Implemented:** `envPath` option accepts `string | string[]`.

---

## 2. Friendly, actionable validation error messages ✅

When Zod parsing fails, surface a human-readable message that names the broken field, shows what value was found (or that it was missing), and tells the user which env var or CLI flag to set. A raw Zod error is cryptic.

**Implemented:** Error messages show the field name, expected type, received value (with type suffix for strings), and hints for env/CLI.

---

## 3. `.env.example` auto-generation

A utility that generates a `.env.example` from the schema — listing every key with its type, whether it's required, its default value, and optional description.

to be implemented: false (not considered necessary)

---

## 4. Nested/grouped configuration

Support nested objects so related keys can be grouped (`db.host`, `db.port`), with naming propagating naturally (`DB_HOST`, `--db-host`).

to be implemented: false
Reason: terminal parameters and default environment validation aren't nested. Supporting nesting would add significant complexity and create a new convention that doesn't fit well with how env vars and CLI args are designed to work.

---

## 5. Array/list type support

Support comma-separated values from env vars (e.g., `ALLOWED_ORIGINS=http://localhost,https://example.com`) mapped to `z.array(z.string())`.

to be implemented: false (good idea, but not now)

---

## 6. Env variable prefix support

A global `envPrefix` option so all env vars are namespaced (e.g., `MYAPP_PORT` instead of `PORT`).

to be implemented: false
Reason: variable naming should remain under the user's control via `customConfigElement`.

---

## 7. Secret/sensitive field masking ✅

A `secret: true` option on `customConfigElement` to redact values in error messages, help output, and any logging.

**Implemented:** `secret: true` option redacts values as `***` in error messages.

---

## 8. Built-in `--help` output

Auto-handle `--help` / `-h` and print a formatted table of all options.

to be implemented: false
Reason: yargs already handles this automatically. It is already working.

---

## 9. `printConfigSources()` — config source debug utility ✅

A function (name TBD, `print`-style to make clear it prints and returns nothing) that prints each resolved config value alongside the source it came from: CLI argument, environment variable, `.env` file, or schema default.

**Implemented:** `printConfiguredSources(config, options?)` prints a table showing source per field.

---

## 10. TypeScript-level schema validation ✅

Better compile-time errors when unsupported Zod types are passed to `configure()`, instead of failing at runtime.

**Implemented:** `validateSupportedSchemas()` runs at `configure()` call time and throws with clear messages for unsupported types.

---

## Additional: Strict Boolean Coercion

Boolean fields only accept `1`, `yes`, `true` (case-insensitive) for `true`, and `0`, `no`, `false` (case-insensitive) for `false`. Any other value raises an error showing the actual type received.

For number fields, `1` and `0` are valid numbers. If `true` or `yes` is passed to a number field, the error reports "received boolean" instead of "received string".

For string fields, `true`, `false`, `yes`, `no`, `1`, `0` are all valid strings.
