import table from 'table';
import {
  getLedgerSourceValue,
  SOURCE_LEDGER_COLUMNS,
  SOURCE_PRIORITY_LABEL,
  type ConfigSource,
  type ConfigSourceEntry,
  type InternalSources,
  type SourceValue,
} from './source-resolution/ledger';

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
      ...SOURCE_LEDGER_COLUMNS.map((column) => STYLES.bold(column.label)),
      STYLES.bold('Final value'),
    ],
  ];

  for (const name of fieldNames) {
    const entry = sources[name] as ConfigSourceEntry;
    if (!entry) {
      tableData.push([name, ...SOURCE_LEDGER_COLUMNS.map(() => '-'), '-']);
      continue;
    }

    tableData.push([
      name,
      ...SOURCE_LEDGER_COLUMNS.map((column) =>
        getCellStyle(
          getLedgerSourceValue(entry, column.key),
          entry.finalSource === column.source,
          entry.secret
        )
      ),
      getFinalValueStyle(entry.finalValue, entry.finalSource, entry.secret),
    ]);
  }

  console.log(
    `[konfuz] Configuration sources (priority: ${SOURCE_PRIORITY_LABEL})\n`
  );
  const columns = Object.fromEntries([
    [0, { width: 20 }],
    ...SOURCE_LEDGER_COLUMNS.map((column, index) => [
      index + 1,
      { width: column.width },
    ]),
    [SOURCE_LEDGER_COLUMNS.length + 1, { width: 20 }],
  ]);

  console.log(
    table.table(tableData, {
      columns,
    })
  );
}
