export type PotInput = {
  playerId: string;
  committed: number;
  folded: boolean;
};

export type SidePot = {
  amount: number;
  eligiblePlayerIds: string[];
};

export function buildPots(inputs: PotInput[]): SidePot[] {
  const levels = [...new Set(inputs.map((input) => input.committed).filter((value) => value > 0))].sort(
    (a, b) => a - b,
  );
  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of levels) {
    const contributors = inputs.filter((input) => input.committed >= level);
    const amount = (level - previousLevel) * contributors.length;
    const eligiblePlayerIds = contributors
      .filter((input) => !input.folded)
      .map((input) => input.playerId);

    if (amount > 0 && eligiblePlayerIds.length > 0) {
      pots.push({ amount, eligiblePlayerIds });
    }

    previousLevel = level;
  }

  return pots;
}
