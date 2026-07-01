import { z } from "zod";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import * as changeCase from "change-case";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "dotenv";
import table from "table";
//#region src/utils/json.ts
function isJsonObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringifyJsonValue(value) {
	const serialized = JSON.stringify(value);
	return serialized === void 0 ? String(value) : serialized;
}
//#endregion
//#region src/utils/object.ts
function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}
//#endregion
//#region src/sources/config-file/lookup-path.ts
/**
* Owns the small dot-notation used for JSON config lookup.
*/
function parseConfigLookupPath(input) {
	const rawPath = input.configPath;
	if (rawPath === void 0 || rawPath === ".") return {
		segments: [input.fieldName],
		displayPath: `.${input.fieldName}`
	};
	if (!rawPath.startsWith(".")) throw new Error(`[konfuz] configPath for "${input.fieldName}" must start with ".".`);
	const body = rawPath.slice(1);
	if (body === "") return {
		segments: [input.fieldName],
		displayPath: `.${input.fieldName}`
	};
	const segments = body.split(".");
	for (const [index, segment] of segments.entries()) {
		const isTrailingEmptySegment = segment === "" && index === segments.length - 1;
		if (segment === "" && !isTrailingEmptySegment) throw new Error(`[konfuz] configPath for "${input.fieldName}" must not contain empty middle segments.`);
	}
	if (segments[segments.length - 1] === "") {
		segments.pop();
		segments.push(input.fieldName);
	}
	return {
		segments,
		displayPath: `.${segments.join(".")}`
	};
}
function readConfigLookupPath(data, lookupPath) {
	let current = data;
	const traversedSegments = [];
	for (const segment of lookupPath.segments) {
		if (!isJsonObject(current)) return {
			found: false,
			failedAt: `.${traversedSegments.join(".")}`
		};
		if (!hasOwn(current, segment)) return { found: false };
		current = current[segment];
		traversedSegments.push(segment);
	}
	return {
		found: true,
		value: current
	};
}
//#endregion
//#region src/schema-transformer.ts
/**
* Creates a configuration field with custom env var and/or CLI flag names.
*
* @example
* customConfigElement({ type: z.number(), envName: 'SERVER_PORT', cmdNameShort: 'p' })
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
		if (customConfigPath !== void 0) parseConfigLookupPath({
			fieldName: key,
			configPath: customConfigPath
		});
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
//#region src/utils/primitive-values.ts
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
function coerceBooleanString(value) {
	const lower = value.toLowerCase();
	if (BOOLEAN_TRUE_VALUES.has(lower)) return true;
	if (BOOLEAN_FALSE_VALUES.has(lower)) return false;
}
function coerceCliBooleanValue(value) {
	if (typeof value === "boolean") return false;
	if (value === "") return true;
	return coerceBooleanString(value);
}
function parseStringValueForField(value, type, enumValues) {
	if (type === "boolean") return coerceBooleanString(value) ?? value;
	if (type === "number") {
		const numResult = z.coerce.number().safeParse(value);
		if (numResult.success) return numResult.data;
		return value;
	}
	if (type === "enum") {
		const result = z.enum(enumValues).safeParse(value);
		if (result.success) return result.data;
		return value;
	}
	return value;
}
//#endregion
//#region src/sources/cli/short-param.ts
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
//#region src/utils/source-values.ts
function toSourceValue(value) {
	return String(value);
}
function getCliSourceName(cmdName) {
	return cmdName.startsWith("--") ? cmdName : `--${cmdName}`;
}
function getPresentValueAsString(values, name) {
	if (!hasOwn(values, name) || values[name] === void 0) return;
	return String(values[name]);
}
//#endregion
//#region src/sources/cli/parser.ts
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
			const coerced = coerceCliBooleanValue(value);
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
//#region src/sources/config-file/parser.ts
function emptyConfigFileParseResult() {
	return {
		config: {},
		sourceValues: {}
	};
}
function warnNonObjectIntermediate(file, field, lookupPath, traversedPath) {
	console.warn(`[konfuz] Found non-object value at "${traversedPath}" while looking for "${lookupPath}" in configuration file "${file.path}". Treating "${field.name}" as missing from that file.`);
}
/**
* Walks a JSON object by exact key segments. Missing final keys are silent,
* while non-object intermediate values warn and make the field missing.
*/
function readPath(file, field, lookupPath) {
	const result = readConfigLookupPath(file.data, lookupPath);
	if (!result.found && result.failedAt !== void 0) warnNonObjectIntermediate(file, field, lookupPath.displayPath, result.failedAt);
	return result.found ? result : { found: false };
}
/**
* Reads every declared config field from a loaded JSON file and returns a flat
* config object plus JSON-formatted source metadata for values that were found.
*/
function parseConfigFileValues(info, file) {
	const config = {};
	const sourceValues = {};
	for (const field of info.fields) {
		const lookupPath = parseConfigLookupPath({
			fieldName: field.name,
			configPath: field.configPath
		});
		const result = readPath(file, field, lookupPath);
		if (!result.found) continue;
		config[field.name] = result.value;
		sourceValues[field.name] = {
			name: `${file.path}:${lookupPath.displayPath}`,
			value: stringifyJsonValue(result.value)
		};
	}
	return {
		config,
		sourceValues
	};
}
//#endregion
//#region src/sources/config-file/source.ts
const CONFIG_FILE_FLAG = "--config-file";
const CONFIG_FILE_MISSING_PATH_ERROR = "[konfuz] --config-file requires a JSON file path.";
function isNodeError(error) {
	return error instanceof Error;
}
function assertNonEmptyPath(path, optionName) {
	if (path === "") throw new Error(`[konfuz] ${optionName} must not be an empty string.`);
}
function assertConfigFileFlagIsAvailable(info) {
	const field = info.fields.find((field) => getCliSourceName(field.cmdName) === CONFIG_FILE_FLAG);
	if (!field) return;
	throw new Error(`[konfuz] ${CONFIG_FILE_FLAG} is reserved for JSON config files when options.configFile is enabled. Field "${field.name}" uses the same CLI flag; set a different cmdName with customConfigElement().`);
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
		if (arg === "--") {
			strippedArgv.push(...argv.slice(index));
			break;
		}
		if (arg === "--config-file") {
			const value = argv[index + 1];
			if (value === void 0 || value === "" || value.startsWith("-")) throw new Error(CONFIG_FILE_MISSING_PATH_ERROR);
			explicitPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith(`--config-file=`)) {
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
function resolveConfigFileSource(info, option, rawArgv) {
	const normalizedOption = normalizeConfigFileOption(option);
	const emptyDefault = emptyConfigFileParseResult();
	const emptyExplicit = emptyConfigFileParseResult();
	if (!normalizedOption.enabled) return {
		argv: rawArgv,
		defaultConfigFile: emptyDefault,
		configFile: emptyExplicit
	};
	assertConfigFileFlagIsAvailable(info);
	const parsedConfigFileCli = parseConfigFileCliOption(rawArgv);
	if (parsedConfigFileCli.explicitPath !== void 0) {
		const explicitConfigFile = loadConfigFile(parsedConfigFileCli.explicitPath, { required: true });
		return {
			argv: parsedConfigFileCli.argv,
			defaultConfigFile: emptyDefault,
			configFile: explicitConfigFile ? parseConfigFileValues(info, explicitConfigFile) : emptyExplicit
		};
	}
	if (normalizedOption.defaultPath !== void 0) {
		const defaultConfigFile = loadConfigFile(normalizedOption.defaultPath, { required: false });
		return {
			argv: parsedConfigFileCli.argv,
			defaultConfigFile: defaultConfigFile ? parseConfigFileValues(info, defaultConfigFile) : emptyDefault,
			configFile: emptyExplicit
		};
	}
	return {
		argv: parsedConfigFileCli.argv,
		defaultConfigFile: emptyDefault,
		configFile: emptyExplicit
	};
}
//#endregion
//#region src/sources/env-file/parser.ts
function parseEnvFileVariables(info, envFileConfig) {
	const config = {};
	for (const [key, value] of Object.entries(envFileConfig)) {
		const field = info.fields.find((f) => f.envName === key);
		if (field && value !== void 0) config[field.name] = parseStringValueForField(value, field.type, field.enumValues);
	}
	return config;
}
//#endregion
//#region src/sources/env-file/loader.ts
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
//#region src/sources/env-var/parser.ts
function parseProcessEnvVariables(info) {
	const config = {};
	for (const field of info.fields) {
		const envValue = process.env[field.envName];
		if (envValue !== void 0) config[field.name] = parseStringValueForField(envValue, field.type, field.enumValues);
	}
	return config;
}
//#endregion
//#region src/source-resolution/resolver.ts
function resolveConfigSources(info, shape, options) {
	const defaults = extractDefaults(shape);
	const rawArgv = options?.argv ?? hideBin(process.argv);
	const configFileSource = resolveConfigFileSource(info, options?.configFile, rawArgv);
	const envFileConfig = options?.envPath ? loadEnvFile(options.envPath) : loadEnvFile();
	const envFileConfigValues = parseEnvFileVariables(info, envFileConfig);
	const envConfigValues = parseProcessEnvVariables(info);
	const cliResult = parseExplicitCliArguments(info, { argv: configFileSource.argv });
	const cliConfigValues = {
		...cliResult.config,
		...cliResult.rawValues
	};
	const config = {
		...defaults,
		...configFileSource.defaultConfigFile.config,
		...envFileConfigValues,
		...configFileSource.configFile.config,
		...envConfigValues,
		...cliConfigValues
	};
	const sources = {};
	for (const field of info.fields) {
		const name = field.name;
		const envValue = process.env[field.envName];
		const envFileValue = envFileConfig[field.envName];
		const defaultConfigFileValue = configFileSource.defaultConfigFile.sourceValues[name];
		const configFileValue = configFileSource.configFile.sourceValues[name];
		const cliValue = cliResult.sourceValues[name] ?? cliResult.rawValues[name];
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
			entry.finalValue = getPresentValueAsString(config, name);
		} else if (envFileValue !== void 0) {
			entry.finalSource = "envFile";
			entry.finalValue = envFileValue;
		} else if (defaultConfigFileValue !== void 0) {
			entry.finalSource = "defaultConfigFile";
			entry.finalValue = getPresentValueAsString(config, name);
		} else {
			const defaultValue = getPresentValueAsString(config, name);
			if (defaultValue !== void 0) entry.finalValue = defaultValue;
		}
		sources[name] = entry;
	}
	return {
		config,
		sources
	};
}
//#endregion
//#region src/source-resolution/ledger.ts
const SOURCE_PRIORITY_LABEL = "CLI > Environment > JSON file > .env file > Default JSON > default";
const SOURCE_LEDGER_COLUMNS = [
	{
		source: "defaultConfigFile",
		key: "defaultConfigFile",
		label: "Default JSON",
		width: 30
	},
	{
		source: "envFile",
		key: "envFile",
		label: ".env file",
		width: 30
	},
	{
		source: "configFile",
		key: "configFile",
		label: "JSON file",
		width: 30
	},
	{
		source: "env",
		key: "env",
		label: "Environment",
		width: 30
	},
	{
		source: "cli",
		key: "cli",
		label: "CLI",
		width: 30
	}
];
function getLedgerSourceValue(entry, key) {
	return entry[key];
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
		...SOURCE_LEDGER_COLUMNS.map((column) => STYLES.bold(column.label)),
		STYLES.bold("Final value")
	]];
	for (const name of fieldNames) {
		const entry = sources[name];
		if (!entry) {
			tableData.push([
				name,
				...SOURCE_LEDGER_COLUMNS.map(() => "-"),
				"-"
			]);
			continue;
		}
		tableData.push([
			name,
			...SOURCE_LEDGER_COLUMNS.map((column) => getCellStyle(getLedgerSourceValue(entry, column.key), entry.finalSource === column.source, entry.secret)),
			getFinalValueStyle(entry.finalValue, entry.finalSource, entry.secret)
		]);
	}
	console.log(`[konfuz] Configuration sources (priority: ${SOURCE_PRIORITY_LABEL})\n`);
	const columns = Object.fromEntries([
		[0, {
			width: 20,
			truncate: 20
		}],
		...SOURCE_LEDGER_COLUMNS.map((column, index) => [index + 1, {
			width: column.width,
			truncate: column.width
		}]),
		[SOURCE_LEDGER_COLUMNS.length + 1, {
			width: 20,
			truncate: 20
		}]
	]);
	console.log(table.table(tableData, { columns }));
}
//#endregion
//#region src/index.ts
function configure(config, options) {
	const info = extractSchemaInfo(config);
	const schema = normalizeToZodObject(config);
	const sourceResolution = resolveConfigSources(info, schema.shape, options);
	const result = schema.safeParse(sourceResolution.config);
	if (!result.success) {
		const errors = result.error.issues.map((issue) => {
			const fieldName = String(issue.path[0]);
			if (info.fields.find((f) => f.name === fieldName)?.secret) return `${fieldName}: ***`;
			return `${fieldName}: ${issue.message}`;
		}).join(", ");
		throw new Error(`Configuration validation failed: ${errors}`);
	}
	const data = result.data;
	data.__$sources__ = sourceResolution.sources;
	return data;
}
//#endregion
export { configure, customConfigElement, printConfiguredSources, toCliName, toEnvName };
