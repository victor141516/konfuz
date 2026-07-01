export type ConfigSource =
  | 'cli'
  | 'env'
  | 'configFile'
  | 'envFile'
  | 'defaultConfigFile'
  | 'default';

export interface SourceValue {
  name: string;
  value: string;
}

export interface ConfigSourceEntry {
  finalSource: ConfigSource;
  finalValue?: string;
  defaultConfigFile?: SourceValue;
  envFile?: SourceValue;
  configFile?: SourceValue;
  env?: SourceValue;
  cli?: SourceValue;
  secret?: boolean;
}

export interface InternalSources {
  __$sources__?: Record<string, ConfigSourceEntry>;
}

export type SourceValueKey =
  | 'defaultConfigFile'
  | 'envFile'
  | 'configFile'
  | 'env'
  | 'cli';

export interface SourceLedgerColumn {
  source: Exclude<ConfigSource, 'default'>;
  key: SourceValueKey;
  label: string;
  width: number;
}

export const SOURCE_PRIORITY_LABEL =
  'CLI > Environment > JSON file > .env file > Default JSON > default';

export const SOURCE_LEDGER_COLUMNS: SourceLedgerColumn[] = [
  {
    source: 'defaultConfigFile',
    key: 'defaultConfigFile',
    label: 'Default JSON',
    width: 30,
  },
  { source: 'envFile', key: 'envFile', label: '.env file', width: 30 },
  { source: 'configFile', key: 'configFile', label: 'JSON file', width: 30 },
  { source: 'env', key: 'env', label: 'Environment', width: 30 },
  { source: 'cli', key: 'cli', label: 'CLI', width: 30 },
];

export function getLedgerSourceValue(
  entry: ConfigSourceEntry,
  key: SourceValueKey
): SourceValue | undefined {
  return entry[key];
}
