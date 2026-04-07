import { z } from "zod";
import { parse } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
//#region src/schema-transformer.ts
function customConfigElement(type, options) {
	return {
		type,
		envName: options?.envName,
		cmdName: options?.cmdName,
		cmdNameShort: options?.cmdNameShort,
		cmdDescription: options?.cmdDescription
	};
}
function toEnvName(key) {
	return key.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toUpperCase();
}
function toCliName(key) {
	return key.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}
function getFieldType(schema) {
	if (schema instanceof z.ZodString) return { type: "string" };
	if (schema instanceof z.ZodNumber) return { type: "number" };
	if (schema instanceof z.ZodBoolean) return { type: "boolean" };
	if (schema instanceof z.ZodEnum) return {
		type: "enum",
		enumValues: schema.options
	};
	if (schema instanceof z.ZodDefault) return getFieldType(schema._def.innerType);
	if (schema instanceof z.ZodOptional) return getFieldType(schema._def.innerType);
	return { type: "string" };
}
function hasDefault(schema) {
	if (schema instanceof z.ZodDefault) return true;
	return false;
}
function getDefaultValue(schema) {
	if (schema instanceof z.ZodDefault) {
		const defaultValue = schema._def.defaultValue;
		if (typeof defaultValue === "function") return defaultValue();
		return defaultValue;
	}
}
function isOptional(schema) {
	if (schema instanceof z.ZodOptional) return true;
	if (schema instanceof z.ZodDefault) return true;
	if (schema instanceof z.ZodReadonly) return isOptional(schema._def.innerType);
	return false;
}
function isCustomConfigElement(value) {
	return typeof value === "object" && value !== null && "type" in value && value.type instanceof z.ZodType;
}
function extractSchemaInfo(config) {
	const fields = [];
	const shape = {};
	let entries;
	if (config instanceof z.ZodObject) entries = Object.entries(config.shape);
	else entries = Object.entries(config);
	for (const [key, value] of entries) {
		let schema;
		let customEnvName;
		let customCmdName;
		let customCmdNameShort;
		let customCmdDescription;
		if (isCustomConfigElement(value)) {
			schema = value.type;
			customEnvName = value.envName;
			customCmdName = value.cmdName;
			customCmdNameShort = value.cmdNameShort;
			customCmdDescription = value.cmdDescription;
		} else schema = value;
		shape[key] = schema;
		const { type, enumValues } = getFieldType(schema);
		fields.push({
			name: key,
			envName: customEnvName ?? toEnvName(key),
			cmdName: customCmdName ?? toCliName(key),
			cmdNameShort: customCmdNameShort,
			cmdDescription: customCmdDescription,
			type,
			isOptional: isOptional(schema),
			defaultValue: hasDefault(schema) ? getDefaultValue(schema) : void 0,
			enumValues
		});
	}
	return {
		fields,
		shape
	};
}
function extractDefaults(shape) {
	const defaults = {};
	for (const [key, value] of Object.entries(shape)) if (hasDefault(value)) defaults[key] = getDefaultValue(value);
	return defaults;
}
function normalizeToZodObject(config) {
	const shape = {};
	for (const [key, value] of Object.entries(config)) if (isCustomConfigElement(value)) shape[key] = value.type;
	else shape[key] = value;
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
		if (field.type === "boolean") y = y.boolean(cliName);
		else if (field.type === "number") y = y.number(cliName);
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
		if (value !== void 0) config[field.name] = value;
		else if (field.defaultValue !== void 0) config[field.name] = field.defaultValue;
	}
	return config;
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
