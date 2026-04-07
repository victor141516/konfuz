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
      expect(generator.getShortParam('port-alternative')).toBe('pa');
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

    it('returns cached short param for same name', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
      expect(generator.getShortParam('port')).toBe('p');
    });

    it('handles complex collision scenarios', () => {
      const generator = new ShortParamGenerator();
      expect(generator.getShortParam('port')).toBe('p');
      expect(generator.getShortParam('port-alternative')).toBe('pa');
      expect(generator.getShortParam('port-amigo-barcelona')).toBe('pab');
      expect(generator.getShortParam('port-aluminum-bagette-practice')).toBe(
        'pabp'
      );
      expect(generator.getShortParam('potato')).toBe('a');
      expect(generator.getShortParam('path')).toBe('b');
      expect(generator.getShortParam('another')).toBe('c');
    });

    it('alphabetically can collide infinitely', () => {
      const generator = new ShortParamGenerator();
      const shorts = new Set<string>();
      for (let i = 0; i < 200; i++) {
        shorts.add(generator.getShortParam('port' + i));
      }
      expect(shorts.size).toBe(200);
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
