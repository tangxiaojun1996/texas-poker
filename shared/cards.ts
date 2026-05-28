export type Suit = "s" | "h" | "d" | "c";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type Card = {
  rank: Rank;
  suit: Suit;
};

const rankToToken: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const tokenToRank: Record<string, Rank> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function createDeck(seed = Date.now()): Card[] {
  const deck: Card[] = [];
  const suits: Suit[] = ["s", "h", "d", "c"];

  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank += 1) {
      deck.push({ rank: rank as Rank, suit });
    }
  }

  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

export function parseCard(token: string): Card {
  const trimmed = token.trim();
  const suit = trimmed.at(-1)?.toLowerCase() as Suit | undefined;
  const rankToken = trimmed.slice(0, -1).toUpperCase();
  const rank = tokenToRank[rankToken];

  if (!rank || !suit || !["s", "h", "d", "c"].includes(suit)) {
    throw new Error(`Invalid card token: ${token}`);
  }

  return { rank, suit };
}

export function formatCard(card: Card): string {
  return `${rankToToken[card.rank]}${card.suit}`;
}
