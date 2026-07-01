import table from 'table';
import type { ConfigSourceEntry, SourceValue } from './index';

export type ConfigSource =
  | 'cli'
  | 'env'
  | 'configFile'
  | 'envFile'
  | 'defaultConfigFile'
  | 'default';

export interface InternalSources {
  __$sources__?: Record<string, ConfigSourceEntry>;
}

const STYLES = {
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
};

const MASK = '***';

function formatSourceValue(
  sv: SourceValue | undefined,
  isSecret?: boolean
): string {
  if (!sv) return '-';
  const value = isSecret ? MASK : sv.value;
  return `${sv.name}=${value}`;
}

function getCellStyle(
  sv: SourceValue | undefined,
  isActive: boolean,
  isSecret?: boolean
): string {
  if (!sv) return STYLES.gray('-');
  const text = formatSourceValue(sv, isSecret);
  return isActive ? STYLES.bold(text) : STYLES.dim(text);
}

function getFinalValueStyle(
  value: string | undefined,
  source: ConfigSource,
  isSecret?: boolean
): string {
  if (value === undefined) return STYLES.gray('-');
  const displayValue = isSecret ? MASK : value;
  switch (source) {
    case 'cli':
      return STYLES.green(displayValue);
    case 'env':
      return STYLES.yellow(displayValue);
    case 'configFile':
      return STYLES.magenta(displayValue);
    case 'envFile':
      return STYLES.blue(displayValue);
    case 'defaultConfigFile':
      return STYLES.dim(displayValue);
    default:
      return STYLES.dim(displayValue);
  }
}

export function printConfiguredSources(configResult: unknown): void {
  if (typeof configResult !== 'object' || configResult === null) {
    throw new Error('This is not a Konfuz configuration');
  }

  if (!('__$sources__' in configResult)) {
    throw new Error('This is not a Konfuz configuration');
  }

  if (!configResult.__$sources__) {
    throw new Error('This is not a Konfuz configuration');
  }
  const sources = configResult.__$sources__ as NonNullable<
    InternalSources['__$sources__']
  >;

  const fieldNames = Object.keys(configResult).filter(
    (k) => !k.startsWith('__')
  );

  const tableData: string[][] = [
    [
      STYLES.bold('Field'),
      STYLES.bold('Default JSON'),
      STYLES.bold('.env file'),
      STYLES.bold('JSON file'),
      STYLES.bold('Environment'),
      STYLES.bold('CLI'),
      STYLES.bold('Final value'),
    ],
  ];

  for (const name of fieldNames) {
    const entry = sources[name] as ConfigSourceEntry;
    if (!entry) {
      tableData.push([name, '-', '-', '-', '-', '-', '-']);
      continue;
    }

    tableData.push([
      name,
      getCellStyle(
        entry.defaultConfigFile,
        entry.finalSource === 'defaultConfigFile',
        entry.secret
      ),
      getCellStyle(
        entry.envFile,
        entry.finalSource === 'envFile',
        entry.secret
      ),
      getCellStyle(
        entry.configFile,
        entry.finalSource === 'configFile',
        entry.secret
      ),
      getCellStyle(entry.env, entry.finalSource === 'env', entry.secret),
      getCellStyle(entry.cli, entry.finalSource === 'cli', entry.secret),
      getFinalValueStyle(entry.finalValue, entry.finalSource, entry.secret),
    ]);
  }

  console.log(
    '[konfuz] Configuration sources (priority: CLI > Environment > JSON file > .env file > Default JSON > default)\n'
  );
  console.log(
    table.table(tableData, {
      columns: {
        0: { width: 20, truncate: 20 },
        1: { width: 30, truncate: 30 },
        2: { width: 30, truncate: 30 },
        3: { width: 30, truncate: 30 },
        4: { width: 30, truncate: 30 },
        5: { width: 30, truncate: 30 },
        6: { width: 20, truncate: 20 },
      },
    })
  );
}
