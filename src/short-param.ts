import * as changeCase from 'change-case';

const base = 'abcdefghijklmnopqrstuvwxyz'.split('');

function decode(id: number): string {
  let result = '';
  let rest = id;
  while (rest > 0) {
    const index = rest % base.length;
    result = base[index] + result;
    rest = Math.floor(rest / base.length);
  }
  return result || 'a';
}

export class ShortParamGenerator {
  private assigned: Map<string, string> = new Map();
  private usedShortParams: Set<string> = new Set();
  private alphabetIndex = 0;

  private getWords(name: string): string[] {
    return changeCase.noCase(name).split(' ');
  }

  private getNextAvailableAlphabet(): string {
    while (true) {
      const label = decode(this.alphabetIndex);
      if (!this.usedShortParams.has(label)) {
        return label;
      }
      this.alphabetIndex++;
    }
  }

  private generate(name: string): string {
    const words = this.getWords(name);

    for (let numWords = 1; numWords <= words.length; numWords++) {
      const base = words
        .slice(0, numWords)
        .map((w) => w[0].toLowerCase())
        .join('');
      if (!this.usedShortParams.has(base)) {
        return base;
      }
    }

    return this.getNextAvailableAlphabet();
  }

  public getShortParam(name: string): string {
    if (this.assigned.has(name)) {
      return this.assigned.get(name)!;
    }

    const shortParam = this.generate(name);
    this.usedShortParams.add(shortParam);
    this.assigned.set(name, shortParam);
    return shortParam;
  }

  public reset(): void {
    this.assigned.clear();
    this.usedShortParams.clear();
    this.alphabetIndex = 0;
  }
}

export const globalGenerator = new ShortParamGenerator();
