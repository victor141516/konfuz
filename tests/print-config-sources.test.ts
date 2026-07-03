import { afterEach, describe, expect, it, vi } from 'vitest';
import { printConfiguredSources } from '../src/index';

describe('printConfiguredSources', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects values that are not Konfuz configuration results', () => {
    expect(() => printConfiguredSources(null)).toThrow(
      'This is not a Konfuz configuration'
    );
    expect(() => printConfiguredSources({})).toThrow(
      'This is not a Konfuz configuration'
    );
    expect(() => printConfiguredSources({ __$sources__: undefined })).toThrow(
      'This is not a Konfuz configuration'
    );
  });

  it('prints config fields even when a source ledger entry is missing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    printConfiguredSources({
      orphanedField: 'value',
      __$sources__: {},
    });

    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('orphanedField');
    expect(output).toContain('Final value');
  });
});
