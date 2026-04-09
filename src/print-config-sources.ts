import table from 'table';
import type { ConfigSourceEntry, SourceValue } from './index';

export type ConfigSource = 'cli' | 'env' | 'envFile' | 'default';

interface ConfigResult {
  __$sources__?: Record<string, ConfigSourceEntry>;
  [key: string]: unknown;
}

const STYLES = {
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
};

function formatSourceValue(sv: SourceValue | undefined): string {
  if (!sv) return '-';
  return `${sv.name}=${sv.value}`;
}

function getCellStyle(sv: SourceValue | undefined, isActive: boolean): string {
  if (!sv) return STYLES.gray('-');
  const text = formatSourceValue(sv);
  return isActive ? STYLES.bold(text) : STYLES.dim(text);
}

function getFinalValueStyle(
  value: string | undefined,
  source: ConfigSource
): string {
  if (value === undefined) return STYLES.gray('-');
  switch (source) {
    case 'cli':
      return STYLES.green(value);
    case 'env':
      return STYLES.yellow(value);
    case 'envFile':
      return STYLES.blue(value);
    default:
      return STYLES.dim(value);
  }
}

export function printConfiguredSources(configResult: ConfigResult): void {
  const sources = configResult.__$sources__;
  if (!sources) throw new Error('This is not a Konfuz configuration');

  const fieldNames = Object.keys(configResult).filter(
    (k) => !k.startsWith('__')
  );

  const tableData: string[][] = [
    [
      STYLES.bold('Field'),
      STYLES.bold('.env file'),
      STYLES.bold('Environment'),
      STYLES.bold('CLI'),
      STYLES.bold('Final value'),
    ],
  ];

  for (const name of fieldNames) {
    const entry: ConfigSourceEntry = sources[name];
    if (!entry) {
      tableData.push([name, '-', '-', '-', '-']);
      continue;
    }

    tableData.push([
      name,
      getCellStyle(entry.envFile, entry.finalSource === 'envFile'),
      getCellStyle(entry.env, entry.finalSource === 'env'),
      getCellStyle(entry.cli, entry.finalSource === 'cli'),
      getFinalValueStyle(entry.finalValue, entry.finalSource),
    ]);
  }

  console.log(
    '[konfuz] Configuration sources (priority: CLI > Environment > .env file > default)\n'
  );
  console.log(
    table.table(tableData, {
      columns: {
        0: { width: 20, truncate: 20 },
        1: { width: 30, truncate: 30 },
        2: { width: 30, truncate: 30 },
        3: { width: 30, truncate: 30 },
        4: { width: 20, truncate: 20 },
      },
    })
  );
}
