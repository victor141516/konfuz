import { describe, it, expect, beforeEach } from 'vitest';
import { ShortParamGenerator, globalGenerator } from '../src/short-param';

describe('short-param', () => {
  beforeEach(() => {
    globalGenerator.reset();
  });

  describe('ShortParamGenerator', () => {
    it('generates short param from first letter of first word', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
      expect(generator.getShortParam('host')).toBe('h');
    });

    it('uses first letters of two words when first collides', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
      expect(generator.getShortParam('host')).toBe('h');
      expect(generator.getShortParam('package')).toBe('pa');
    });

    it('handles kebab-case names', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('database-host')).toBe('d');
    });

    it('falls back to alphabet when all word-based params taken', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('a')).toBe('a');
      expect(generator.getShortParam('b')).toBe('b');
      expect(generator.getShortParam('c')).toBe('c');
    });

    it('uses custom param if provided and starts with dash', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port', '--custom')).toBe('custom');
    });

    it('returns cached short param for same name', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
      expect(generator.getShortParam('port')).toBe('p');
    });

    it('handles complex collision scenarios', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
      expect(generator.getShortParam('package')).toBe('pa');
      expect(generator.getShortParam('path')).toBe('pat');
      expect(generator.getShortParam('another')).toBe('a');
    });
  });

  describe('globalGenerator.getShortParam (global generator)', () => {
    it('uses global generator', () => {
      globalGenerator.reset();
      expect(globalGenerator.getShortParam('port')).toBe('p');
      expect(globalGenerator.getShortParam('host')).toBe('h');
    });

    it('resets between tests via beforeEach', () => {
      expect(globalGenerator.getShortParam('database')).toBe('d');
    });
  });

  describe('globalGenerator.reset', () => {
    it('clears all assigned params', () => {
      globalGenerator.getShortParam('port');
      globalGenerator.getShortParam('host');
      globalGenerator.reset();
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
    });
  });
});
