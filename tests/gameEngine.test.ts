import { describe, expect, it } from "vitest";
import type { GamePlayer, GameState } from "../shared/pokerTypes";
import { applyAction, chooseStraddle, startHand } from "../shared/gameEngine";

function player(id: string, chips = 1000): GamePlayer {
  return {
    id,
    nickname: id.toUpperCase(),
    chips,
    pendingTopUp: 0,
    totalInvested: chips,
    status: "active",
    holeCards: [],
    committedThisStreet: 0,
    committedTotal: 0,
    hasActed: false,
  };
}

function state(straddleEnabled = false): GameState {
  return {
    config: {
      smallBlind: 5,
      bigBlind: 10,
      straddleEnabled,
    },
    players: [player("a"), player("b"), player("c"), player("d")],
    buttonIndex: -1,
    deck: [],
    communityCards: [],
    street: "waiting",
    currentBet: 0,
    minRaise: 10,
    pot: 0,
  };
}

describe("game engine", () => {
  it("starts normal preflop action left of the big blind", () => {
    const hand = startHand(state(false), 1);

    expect(hand.street).toBe("preflop");
    expect(hand.buttonIndex).toBe(0);
    expect(hand.smallBlindPlayerId).toBe("b");
    expect(hand.bigBlindPlayerId).toBe("c");
    expect(hand.actorId).toBe("d");
    expect(hand.players.find((item) => item.id === "b")?.committedThisStreet).toBe(5);
    expect(hand.players.find((item) => item.id === "c")?.committedThisStreet).toBe(10);
  });

  it("offers UTG straddle and starts action left of the straddler", () => {
    const offered = startHand(state(true), 1);

    expect(offered.street).toBe("straddleDecision");
    expect(offered.actorId).toBe("d");

    const straddled = chooseStraddle(offered, "d", true);

    expect(straddled.street).toBe("preflop");
    expect(straddled.straddlePlayerId).toBe("d");
    expect(straddled.currentBet).toBe(20);
    expect(straddled.actorId).toBe("a");
  });

  it("lets the straddler act last preflop", () => {
    let hand = chooseStraddle(startHand(state(true), 1), "d", true);

    hand = applyAction(hand, { type: "call", playerId: "a" });
    hand = applyAction(hand, { type: "call", playerId: "b" });
    hand = applyAction(hand, { type: "call", playerId: "c" });

    expect(hand.street).toBe("preflop");
    expect(hand.actorId).toBe("d");
  });

  it("advances through flop, turn, and river", () => {
    let hand = startHand(state(false), 1);

    hand = applyAction(hand, { type: "call", playerId: "d" });
    hand = applyAction(hand, { type: "call", playerId: "a" });
    hand = applyAction(hand, { type: "call", playerId: "b" });
    hand = applyAction(hand, { type: "check", playerId: "c" });

    expect(hand.street).toBe("flop");
    expect(hand.communityCards).toHaveLength(3);

    for (const actorId of ["b", "c", "d", "a"]) {
      hand = applyAction(hand, { type: "check", playerId: actorId });
    }

    expect(hand.street).toBe("turn");
    expect(hand.communityCards).toHaveLength(4);

    for (const actorId of ["b", "c", "d", "a"]) {
      hand = applyAction(hand, { type: "check", playerId: actorId });
    }

    expect(hand.street).toBe("river");
    expect(hand.communityCards).toHaveLength(5);
  });

  it("ends immediately when only one player remains", () => {
    let hand = startHand(state(false), 1);

    hand = applyAction(hand, { type: "fold", playerId: "d" });
    hand = applyAction(hand, { type: "fold", playerId: "a" });
    hand = applyAction(hand, { type: "fold", playerId: "b" });

    expect(hand.street).toBe("handComplete");
    expect(hand.handResult?.winners).toEqual(["c"]);
  });

  it("applies pending top-up only when the next hand starts", () => {
    const initial = state(false);
    initial.players[0].chips = 100;
    initial.players[0].pendingTopUp = 200;
    initial.players[0].totalInvested = 300;

    const hand = startHand(initial, 1);

    expect(hand.players[0].pendingTopUp).toBe(0);
    expect(hand.players[0].chips).toBe(300);
  });
});
