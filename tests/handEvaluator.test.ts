import { describe, expect, it } from "vitest";
import { parseCard } from "../shared/cards";
import { compareHands, evaluateBestHand } from "../shared/handEvaluator";

function cards(input: string) {
  return input.split(/\s+/).map(parseCard);
}

describe("hand evaluator", () => {
  it("ranks royal flush above straight flush", () => {
    const royal = evaluateBestHand(cards("As Ks Qs Js 10s 2d 3c"));
    const straightFlush = evaluateBestHand(cards("9h 8h 7h 6h 5h Ac Kd"));

    expect(royal.name).toBe("royal-flush");
    expect(straightFlush.name).toBe("straight-flush");
    expect(compareHands(royal, straightFlush)).toBeGreaterThan(0);
  });

  it("ranks four of a kind above full house", () => {
    const quads = evaluateBestHand(cards("Ah Ad Ac As 3d 4c 9s"));
    const fullHouse = evaluateBestHand(cards("Kh Kd Kc 9s 9h 2d 3c"));

    expect(quads.name).toBe("four-kind");
    expect(fullHouse.name).toBe("full-house");
    expect(compareHands(quads, fullHouse)).toBeGreaterThan(0);
  });

  it("detects flush and compares kickers", () => {
    const aceHighFlush = evaluateBestHand(cards("As Js 8s 5s 2s Kd Qc"));
    const kingHighFlush = evaluateBestHand(cards("Ks Js 8s 5s 2s Ad Qc"));

    expect(aceHighFlush.name).toBe("flush");
    expect(compareHands(aceHighFlush, kingHighFlush)).toBeGreaterThan(0);
  });

  it("detects wheel straight with ace low", () => {
    const wheel = evaluateBestHand(cards("As 2d 3h 4c 5s 9d Kc"));

    expect(wheel.name).toBe("straight");
    expect(wheel.ranks).toEqual([5]);
  });

  it("uses kickers for two pair", () => {
    const betterKicker = evaluateBestHand(cards("Ah Ad Kc Kd Qs 4h 2c"));
    const worseKicker = evaluateBestHand(cards("As Ac Kh Ks Jh 4d 2d"));

    expect(betterKicker.name).toBe("two-pair");
    expect(compareHands(betterKicker, worseKicker)).toBeGreaterThan(0);
  });

  it("compares high card hands", () => {
    const aceQueen = evaluateBestHand(cards("Ah Qd 9s 7c 5h 3d 2c"));
    const aceJack = evaluateBestHand(cards("As Jd 9h 7d 5c 3h 2s"));

    expect(aceQueen.name).toBe("high-card");
    expect(compareHands(aceQueen, aceJack)).toBeGreaterThan(0);
  });

  it("returns exact split for equal five-card value", () => {
    const first = evaluateBestHand(cards("Ah Ad Kc Qs 9d 4c 2h"));
    const second = evaluateBestHand(cards("Ac As Kd Qh 9s 3c 2d"));

    expect(first.name).toBe("pair");
    expect(compareHands(first, second)).toBe(0);
  });
});
