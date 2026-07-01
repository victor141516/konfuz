import { hideBin } from "yargs/helpers";
import { z } from "zod";
import { parse } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import yargs from "yargs";
import * as changeCase from "change-case";
import table from "table";
//#region src/schema-transformer.ts
/**
* Creates a configuration field with custom env var and/or CLI flag names.
*
* @example
* customConfigElement(z.number(), { envName: 'SERVER_PORT', cmdShort: 'p' })
*/
function customConfigElement(options) {
	return {
		type: options.type,
		envName: options?.envName,
		cmdName: options?.cmdName,
		cmdNameShort: options?.cmdNameShort,
		cmdDescription: options?.cmdDescription,
		configPath: options?.configPath,
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
/** Unwraps Zod wrapper types (Default, Optional, Nullable, Readonly) to determine the core FieldType. */
function inferFieldType(schema) {
	if (schema instanceof z.ZodString) return { type: "string" };
	if (schema instanceof z.ZodNumber) return { type: "number" };
	if (schema instanceof z.ZodBoolean) return { type: "boolean" };
	if (schema instanceof z.ZodEnum) return {
		type: "enum",
		enumValues: schema.options
	};
	if (schema instanceof z.ZodDefault) return inferFieldType(schema.def.innerType);
	if (schema instanceof z.ZodOptional) return inferFieldType(schema.def.innerType);
	if (schema instanceof z.ZodNullable) return inferFieldType(schema.def.innerType);
	if (schema instanceof z.ZodReadonly) return inferFieldType(schema.def.innerType);
	return { type: "string" };
}
/**
* Returns the default value declared on a `ZodDefault` schema, or `undefined`
* if the schema has no default.
*/
function extractDefaultValue(schema) {
	if (schema instanceof z.ZodDefault) {
		const defaultValue = schema.def.defaultValue;
		return typeof defaultValue === "function" ? defaultValue() : defaultValue;
	}
}
/** Returns `true` when the schema allows the field to be absent at parse time. */
function isFieldOptional(schema) {
	if (schema instanceof z.ZodOptional) return true;
	if (schema instanceof z.ZodDefault) return true;
	if (schema instanceof z.ZodReadonly) return isFieldOptional(schema.def.innerType);
	return false;
}
function simpleTypeToZod(type) {
	switch (type) {
		case "string": return z.string();
		case "number": return z.number();
		case "boolean": return z.boolean();
	}
}
function isSimpleType(value) {
	return typeof value === "string" && [
		"string",
		"number",
		"boolean"
	].includes(value);
}
/** Type guard: returns `true` when a config entry is a `FieldConfig` rather than a bare Zod schema or simple type. */
function isFieldConfig(value) {
	return typeof value === "object" && value !== null && "type" in value && (value.type instanceof z.ZodType || isSimpleType(value.type));
}
function validateConfigPath(configPath, fieldName) {
	if (!configPath.startsWith(".")) throw new Error(`[konfuz] configPath for "${fieldName}" must start with ".".`);
	const body = configPath.slice(1);
	if (body === "") return;
	const segments = body.split(".");
	for (const [index, segment] of segments.entries()) {
		const isTrailingEmptySegment = segment === "" && index === segments.length - 1;
		if (segment === "" && !isTrailingEmptySegment) throw new Error(`[konfuz] configPath for "${fieldName}" must not contain empty middle segments.`);
	}
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
		let customConfigPath;
		let secret;
		if (isFieldConfig(value)) {
			schema = isSimpleType(value.type) ? simpleTypeToZod(value.type) : value.type;
			customEnvName = value.envName;
			customCmdName = value.cmdName;
			customCmdNameShort = value.cmdNameShort;
			customCmdDescription = value.cmdDescription;
			customConfigPath = value.configPath;
			secret = value.secret;
		} else if (isSimpleType(value)) schema = simpleTypeToZod(value);
		else schema = value;
		zodSchemas[key] = schema;
		const { type, enumValues } = inferFieldType(schema);
		if (customConfigPath !== void 0) validateConfigPath(customConfigPath, key);
		fields.push({
			name: key,
			envName: customEnvName ?? toEnvName(key),
			cmdName: customCmdName ?? toCliName(key),
			cmdNameShort: customCmdNameShort,
			cmdDescription: customCmdDescription,
			configPath: customConfigPath,
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
	for (const [key, value] of Object.entries(config)) if (isFieldConfig(value)) shape[key] = isSimpleType(value.type) ? simpleTypeToZod(value.type) : value.type;
	else if (isSimpleType(value)) shape[key] = simpleTypeToZod(value);
	else shape[key] = value;
	return z.object(shape);
}
//#endregion
//#region src/loader.ts
function loadSingleEnvFile(envPath) {
	try {
		return parse(readFileSync(envPath, "utf-8"));
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
	return loadSingleEnvFile(envPath ?? resolve(process.cwd(), ".env"));
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
		return changeCase.noCase(name).split(" ");
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
function toSourceValue(value) {
	return String(value);
}
function parseConfiguredCliArguments(info, argv) {
	const config = {};
	const rawValues = {};
	const sourceValues = {};
	globalGenerator.reset();
	if (argv.length === 0) return {
		config,
		rawValues,
		sourceValues
	};
	let y = yargs(argv);
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
			if (coerced !== void 0) {
				config[field.name] = coerced;
				sourceValues[field.name] = toSourceValue(coerced);
			} else rawValues[field.name] = value;
		} else {
			config[field.name] = value;
			sourceValues[field.name] = toSourceValue(value);
		}
	}
	return {
		config,
		rawValues,
		sourceValues
	};
}
function parseExplicitCliArguments(info, options) {
	return parseConfiguredCliArguments(info, options?.argv ?? hideBin(process.argv));
}
//#endregion
//#region src/env-parser.ts
function parseProcessEnvVariables(info) {
	const config = {};
	for (const field of info.fields) {
		const envValue = process.env[field.envName];
		if (envValue !== void 0) config[field.name] = parseWithZod(envValue, field.type, field.enumValues);
	}
	return config;
}
function parseEnvFileVariables(info, envFileConfig) {
	const config = {};
	for (const [key, value] of Object.entries(envFileConfig)) {
		const field = info.fields.find((f) => f.envName === key);
		if (field && value !== void 0) config[field.name] = parseWithZod(value, field.type, field.enumValues);
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
		const numResult = z.coerce.number().safeParse(value);
		if (numResult.success) return numResult.data;
		if (isBooleanString(value)) return;
		return;
	}
	if (type === "enum") {
		const result = z.enum(enumValues).safeParse(value);
		if (result.success) return result.data;
		return;
	}
	return value;
}
//#endregion
//#region src/json-utils.ts
function isJsonObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringifyJsonValue(value) {
	const serialized = JSON.stringify(value);
	return serialized === void 0 ? String(value) : serialized;
}
//#endregion
//#region src/config-file-loader.ts
const CONFIG_FILE_FLAG = "--config-file";
const CONFIG_FILE_MISSING_PATH_ERROR = "[konfuz] --config-file requires a JSON file path.";
function isNodeError(error) {
	return error instanceof Error;
}
function assertNonEmptyPath(path, optionName) {
	if (path === "") throw new Error(`[konfuz] ${optionName} must not be an empty string.`);
}
function normalizeConfigFileOption(option) {
	if (option === void 0 || option === false) return { enabled: false };
	if (option === true) return { enabled: true };
	if (typeof option === "string") {
		assertNonEmptyPath(option, "options.configFile");
		return {
			enabled: true,
			defaultPath: option
		};
	}
	assertNonEmptyPath(option.defaultPath, "options.configFile.defaultPath");
	return {
		enabled: true,
		defaultPath: option.defaultPath
	};
}
function parseConfigFileCliOption(argv) {
	const strippedArgv = [];
	let explicitPath;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === CONFIG_FILE_FLAG) {
			const value = argv[index + 1];
			if (value === void 0 || value === "" || value.startsWith("-")) throw new Error(CONFIG_FILE_MISSING_PATH_ERROR);
			explicitPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith(`${CONFIG_FILE_FLAG}=`)) {
			const value = arg.slice(14);
			if (value === "") throw new Error(CONFIG_FILE_MISSING_PATH_ERROR);
			explicitPath = value;
			continue;
		}
		strippedArgv.push(arg);
	}
	return {
		argv: strippedArgv,
		explicitPath
	};
}
function loadConfigFile(path, options) {
	const resolvedPath = resolve(process.cwd(), path);
	let content;
	try {
		content = readFileSync(resolvedPath, "utf-8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT" && !options.required) return;
		if (isNodeError(error) && error.code === "ENOENT") throw new Error(`[konfuz] JSON config file not found: ${path}`);
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`[konfuz] Could not read JSON config file "${path}": ${reason}`);
	}
	let data;
	try {
		data = JSON.parse(content);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`[konfuz] Failed to parse JSON config file "${path}": ${reason}`);
	}
	if (!isJsonObject(data)) throw new Error(`[konfuz] JSON config file "${path}" must contain a JSON object at the root.`);
	return {
		path,
		resolvedPath,
		data
	};
}
//#endregion
//#region src/config-file-parser.ts
function hasOwn$1(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}
/**
* Converts a field's configured `configPath` into the exact object-key segments
* used for lookup and the canonical display path used in source reporting.
*/
function resolveConfigLookupPath(field) {
	const rawPath = field.configPath;
	if (rawPath === void 0 || rawPath === ".") return {
		segments: [field.name],
		displayPath: `.${field.name}`
	};
	const segments = rawPath.slice(1).split(".");
	if (segments[segments.length - 1] === "") {
		segments.pop();
		segments.push(field.name);
	}
	return {
		segments,
		displayPath: `.${segments.join(".")}`
	};
}
function warnNonObjectIntermediate(file, field, lookupPath, traversedPath) {
	console.warn(`[konfuz] Found non-object value at "${traversedPath}" while looking for "${lookupPath}" in configuration file "${file.path}". Treating "${field.name}" as missing from that file.`);
}
/**
* Walks a JSON object by exact key segments. Missing final keys are silent,
* while non-object intermediate values warn and make the field missing.
*/
function readPath(file, field, segments, displayPath) {
	let current = file.data;
	const traversedSegments = [];
	for (const segment of segments) {
		if (!isJsonObject(current)) {
			warnNonObjectIntermediate(file, field, displayPath, `.${traversedSegments.join(".")}`);
			return { found: false };
		}
		if (!hasOwn$1(current, segment)) return { found: false };
		current = current[segment];
		traversedSegments.push(segment);
	}
	return {
		found: true,
		value: current
	};
}
/**
* Reads every declared config field from a loaded JSON file and returns a flat
* config object plus JSON-formatted source metadata for values that were found.
*/
function parseConfigFileValues(info, file) {
	const config = {};
	const sourceValues = {};
	for (const field of info.fields) {
		const { segments, displayPath } = resolveConfigLookupPath(field);
		const result = readPath(file, field, segments, displayPath);
		if (!result.found) continue;
		config[field.name] = result.value;
		sourceValues[field.name] = {
			name: `${file.path}:${displayPath}`,
			value: stringifyJsonValue(result.value)
		};
	}
	return {
		config,
		sourceValues
	};
}
//#endregion
//#region src/print-config-sources.ts
const STYLES = {
	bold: (text) => `\x1b[1m${text}\x1b[0m`,
	dim: (text) => `\x1b[2m${text}\x1b[0m`,
	green: (text) => `\x1b[32m${text}\x1b[0m`,
	yellow: (text) => `\x1b[33m${text}\x1b[0m`,
	blue: (text) => `\x1b[34m${text}\x1b[0m`,
	magenta: (text) => `\x1b[35m${text}\x1b[0m`,
	gray: (text) => `\x1b[90m${text}\x1b[0m`
};
const MASK = "***";
function formatSourceValue(sv, isSecret) {
	if (!sv) return "-";
	const value = isSecret ? MASK : sv.value;
	return `${sv.name}=${value}`;
}
function getCellStyle(sv, isActive, isSecret) {
	if (!sv) return STYLES.gray("-");
	const text = formatSourceValue(sv, isSecret);
	return isActive ? STYLES.bold(text) : STYLES.dim(text);
}
function getFinalValueStyle(value, source, isSecret) {
	if (value === void 0) return STYLES.gray("-");
	const displayValue = isSecret ? MASK : value;
	switch (source) {
		case "cli": return STYLES.green(displayValue);
		case "env": return STYLES.yellow(displayValue);
		case "configFile": return STYLES.magenta(displayValue);
		case "envFile": return STYLES.blue(displayValue);
		case "defaultConfigFile": return STYLES.dim(displayValue);
		default: return STYLES.dim(displayValue);
	}
}
function printConfiguredSources(configResult) {
	if (typeof configResult !== "object" || configResult === null) throw new Error("This is not a Konfuz configuration");
	if (!("__$sources__" in configResult)) throw new Error("This is not a Konfuz configuration");
	if (!configResult.__$sources__) throw new Error("This is not a Konfuz configuration");
	const sources = configResult.__$sources__;
	const fieldNames = Object.keys(configResult).filter((k) => !k.startsWith("__"));
	const tableData = [[
		STYLES.bold("Field"),
		STYLES.bold("Default JSON"),
		STYLES.bold(".env file"),
		STYLES.bold("JSON file"),
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
				"-",
				"-",
				"-"
			]);
			continue;
		}
		tableData.push([
			name,
			getCellStyle(entry.defaultConfigFile, entry.finalSource === "defaultConfigFile", entry.secret),
			getCellStyle(entry.envFile, entry.finalSource === "envFile", entry.secret),
			getCellStyle(entry.configFile, entry.finalSource === "configFile", entry.secret),
			getCellStyle(entry.env, entry.finalSource === "env", entry.secret),
			getCellStyle(entry.cli, entry.finalSource === "cli", entry.secret),
			getFinalValueStyle(entry.finalValue, entry.finalSource, entry.secret)
		]);
	}
	console.log("[konfuz] Configuration sources (priority: CLI > Environment > JSON file > .env file > Default JSON > default)\n");
	console.log(table.table(tableData, { columns: {
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
			width: 30,
			truncate: 30
		},
		5: {
			width: 30,
			truncate: 30
		},
		6: {
			width: 20,
			truncate: 20
		}
	} }));
}
//#endregion
//#region src/index.ts
function emptyConfigFileParseResult() {
	return {
		config: {},
		sourceValues: {}
	};
}
function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}
function getCliSourceName(cmdName) {
	return cmdName.startsWith("--") ? cmdName : `--${cmdName}`;
}
function configure(config, options) {
	const info = extractSchemaInfo(config);
	const schema = normalizeToZodObject(config);
	const defaults = extractDefaults(schema.shape);
	const rawArgv = options?.argv ?? hideBin(process.argv);
	const configFileOption = normalizeConfigFileOption(options?.configFile);
	let argv = rawArgv;
	let defaultConfigFileResult = emptyConfigFileParseResult();
	let configFileResult = emptyConfigFileParseResult();
	if (configFileOption.enabled) {
		const parsedConfigFileCli = parseConfigFileCliOption(rawArgv);
		argv = parsedConfigFileCli.argv;
		if (parsedConfigFileCli.explicitPath !== void 0) {
			const explicitConfigFile = loadConfigFile(parsedConfigFileCli.explicitPath, { required: true });
			if (explicitConfigFile) configFileResult = parseConfigFileValues(info, explicitConfigFile);
		} else if (configFileOption.defaultPath !== void 0) {
			const defaultConfigFile = loadConfigFile(configFileOption.defaultPath, { required: false });
			if (defaultConfigFile) defaultConfigFileResult = parseConfigFileValues(info, defaultConfigFile);
		}
	}
	const envFileConfig = options?.envPath ? loadEnvFile(options.envPath) : loadEnvFile();
	const envFileConfigValues = parseEnvFileVariables(info, envFileConfig);
	const envConfigValues = parseProcessEnvVariables(info);
	const cliResult = parseExplicitCliArguments(info, { argv });
	const sources = {};
	const merged = {
		...defaults,
		...defaultConfigFileResult.config,
		...envFileConfigValues,
		...configFileResult.config,
		...envConfigValues,
		...cliResult.config
	};
	for (const field of info.fields) {
		const name = field.name;
		const envValue = process.env[field.envName];
		const envFileValue = envFileConfig[field.envName];
		const defaultConfigFileValue = defaultConfigFileResult.sourceValues[name];
		const configFileValue = configFileResult.sourceValues[name];
		const cliValue = cliResult.sourceValues[name];
		const entry = {
			finalSource: "default",
			defaultConfigFile: defaultConfigFileValue,
			envFile: envFileValue !== void 0 ? {
				name: field.envName,
				value: envFileValue
			} : void 0,
			configFile: configFileValue,
			env: envValue !== void 0 ? {
				name: field.envName,
				value: envValue
			} : void 0,
			cli: cliValue !== void 0 ? {
				name: getCliSourceName(field.cmdName),
				value: cliValue
			} : void 0,
			secret: field.secret
		};
		if (entry.cli) {
			entry.finalSource = "cli";
			entry.finalValue = entry.cli.value;
		} else if (envValue !== void 0) {
			entry.finalSource = "env";
			entry.finalValue = envValue;
		} else if (configFileValue !== void 0) {
			entry.finalSource = "configFile";
			entry.finalValue = configFileValue.value;
		} else if (envFileValue !== void 0) {
			entry.finalSource = "envFile";
			entry.finalValue = envFileValue;
		} else if (defaultConfigFileValue !== void 0) {
			entry.finalSource = "defaultConfigFile";
			entry.finalValue = defaultConfigFileValue.value;
		} else if (hasOwn(merged, name) && merged[name] !== void 0) entry.finalValue = String(merged[name]);
		sources[name] = entry;
	}
	const result = schema.safeParse(merged);
	if (!result.success) {
		const errors = result.error.issues.map((issue) => {
			const fieldName = String(issue.path[0]);
			if (info.fields.find((f) => f.name === fieldName)?.secret) return `${fieldName}: ***`;
			return `${fieldName}: ${issue.message}`;
		}).join(", ");
		throw new Error(`Configuration validation failed: ${errors}`);
	}
	const data = result.data;
	data.__$sources__ = sources;
	return data;
}
//#endregion
export { configure, customConfigElement, printConfiguredSources, toCliName, toEnvName };
