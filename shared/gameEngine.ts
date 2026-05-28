import { createDeck } from "./cards";
import { compareHands, evaluateBestHand } from "./handEvaluator";
import { buildPots } from "./pots";
import type { GamePlayer, GameState, HandResult, LegalActions, PlayerAction, Street } from "./pokerTypes";

export function startHand(state: GameState, seed?: number): GameState {
  const players = state.players.map((player) => {
    const chips = player.chips + player.pendingTopUp;
    return {
      ...player,
      chips,
      pendingTopUp: 0,
      status: chips > 0 ? "active" : "sitting-out",
      holeCards: [],
      committedThisStreet: 0,
      committedTotal: 0,
      hasActed: false,
    } satisfies GamePlayer;
  });
  const nextButtonIndex = nextSeatIndex(players, state.buttonIndex, true);
  const smallBlindIndex = players.length === 2 ? nextButtonIndex : nextSeatIndex(players, nextButtonIndex, true);
  const bigBlindIndex = nextSeatIndex(players, smallBlindIndex, true);
  const deck = createDeck(seed);
  let nextState: GameState = {
    ...state,
    players,
    buttonIndex: nextButtonIndex,
    deck,
    communityCards: [],
    street: state.config.straddleEnabled ? "straddleDecision" : "preflop",
    currentBet: 0,
    minRaise: state.config.bigBlind,
    pot: 0,
    actorId: undefined,
    smallBlindPlayerId: players[smallBlindIndex].id,
    bigBlindPlayerId: players[bigBlindIndex].id,
    straddlePlayerId: undefined,
    handResult: undefined,
  };

  nextState = commitChips(nextState, players[smallBlindIndex].id, state.config.smallBlind);
  nextState = commitChips(nextState, players[bigBlindIndex].id, state.config.bigBlind);
  nextState.currentBet = state.config.bigBlind;

  if (state.config.straddleEnabled) {
    nextState.actorId = players[nextSeatIndex(players, bigBlindIndex, true)].id;
    return nextState;
  }

  nextState = dealHoleCards(nextState);
  nextState.actorId = players[nextSeatIndex(players, bigBlindIndex, true)].id;
  return nextState;
}

export function chooseStraddle(state: GameState, playerId: string, enabled: boolean): GameState {
  assertStreet(state, "straddleDecision");
  assertActor(state, playerId);

  let nextState = cloneState(state);
  if (enabled) {
    nextState = commitChips(nextState, playerId, state.config.bigBlind * 2);
    nextState.currentBet = nextState.players.find((player) => player.id === playerId)?.committedThisStreet ?? 0;
    nextState.straddlePlayerId = playerId;
  }

  nextState = dealHoleCards(nextState);
  nextState.street = "preflop";
  nextState.actorId = nextActivePlayerIdAfter(nextState, playerId);
  return nextState;
}

export function getLegalActions(state: GameState, playerId: string): LegalActions {
  const player = getPlayer(state, playerId);
  const toCall = Math.max(0, state.currentBet - player.committedThisStreet);
  const maxAmount = player.committedThisStreet + player.chips;

  if (state.actorId !== playerId || player.status !== "active") {
    return emptyLegalActions();
  }

  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0 && player.chips > 0,
    callAmount: Math.min(toCall, player.chips),
    canBet: state.currentBet === 0 && player.chips > 0,
    canRaise: state.currentBet > 0 && maxAmount > state.currentBet,
    minAmount: state.currentBet === 0 ? state.config.bigBlind : state.currentBet + state.minRaise,
    maxAmount,
    canAllIn: player.chips > 0,
  };
}

