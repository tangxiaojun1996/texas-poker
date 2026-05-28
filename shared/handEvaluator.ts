import type { Card } from "./cards";

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-kind"
  | "straight-flush"
  | "royal-flush";

export type EvaluatedHand = {
  category: number;
  name: HandCategory;
  ranks: number[];
  cards: Card[];
};

const categoryValue: Record<HandCategory, number> = {
  "high-card": 1,
  pair: 2,
  "two-pair": 3,
  "three-kind": 4,
  straight: 5,
  flush: 6,
  "full-house": 7,
  "four-kind": 8,
  "straight-flush": 9,
  "royal-flush": 10,
};

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error("At least five cards are required to evaluate a hand");
  }

  const combinations = getFiveCardCombinations(cards);
  return combinations
    .map(evaluateFiveCards)
    .sort((first, second) => compareHands(second, first))[0];
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) {
    return a.category - b.category;
  }

  const length = Math.max(a.ranks.length, b.ranks.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.ranks[index] ?? 0) - (b.ranks[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function getFiveCardCombinations(cards: Card[]): Card[][] {
  const combinations: Card[][] = [];

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }

  return combinations;
}

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const sortedCards = [...cards].sort((a, b) => b.rank - a.rank);
  const ranksDescending = sortedCards.map((card) => card.rank);
  const counts = new Map<number, number>();

  for (const card of sortedCards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const flush = sortedCards.every((card) => card.suit === sortedCards[0].suit);
  const straightHigh = getStraightHigh(ranksDescending);

  if (flush && straightHigh === 14) {
    return makeHand("royal-flush", [14], sortedCards);
  }

  if (flush && straightHigh) {
    return makeHand("straight-flush", [straightHigh], sortedCards);
  }

  if (groups[0].count === 4) {
    const kicker = groups.find((group) => group.count === 1)!.rank;
    return makeHand("four-kind", [groups[0].rank, kicker], sortedCards);
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return makeHand("full-house", [groups[0].rank, groups[1].rank], sortedCards);
  }

  if (flush) {
    return makeHand("flush", ranksDescending, sortedCards);
  }

  if (straightHigh) {
    return makeHand("straight", [straightHigh], sortedCards);
  }

  if (groups[0].count === 3) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank);
    return makeHand("three-kind", [groups[0].rank, ...kickers], sortedCards);
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairRanks = groups
      .filter((group) => group.count === 2)
      .map((group) => group.rank)
      .sort((a, b) => b - a);
    const kicker = groups.find((group) => group.count === 1)!.rank;
    return makeHand("two-pair", [...pairRanks, kicker], sortedCards);
  }

  if (groups[0].count === 2) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank);
    return makeHand("pair", [groups[0].rank, ...kickers], sortedCards);
  }

  return makeHand("high-card", ranksDescending, sortedCards);
}

function getStraightHigh(ranks: number[]): number | undefined {
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  const wheelRanks = new Set(uniqueRanks);

  if ([14, 5, 4, 3, 2].every((rank) => wheelRanks.has(rank))) {
    return 5;
  }

  for (let index = 0; index <= uniqueRanks.length - 5; index += 1) {
    const window = uniqueRanks.slice(index, index + 5);
    if (window[0] - window[4] === 4) {
      return window[0];
    }
  }

  return undefined;
}

function makeHand(name: HandCategory, ranks: number[], cards: Card[]): EvaluatedHand {
  return {
    category: categoryValue[name],
    name,
    ranks,
    cards,
  };
}
