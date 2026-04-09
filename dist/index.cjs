Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let yargs_helpers = require("yargs/helpers");
let zod = require("zod");
let dotenv = require("dotenv");
let fs = require("fs");
let path = require("path");
let yargs = require("yargs");
yargs = __toESM(yargs);
let change_case = require("change-case");
change_case = __toESM(change_case);
let table = require("table");
table = __toESM(table);
//#region src/schema-transformer.ts
/**
* Creates a configuration field with custom env var and/or CLI flag names.
*
* @example
* customConfigElement(z.number(), { envName: 'SERVER_PORT', cmdShort: 'p' })
*/
function customConfigElement(type, options) {
	return {
		type,
		envName: options?.envName,
		cmdName: options?.cmdName,
		cmdNameShort: options?.cmdNameShort,
		cmdDescription: options?.cmdDescription,
		secret: options?.secret
	};
}
/** Converts a camelCase key to UPPER_SNAKE_CASE (e.g. `databaseHost` → `DATABASE_HOST`). */
function toEnvName(key) {
	return key.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toUpperCase();
}
/** Converts a camelCase key to kebab-case (e.g. `databaseHost` → `database-host`). */
function toCliName(key) {
	return key.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}
/** Unwraps Zod wrapper types (Optional, Default) to determine the core FieldType. */
function inferFieldType(schema) {
	if (schema instanceof zod.z.ZodString) return { type: "string" };
	if (schema instanceof zod.z.ZodNumber) return { type: "number" };
	if (schema instanceof zod.z.ZodBoolean) return { type: "boolean" };
	if (schema instanceof zod.z.ZodEnum) return {
		type: "enum",
		enumValues: schema.options
	};
	if (schema instanceof zod.z.ZodDefault) return inferFieldType(schema.def.innerType);
	if (schema instanceof zod.z.ZodOptional) return inferFieldType(schema.def.innerType);
	return { type: "string" };
}
/**
* Returns the default value declared on a `ZodDefault` schema, or `undefined`
* if the schema has no default.
*/
function extractDefaultValue(schema) {
	if (schema instanceof zod.z.ZodDefault) {
		const defaultValue = schema._def.defaultValue;
		return typeof defaultValue === "function" ? defaultValue() : defaultValue;
	}
}
/** Returns `true` when the schema allows the field to be absent at parse time. */
function isFieldOptional(schema) {
	if (schema instanceof zod.z.ZodOptional) return true;
	if (schema instanceof zod.z.ZodDefault) return true;
	if (schema instanceof zod.z.ZodReadonly) return isFieldOptional(schema.def.innerType);
	return false;
}
/** Type guard: returns `true` when a config entry is a `FieldConfig` rather than a bare Zod schema. */
function isFieldConfig(value) {
	return typeof value === "object" && value !== null && "type" in value && value.type instanceof zod.z.ZodType;
}
/**
* Analyses a user-provided config object (or `z.ZodObject`) and returns a
* `SchemaDescriptor` containing per-field metadata and the raw Zod schemas.
*/
function extractSchemaInfo(config) {
	const fields = [];
	const zodSchemas = {};
	const entries = Object.entries(config);
	for (const [key, value] of entries) {
		let schema;
		let customEnvName;
		let customCmdName;
		let customCmdNameShort;
		let customCmdDescription;
		let secret;
		if (isFieldConfig(value)) {
			schema = value.type;
			customEnvName = value.envName;
			customCmdName = value.cmdName;
			customCmdNameShort = value.cmdNameShort;
			customCmdDescription = value.cmdDescription;
			secret = value.secret;
		} else schema = value;
		zodSchemas[key] = schema;
		const { type, enumValues } = inferFieldType(schema);
		fields.push({
			name: key,
			envName: customEnvName ?? toEnvName(key),
			cmdName: customCmdName ?? toCliName(key),
			cmdNameShort: customCmdNameShort,
			cmdDescription: customCmdDescription,
			type,
			isOptional: isFieldOptional(schema),
			defaultValue: extractDefaultValue(schema),
			enumValues,
			secret
		});
	}
	return {
		fields,
		zodSchemas
	};
}
/**
* Extracts all default values from a Zod shape (the `.shape` property of a
* `z.ZodObject`), returning them as a plain key/value record.
*/
function extractDefaults(shape) {
	const defaults = {};
	for (const [key, schema] of Object.entries(shape)) {
		const defaultValue = extractDefaultValue(schema);
		if (defaultValue !== void 0) defaults[key] = defaultValue;
	}
	return defaults;
}
/**
* Converts a `ConfigInput` into a `z.ZodObject` suitable for final validation
* with `safeParse()`.
*/
function normalizeToZodObject(config) {
	const shape = {};
	for (const [key, value] of Object.entries(config)) shape[key] = isFieldConfig(value) ? value.type : value;
	return zod.z.object(shape);
}
//#endregion
//#region src/loader.ts
function loadSingleEnvFile(envPath) {
	try {
		return (0, dotenv.parse)((0, fs.readFileSync)(envPath, "utf-8"));
	} catch {
		return {};
	}
}
function loadEnvFile(envPath) {
	if (Array.isArray(envPath)) return envPath.reduce((acc, p) => {
		return {
			...acc,
			...loadSingleEnvFile(p)
		};
	}, {});
	return loadSingleEnvFile(envPath ?? (0, path.resolve)(process.cwd(), ".env"));
}
//#endregion
//#region src/short-param.ts
const base = "abcdefghijklmnopqrstuvwxyz".split("");
function decode(id) {
	let result = "";
	let rest = id;
	while (rest > 0) {
		result = base[rest % base.length] + result;
		rest = Math.floor(rest / base.length);
	}
	return result || "a";
}
var ShortParamGenerator = class {
	assigned = /* @__PURE__ */ new Map();
	usedShortParams = /* @__PURE__ */ new Set();
	alphabetIndex = 0;
	getWords(name) {
		return change_case.noCase(name).split(" ");
	}
	getNextAvailableAlphabet() {
		while (true) {
			const label = decode(this.alphabetIndex);
			if (!this.usedShortParams.has(label)) return label;
			this.alphabetIndex++;
		}
	}
	generate(name) {
		const words = this.getWords(name);
		for (let numWords = 1; numWords <= words.length; numWords++) {
			const base = words.slice(0, numWords).map((w) => w[0].toLowerCase()).join("");
			if (!this.usedShortParams.has(base)) return base;
		}
		return this.getNextAvailableAlphabet();
	}
	getShortParam(name) {
		if (this.assigned.has(name)) return this.assigned.get(name);
		const shortParam = this.generate(name);
		this.usedShortParams.add(shortParam);
		this.assigned.set(name, shortParam);
		return shortParam;
	}
	reset() {
		this.assigned.clear();
		this.usedShortParams.clear();
		this.alphabetIndex = 0;
	}
};
const globalGenerator = new ShortParamGenerator();
//#endregion
//#region src/cli-parser.ts
const BOOLEAN_TRUE_VALUES$1 = new Set([
	"1",
	"true",
	"yes"
]);
const BOOLEAN_FALSE_VALUES$1 = new Set([
	"0",
	"false",
	"no"
]);
function coerceBooleanValue(value) {
	if (typeof value === "boolean") return false;
	if (value === "") return true;
	const lower = value.toLowerCase();
	if (BOOLEAN_TRUE_VALUES$1.has(lower)) return true;
	if (BOOLEAN_FALSE_VALUES$1.has(lower)) return false;
}
function parseCliArguments(info, options) {
	const argv = options?.argv ?? (0, yargs_helpers.hideBin)(process.argv);
	const config = {};
	const rawValues = {};
	globalGenerator.reset();
	if (argv.length === 0) {
		for (const field of info.fields) if (field.defaultValue !== void 0) config[field.name] = field.defaultValue;
		return config;
	}
	let y = (0, yargs.default)(argv);
	for (const field of info.fields) {
		const cliName = field.cmdName;
		const shortParam = field.cmdNameShort ? field.cmdNameShort : globalGenerator.getShortParam(field.name);
		if (field.type === "number") y = y.number(cliName);
		else y = y.string(cliName);
		const opts = {};
		if (field.enumValues) opts.choices = field.enumValues;
		if (field.cmdDescription) opts.describe = field.cmdDescription;
		y = y.option(cliName, {
			alias: shortParam,
			...opts
		});
	}
	const parsed = y.argv;
	for (const field of info.fields) {
		const value = parsed[field.cmdName];
		if (value !== void 0) if (field.type === "boolean") {
			const coerced = coerceBooleanValue(value);
			if (coerced !== void 0) config[field.name] = coerced;
			else rawValues[field.name] = value;
		} else config[field.name] = value;
		else if (field.defaultValue !== void 0) config[field.name] = field.defaultValue;
	}
	if (Object.keys(rawValues).length > 0) return {
		config,
		rawValues
	};
	return config;
}
//#endregion
//#region src/validate-schemas.ts
const UNSUPPORTED_TYPE_NAMES = new Set([
	"ZodObject",
	"ZodArray",
	"ZodUnion",
	"ZodRecord",
	"ZodTuple",
	"ZodIntersection",
	"ZodDiscriminatedUnion",
	"ZodTransform",
	"ZodFunction",
	"ZodPromise",
	"ZodMap",
	"ZodSet"
]);
function isSupportedSchemaType(schema) {
	const name = schema.constructor.name;
	if (UNSUPPORTED_TYPE_NAMES.has(name)) return false;
	if (schema instanceof zod.z.ZodString || schema instanceof zod.z.ZodNumber || schema instanceof zod.z.ZodBoolean || schema instanceof zod.z.ZodEnum || schema instanceof zod.z.ZodLazy) return true;
	const def = schema._def;
	if (def?.innerType) return isSupportedSchemaType(def.innerType);
	if (def?.getter) try {
		return isSupportedSchemaType(def.getter());
	} catch {
		return false;
	}
	return false;
}
function schemaFriendlyName(schema) {
	return schema.constructor.name.replace("Zod", "");
}
function isZodSchema(value) {
	if (value === null || typeof value !== "object") return false;
	const name = value.constructor?.name;
	return name ? name.startsWith("Zod") : false;
}
function validateSupportedSchemas(config) {
	for (const [key, value] of Object.entries(config)) {
		const schema = typeof value === "object" && value !== null && "type" in value && value.type instanceof zod.z.ZodType ? value.type : value;
		if (!isZodSchema(schema)) throw new Error(`[konfuz] Unexpected config key "${key}": expected a Zod schema or customConfigElement(), got ${typeof schema}. Use z.string(), z.number(), z.boolean(), or z.enum() for config fields.`);
		const zodSchema = schema;
		const name = zodSchema.constructor.name;
		if (UNSUPPORTED_TYPE_NAMES.has(name)) {
			const friendlyName = schemaFriendlyName(zodSchema);
			const hint = name === "ZodObject" ? `Use z.string() or z.number() for field "${key}".` : name === "ZodArray" ? `Use z.string() for a single string field, or split into separate fields.` : name === "ZodUnion" ? `Ensure all union members are supported types (string, number, boolean, enum).` : `Use z.string(), z.number(), z.boolean(), or z.enum() for field "${key}".`;
			throw new Error(`[konfuz] Unsupported schema type: ${friendlyName}. Only primitive types (string, number, boolean, enum) and their optional/default wrappers are supported. ${hint}`);
		}
		if (!isSupportedSchemaType(zodSchema)) {
			const friendlyName = schemaFriendlyName(zodSchema);
			throw new Error(`[konfuz] Unsupported schema type: ${friendlyName}. Use z.string(), z.number(), z.boolean(), or z.enum() for field "${key}".`);
		}
	}
}
//#endregion
//#region src/env-parser.ts
function parseEnvVariables(info, envFileConfig) {
	const config = {};
	for (const field of info.fields) {
		const envValue = process.env[field.envName];
		if (envValue !== void 0) config[field.name] = parseWithZod(envValue, field.type, field.enumValues);
	}
	for (const [key, value] of Object.entries(envFileConfig)) {
		const field = info.fields.find((f) => f.envName === key);
		if (field && value !== void 0 && config[field.name] === void 0) config[field.name] = parseWithZod(value, field.type, field.enumValues);
	}
	return config;
}
const BOOLEAN_TRUE_VALUES = new Set([
	"1",
	"true",
	"yes"
]);
const BOOLEAN_FALSE_VALUES = new Set([
	"0",
	"false",
	"no"
]);
function coerceBoolean(value) {
	const lower = value.toLowerCase();
	if (BOOLEAN_TRUE_VALUES.has(lower)) return true;
	if (BOOLEAN_FALSE_VALUES.has(lower)) return false;
}
function isBooleanString(value) {
	const lower = value.toLowerCase();
	return BOOLEAN_TRUE_VALUES.has(lower) || BOOLEAN_FALSE_VALUES.has(lower);
}
function parseWithZod(value, type, enumValues) {
	if (type === "boolean") return coerceBoolean(value);
	if (type === "number") {
		const numResult = zod.z.coerce.number().safeParse(value);
		if (numResult.success) return numResult.data;
		if (isBooleanString(value)) return;
		return;
	}
	if (type === "enum") {
		const result = zod.z.enum(enumValues).safeParse(value);
		if (result.success) return result.data;
		return;
	}
	return value;
}
//#endregion
//#region src/print-config-sources.ts
const STYLES = {
	bold: (text) => `\x1b[1m${text}\x1b[0m`,
	dim: (text) => `\x1b[2m${text}\x1b[0m`,
	green: (text) => `\x1b[32m${text}\x1b[0m`,
	yellow: (text) => `\x1b[33m${text}\x1b[0m`,
	blue: (text) => `\x1b[34m${text}\x1b[0m`,
	gray: (text) => `\x1b[90m${text}\x1b[0m`
};
function formatSourceValue(sv) {
	if (!sv) return "-";
	return `${sv.name}=${sv.value}`;
}
function getCellStyle(sv, isActive) {
	if (!sv) return STYLES.gray("-");
	const text = formatSourceValue(sv);
	return isActive ? STYLES.bold(text) : STYLES.dim(text);
}
function getFinalValueStyle(value, source) {
	if (value === void 0) return STYLES.gray("-");
	switch (source) {
		case "cli": return STYLES.green(value);
		case "env": return STYLES.yellow(value);
		case "envFile": return STYLES.blue(value);
		default: return STYLES.dim(value);
	}
}
function printConfiguredSources(configResult) {
	const sources = configResult.__$sources__;
	if (!sources) throw new Error("This is not a Konfuz configuration");
	const fieldNames = Object.keys(configResult).filter((k) => !k.startsWith("__"));
	const tableData = [[
		STYLES.bold("Field"),
		STYLES.bold(".env file"),
		STYLES.bold("Environment"),
		STYLES.bold("CLI"),
		STYLES.bold("Final value")
	]];
	for (const name of fieldNames) {
		const entry = sources[name];
		if (!entry) {
			tableData.push([
				name,
				"-",
				"-",
				"-",
				"-"
			]);
			continue;
		}
		tableData.push([
			name,
			getCellStyle(entry.envFile, entry.finalSource === "envFile"),
			getCellStyle(entry.env, entry.finalSource === "env"),
			getCellStyle(entry.cli, entry.finalSource === "cli"),
			getFinalValueStyle(entry.finalValue, entry.finalSource)
		]);
	}
	console.log("[konfuz] Configuration sources (priority: CLI > Environment > .env file > default)\n");
	console.log(table.default.table(tableData, { columns: {
		0: {
			width: 20,
			truncate: 20
		},
		1: {
			width: 30,
			truncate: 30
		},
		2: {
			width: 30,
			truncate: 30
		},
		3: {
			width: 30,
			truncate: 30
		},
		4: {
			width: 20,
			truncate: 20
		}
	} }));
}
//#endregion
//#region src/index.ts
function configure(config, options) {
	validateSupportedSchemas(config);
	const info = extractSchemaInfo(config);
	const schema = normalizeToZodObject(config);
	const defaults = extractDefaults(schema.shape);
	const envFileConfig = options?.envPath ? loadEnvFile(options.envPath) : loadEnvFile();
	const envConfig = parseEnvVariables(info, envFileConfig);
	const cliResult = parseCliArguments(info, { argv: options?.argv });
	const cliConfig = cliResult.config ?? cliResult;
	const cliArgsProvided = (options?.argv ?? (0, yargs_helpers.hideBin)(process.argv)).length > 0;
	const sources = {};
	const merged = {
		...defaults,
		...envConfig,
		...cliConfig
	};
	for (const field of info.fields) {
		const name = field.name;
		const cliValue = cliConfig[name];
		const envValue = process.env[field.envName];
		const envFileValue = envFileConfig[field.envName];
		const cliWasProvided = cliArgsProvided && cliValue !== void 0;
		const entry = {
			finalSource: "default",
			envFile: envFileValue !== void 0 ? {
				name: field.envName,
				value: envFileValue
			} : void 0,
			env: envValue !== void 0 ? {
				name: field.envName,
				value: envValue
			} : void 0,
			cli: cliWasProvided ? {
				name: `--${field.cmdName}`,
				value: String(cliValue)
			} : void 0
		};
		if (cliWasProvided) {
			entry.finalSource = "cli";
			entry.finalValue = String(cliValue);
		} else if (envValue !== void 0) {
			entry.finalSource = "env";
			entry.finalValue = envValue;
		} else if (envFileValue !== void 0) {
			entry.finalSource = "envFile";
			entry.finalValue = envFileValue;
		} else if (name in merged) entry.finalValue = String(merged[name]);
		sources[name] = entry;
	}
	const result = schema.safeParse(merged);
	if (!result.success) {
		result.error.__$sources__ = sources;
		const errors = result.error.issues.map((issue) => {
			const fieldName = String(issue.path[0]);
			if (info.fields.find((f) => f.name === fieldName)?.secret) return `${fieldName}: ***`;
			return `${fieldName}: ${issue.message}`;
		}).join(", ");
		throw new Error(`Configuration validation failed: ${errors}`);
	}
	const data = result.data;
	Object.defineProperty(data, "__$sources__", {
		value: sources,
		enumerable: false,
		writable: true,
		configurable: true
	});
	return data;
}
//#endregion
exports.configure = configure;
exports.customConfigElement = customConfigElement;
exports.printConfiguredSources = printConfiguredSources;
exports.toCliName = toCliName;
exports.toEnvName = toEnvName;