export function applyAction(state: GameState, action: PlayerAction): GameState {
  assertActor(state, action.playerId);
  let nextState = cloneState(state);
  const player = getPlayer(nextState, action.playerId);

  if (player.status !== "active") {
    throw new Error("Player cannot act");
  }

  if (action.type === "fold") {
    player.status = "folded";
    player.hasActed = true;
  } else if (action.type === "check") {
    if (state.currentBet !== player.committedThisStreet) {
      throw new Error("Cannot check while facing a bet");
    }
    player.hasActed = true;
  } else if (action.type === "call") {
    const toCall = Math.max(0, state.currentBet - player.committedThisStreet);
    nextState = commitChips(nextState, action.playerId, toCall);
    getPlayer(nextState, action.playerId).hasActed = true;
  } else if (action.type === "bet") {
    if (state.currentBet !== 0 || action.amount < state.config.bigBlind) {
      throw new Error("Invalid bet");
    }
    nextState = commitToStreetTotal(nextState, action.playerId, action.amount);
    nextState.currentBet = action.amount;
    nextState.minRaise = action.amount;
    markOnlyPlayerActed(nextState, action.playerId);
  } else if (action.type === "raise") {
    if (action.amount < state.currentBet + state.minRaise) {
      throw new Error("Invalid raise");
    }
    const raiseSize = action.amount - state.currentBet;
    nextState = commitToStreetTotal(nextState, action.playerId, action.amount);
    nextState.currentBet = action.amount;
    nextState.minRaise = raiseSize;
    markOnlyPlayerActed(nextState, action.playerId);
  } else {
    nextState = commitChips(nextState, action.playerId, player.chips);
    const updated = getPlayer(nextState, action.playerId);
    if (updated.committedThisStreet > state.currentBet) {
      nextState.minRaise = updated.committedThisStreet - state.currentBet;
      nextState.currentBet = updated.committedThisStreet;
      markOnlyPlayerActed(nextState, action.playerId);
    } else {
      updated.hasActed = true;
    }
  }

  nextState.pot = calculatePot(nextState.players);
  return advanceIfNeeded(nextState);
}

export function advanceIfNeeded(state: GameState): GameState {
  const remaining = state.players.filter((player) => player.status !== "folded" && player.status !== "sitting-out");
  if (remaining.length === 1) {
    return completeByFold(state, remaining[0].id);
  }

  if (!isBettingRoundComplete(state)) {
    return {
      ...state,
      actorId: nextActivePlayerIdAfter(state, state.actorId),
    };
  }

  return advanceStreet(state);
}

export function settleHand(state: GameState): HandResult {
  const payouts: Record<string, number> = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  const pots = buildPots(
    state.players.map((player) => ({
      playerId: player.id,
      committed: player.committedTotal,
      folded: player.status === "folded",
    })),
  );
  const winners = new Set<string>();

  for (const pot of pots) {
    const eligible = pot.eligiblePlayerIds.map((playerId) => getPlayer(state, playerId));
    const ranked = eligible.map((player) => ({
      player,
      hand: evaluateBestHand([...player.holeCards, ...state.communityCards]),
    }));
    const best = ranked.sort((a, b) => compareHands(b.hand, a.hand))[0].hand;
    const potWinners = ranked.filter((entry) => compareHands(entry.hand, best) === 0).map((entry) => entry.player.id);
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount % potWinners.length;

    for (const playerId of potWinners) {
      payouts[playerId] += share + (remainder > 0 ? 1 : 0);
      winners.add(playerId);
      remainder -= 1;
    }
  }

  return {
    winners: [...winners],
    payouts,
    reason: "showdown",
  };
}

function advanceStreet(state: GameState): GameState {
  const street = nextStreet(state.street);
  let nextState = resetStreet(cloneState(state), street);

  if (street === "flop") {
    nextState = dealCommunityCards(nextState, 3);
  } else if (street === "turn" || street === "river") {
    nextState = dealCommunityCards(nextState, 1);
  } else if (street === "showdown") {
    const handResult = settleHand(nextState);
    const players = nextState.players.map((player) => ({
      ...player,
      chips: player.chips + (handResult.payouts[player.id] ?? 0),
    }));
    return {
      ...nextState,
      players,
      street: "handComplete",
      actorId: undefined,
      handResult,
    };
  }

  nextState.actorId = firstPostflopActor(nextState);
  return nextState;
}

function nextStreet(street: Street): Street {
  if (street === "preflop") return "flop";
  if (street === "flop") return "turn";
  if (street === "turn") return "river";
  if (street === "river") return "showdown";
  return street;
}

function isBettingRoundComplete(state: GameState): boolean {
  const actors = state.players.filter((player) => player.status === "active");
  return actors.every((player) => player.hasActed && player.committedThisStreet === state.currentBet);
}

