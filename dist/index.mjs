import { z } from "zod";
import { parse } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
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
		cmdDescription: options?.cmdDescription
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
	if (schema instanceof z.ZodString) return { type: "string" };
	if (schema instanceof z.ZodNumber) return { type: "number" };
	if (schema instanceof z.ZodBoolean) return { type: "boolean" };
	if (schema instanceof z.ZodEnum) return {
		type: "enum",
		enumValues: schema.options
	};
	if (schema instanceof z.ZodDefault) return inferFieldType(schema.def.innerType);
	if (schema instanceof z.ZodOptional) return inferFieldType(schema.def.innerType);
	return { type: "string" };
}
/**
* Returns the default value declared on a `ZodDefault` schema, or `undefined`
* if the schema has no default.
*/
function extractDefaultValue(schema) {
	if (schema instanceof z.ZodDefault) {
		const defaultValue = schema._def.defaultValue;
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
/** Type guard: returns `true` when a config entry is a `FieldConfig` rather than a bare Zod schema. */
function isFieldConfig(value) {
	return typeof value === "object" && value !== null && "type" in value && value.type instanceof z.ZodType;
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
		if (isFieldConfig(value)) {
			schema = value.type;
			customEnvName = value.envName;
			customCmdName = value.cmdName;
			customCmdNameShort = value.cmdNameShort;
			customCmdDescription = value.cmdDescription;
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
			enumValues
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
	return z.object(shape);
}
//#endregion
//#region src/loader.ts
function loadEnvFile(envPath) {
	const path = envPath ?? resolve(process.cwd(), ".env");
	try {
		return parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
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
function getCoercionSchema(type, enumValues) {
	switch (type) {
		case "number": return z.coerce.number();
		case "boolean": return z.coerce.boolean();
		case "enum": return z.enum(enumValues);
		default: return z.string();
	}
}
function parseWithZod(value, type, enumValues) {
	const result = getCoercionSchema(type, enumValues).safeParse(value);
	if (result.success) return result.data;
}
//#endregion
//#region src/short-param.ts
var ShortParamGenerator = class {
	assigned = /* @__PURE__ */ new Map();
	usedShortParams = /* @__PURE__ */ new Set();
	alphabetIndex = 0;
	alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
	getWords(name) {
		return name.split(/-/).filter((w) => w.length > 0);
	}
	getNextAlphabetChar() {
		const char = this.alphabet[this.alphabetIndex];
		this.alphabetIndex++;
		return char;
	}
	generate(name) {
		const words = this.getWords(name);
		if (words.length === 0) return this.getNextAlphabetChar();
		for (let numWords = 1; numWords <= words.length; numWords++) {
			const base = words.slice(0, numWords).map((w) => w[0].toLowerCase()).join("");
			if (!this.usedShortParams.has(base)) return base;
		}
		const lastWord = words[words.length - 1];
		for (let extraLen = 2; extraLen <= lastWord.length; extraLen++) {
			const base = words.slice(0, -1).map((w) => w[0].toLowerCase()).join("") + lastWord.slice(0, extraLen).toLowerCase();
			if (!this.usedShortParams.has(base)) return base;
		}
		return this.getNextAlphabetChar();
	}
	getShortParam(name, customParam) {
		if (customParam && (customParam.startsWith("--") || customParam.startsWith("-"))) {
			const shortParam = customParam.startsWith("--") ? customParam.slice(2) : customParam.slice(1);
			this.usedShortParams.add(shortParam);
			this.assigned.set(name, shortParam);
			return shortParam;
		}
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
function parseCliArguments(info) {
	const argv = hideBin(process.argv);
	const config = {};
	globalGenerator.reset();
	if (argv.length === 0) {
		for (const field of info.fields) if (field.defaultValue !== void 0) config[field.name] = field.defaultValue;
		return config;
	}
	let y = yargs(argv);
	for (const field of info.fields) {
		const cliName = field.cmdName;
		const shortParam = field.cmdNameShort ? globalGenerator.getShortParam(field.name, field.cmdNameShort) : globalGenerator.getShortParam(field.name, cliName);
		if (field.type === "number") y = y.number(cliName);
		else y = y.string(cliName);
		const options = {};
		if (field.enumValues) options.choices = field.enumValues;
		if (field.cmdDescription) options.describe = field.cmdDescription;
		y = y.option(cliName, {
			alias: shortParam,
			...options
		});
	}
	const parsed = y.argv;
	for (const field of info.fields) {
		const value = parsed[field.cmdName];
		if (value !== void 0) if (field.type === "boolean") config[field.name] = coerceBooleanField(value);
		else config[field.name] = value;
		else if (field.defaultValue !== void 0) config[field.name] = field.defaultValue;
	}
	return config;
}
/**
* Determines the boolean value for a CLI flag by inspecting the raw argv.
*
* Yargs' `.boolean()` coercion is inconsistent:
*   --flag        → yargs omits it from output (undefined)  → treat as true
*   --flag 1      → yargs returns "1" (string)             → treat as true
*   --flag 0      → yargs returns "0" (string)             → treat as false
*   --flag=true   → yargs returns "true" (string)         → treat as true
*   --flag=false  → yargs returns "false" (string)         → treat as false
*   --flag=1      → yargs returns "1" (string)             → treat as true
*   --flag=0      → yargs returns "0" (string)             → treat as false
*   --flag=yes    → yargs returns "yes" (string)           → treat as true
*   --flag=no     → yargs returns "no" (string)            → treat as false
*   --no-flag     → yargs returns false (boolean)          → treat as false
*/
function coerceBooleanField(yargsValue) {
	if (typeof yargsValue === "boolean") return false;
	if (yargsValue === "") return true;
	const lower = yargsValue.toLowerCase();
	return lower === "true" || lower === "1" || lower === "yes";
}
//#endregion
//#region src/index.ts
function configure(config, options) {
	const info = extractSchemaInfo(config);
	const schema = normalizeToZodObject(config);
	const defaults = extractDefaults(schema.shape);
	const envConfig = parseEnvVariables(info, options?.envPath ? loadEnvFile(options.envPath) : loadEnvFile());
	const cliConfig = parseCliArguments(info);
	const merged = {
		...defaults,
		...envConfig,
		...cliConfig
	};
	const result = schema.safeParse(merged);
	if (!result.success) {
		const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
		throw new Error(`Configuration validation failed: ${errors}`);
	}
	return result.data;
}
//#endregion
export { configure, customConfigElement, toCliName, toEnvName };
