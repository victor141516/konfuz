export class ShortParamGenerator {
  private assigned: Map<string, string> = new Map();
  private usedShortParams: Set<string> = new Set();
  private alphabetIndex = 0;
  private readonly alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

  private getWords(name: string): string[] {
    return name.split(/-/).filter((w) => w.length > 0);
  }

  private getNextAlphabetChar(): string {
    const char = this.alphabet[this.alphabetIndex];
    this.alphabetIndex++;
    return char;
  }

  private generate(name: string): string {
    const words = this.getWords(name);
    if (words.length === 0) {
      return this.getNextAlphabetChar();
    }

    for (let numWords = 1; numWords <= words.length; numWords++) {
      const base = words
        .slice(0, numWords)
        .map((w) => w[0].toLowerCase())
        .join('');
      if (!this.usedShortParams.has(base)) {
        return base;
      }
    }

    const lastWord = words[words.length - 1];
    for (let extraLen = 2; extraLen <= lastWord.length; extraLen++) {
      const prefixLetters = words
        .slice(0, -1)
        .map((w) => w[0].toLowerCase())
        .join('');
      const base = prefixLetters + lastWord.slice(0, extraLen).toLowerCase();
      if (!this.usedShortParams.has(base)) {
        return base;
      }
    }

    return this.getNextAlphabetChar();
  }

  public getShortParam(name: string, customParam?: string): string {
    if (
      customParam &&
      (customParam.startsWith('--') || customParam.startsWith('-'))
    ) {
      const shortParam = customParam.startsWith('--')
        ? customParam.slice(2)
        : customParam.slice(1);
      this.usedShortParams.add(shortParam);
      this.assigned.set(name, shortParam);
      return shortParam;
    }

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
