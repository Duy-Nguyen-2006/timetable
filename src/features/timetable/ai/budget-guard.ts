export function estimateTokens(value: string): number {
  if (!value) return 0;
  return Math.ceil(value.length / 2.5);
}

export class TokenBudgetGuard {
  private usedTokens = 0;

  constructor(private readonly capTokens: number) {}

  consumeText(...chunks: string[]): number {
    const delta = chunks.reduce((sum, chunk) => sum + estimateTokens(chunk), 0);
    this.usedTokens += delta;
    return this.usedTokens;
  }

  consumeUsage(totalTokens: number): number {
    const value = Number(totalTokens);
    if (!Number.isFinite(value) || value <= 0) {
      return this.usedTokens;
    }
    this.usedTokens += Math.ceil(value);
    return this.usedTokens;
  }

  ensureWithinLimit(): void {
    if (this.usedTokens > this.capTokens) {
      throw new Error(`Token budget exceeded (${this.usedTokens}/${this.capTokens}).`);
    }
  }

  getUsage(): { used: number; cap: number; remaining: number } {
    return {
      used: this.usedTokens,
      cap: this.capTokens,
      remaining: Math.max(0, this.capTokens - this.usedTokens),
    };
  }
}
