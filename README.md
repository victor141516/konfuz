# parse-my-conf

**Configuration management for NPM applications made simple** ⚙️

A zero-boilerplate configuration library that reads from `.env` files, environment variables, and CLI arguments with full type safety using Zod schemas.

## ✨ Features

- **Multi-source configuration** - Merge values from `.env` files, environment variables, and CLI arguments
- **Priority order** - CLI arguments override environment variables, which override `.env` files
- **Type-safe** - Define your config with Zod schemas and get automatic type inference
- **Smart CLI generation** - Automatically generates short (`-p`) and long (`--port`) CLI flags from your schema
- **Custom names** - Customize environment variable names, CLI flags, and CLI short names per field
- **Node.js focused** - Built for server-side Node.js applications

## 📦 Installation

```bash
npm install parse-my-conf zod
# or
pnpm add parse-my-conf zod
```

> **Note:** `zod` is a peer dependency. You need to install it separately.

## 🚀 Quick Start

```typescript
import { configure, customConfigElement } from 'parse-my-conf';
import { z } from 'zod';

const config = configure({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  verbose: z.boolean(),
});

// Use config.port, config.host, config.verbose with full type safety
console.log(`Server running on ${config.host}:${config.port}`);
```

## 📖 Usage

### Basic Configuration

Define your configuration schema using Zod:

```typescript
const config = configure({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  enableCache: z.boolean().default(false),
});
```

### Environment Variables

The library automatically converts your schema keys to `UPPER_SNAKE_CASE` for environment variables:

| Schema Key | Environment Variable |
|------------|---------------------|
| `port` | `PORT` |
| `databaseHost` | `DATABASE_HOST` |
| `enableCache` | `ENABLE_CACHE` |

### CLI Arguments

CLI arguments are automatically generated from your schema:

| Schema Key | Long Flag | Short Flag |
|------------|-----------|------------|
| `port` | `--port` | `-p` |
| `databaseHost` | `--database-host` | `-d` |
| `enableCache` | `--enable-cache` | `-e` |

### Priority Order

Values are merged in this order (highest priority wins):

1. **CLI arguments** (highest)
2. **Environment variables**
3. **`.env` file** (lowest)

```bash
# CLI takes precedence over env vars
PORT=3000 node app.js --port 8080  # port will be 8080
```

### Custom Configuration

Use `customConfigElement` to customize how a field is configured:

```typescript
const config = configure({
  // Custom environment variable name
  port: customConfigElement(z.number(), { envName: 'SERVER_PORT' }),
  
  // Custom CLI flag name
  host: customConfigElement(z.string(), { cmdName: '--server-host' }),
  
  // Custom short flag
  verbose: customConfigElement(z.boolean(), { cmdShort: 'v' }),
  
  // All customizations
  apiKey: customConfigElement(z.string(), {
    envName: 'API_SECRET',
    cmdName: '--api-key',
    cmdShort: 'k',
  }),
});
```

### Custom .env Path

By default, the library looks for `.env` in the current directory. You can specify a custom path:

```typescript
const config = configure(schema, { envPath: '/path/to/config.env' });
```

## 💡 Example Application

```typescript
import { configure, customConfigElement } from 'parse-my-conf';
import { z } from 'zod';

const config = configure({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  databaseUrl: customConfigElement(z.string(), { envName: 'DATABASE_URL' }),
  debug: z.boolean().default(false),
});

// Start your application
console.log(`Starting server on ${config.host}:${config.port}`);
if (config.debug) console.log('Debug mode enabled');
```

Run it:

```bash
# Using defaults from schema
node app.js

# Override with environment variables
DEBUG=true DATABASE_URL=postgres://localhost node app.js

# Override with CLI arguments
node app.js --port 8080 --debug --database-url postgres://prod
```

## 📋 Requirements

- Node.js 18+ (for ESM support)
- Zod 3.x

## 📄 License

ISC