function resetStreet(state: GameState, street: Street): GameState {
  return {
    ...state,
    street,
    currentBet: 0,
    minRaise: state.config.bigBlind,
    actorId: undefined,
    players: state.players.map((player) => ({
      ...player,
      committedThisStreet: 0,
      hasActed: player.status !== "active",
    })),
  };
}

function dealHoleCards(state: GameState): GameState {
  const deck = [...state.deck];
  const players = state.players.map((player) => {
    if (player.status === "sitting-out") {
      return player;
    }
    return {
      ...player,
      holeCards: [deck.pop()!, deck.pop()!],
    };
  });
  return { ...state, deck, players };
}

function dealCommunityCards(state: GameState, count: number): GameState {
  const deck = [...state.deck];
  const communityCards = [...state.communityCards];

  for (let index = 0; index < count; index += 1) {
    communityCards.push(deck.pop()!);
  }

  return { ...state, deck, communityCards };
}

function commitChips(state: GameState, playerId: string, amount: number): GameState {
  const players = state.players.map((player) => {
    if (player.id !== playerId) {
      return player;
    }
    const committed = Math.min(amount, player.chips);
    return {
      ...player,
      chips: player.chips - committed,
      committedThisStreet: player.committedThisStreet + committed,
      committedTotal: player.committedTotal + committed,
      status: player.chips - committed === 0 ? "all-in" : player.status,
    };
  });

  return { ...state, players, pot: calculatePot(players) };
}

function commitToStreetTotal(state: GameState, playerId: string, streetTotal: number): GameState {
  const player = getPlayer(state, playerId);
  const extra = streetTotal - player.committedThisStreet;
  if (extra <= 0 || extra > player.chips) {
    throw new Error("Invalid chip amount");
  }
  return commitChips(state, playerId, extra);
}

function completeByFold(state: GameState, winnerId: string): GameState {
  const pot = calculatePot(state.players);
  const players = state.players.map((player) => ({
    ...player,
    chips: player.id === winnerId ? player.chips + pot : player.chips,
  }));

  return {
    ...state,
    players,
    street: "handComplete",
    actorId: undefined,
    pot,
    handResult: {
      winners: [winnerId],
      payouts: { [winnerId]: pot },
      reason: "fold",
    },
  };
}

function markOnlyPlayerActed(state: GameState, playerId: string): void {
  for (const player of state.players) {
    player.hasActed = player.id === playerId || player.status !== "active";
  }
}

function firstPostflopActor(state: GameState): string | undefined {
  return nextActivePlayerIdAfter(state, state.players[state.buttonIndex].id);
}

function nextActivePlayerIdAfter(state: GameState, playerId: string | undefined): string | undefined {
  const startIndex = playerId ? state.players.findIndex((player) => player.id === playerId) : state.buttonIndex;
  const index = nextSeatIndex(state.players, startIndex, false);
  return index === -1 ? undefined : state.players[index].id;
}

function nextSeatIndex(players: GamePlayer[], fromIndex: number, includeAllActive: boolean): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (fromIndex + offset + players.length) % players.length;
    const player = players[index];
    const eligible = includeAllActive
      ? player.status !== "sitting-out" && player.chips + player.pendingTopUp > 0
      : player.status === "active";
    if (eligible) {
      return index;
    }
  }

  return -1;
}

function calculatePot(players: GamePlayer[]): number {
  return players.reduce((sum, player) => sum + player.committedTotal, 0);
}

function getPlayer(state: GameState, playerId: string): GamePlayer {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

function assertActor(state: GameState, playerId: string): void {
  if (state.actorId !== playerId) {
    throw new Error("Not player's turn");
  }
}

function assertStreet(state: GameState, street: Street): void {
  if (state.street !== street) {
    throw new Error(`Expected street ${street}`);
  }
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    deck: [...state.deck],
    communityCards: [...state.communityCards],
    players: state.players.map((player) => ({
      ...player,
      holeCards: [...player.holeCards],
    })),
    handResult: state.handResult
      ? {
          ...state.handResult,
          winners: [...state.handResult.winners],
          payouts: { ...state.handResult.payouts },
        }
      : undefined,
  };
}

function emptyLegalActions(): LegalActions {
  return {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    canRaise: false,
    minAmount: 0,
    maxAmount: 0,
    canAllIn: false,
  };
}
