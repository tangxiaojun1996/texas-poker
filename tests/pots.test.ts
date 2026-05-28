import { describe, expect, it } from "vitest";
import { buildPots } from "../shared/pots";

describe("buildPots", () => {
  it("creates main pot and side pots from uneven commitments", () => {
    expect(
      buildPots([
        { playerId: "a", committed: 50, folded: false },
        { playerId: "b", committed: 100, folded: false },
        { playerId: "c", committed: 200, folded: false },
      ]),
    ).toEqual([
      { amount: 150, eligiblePlayerIds: ["a", "b", "c"] },
      { amount: 100, eligiblePlayerIds: ["b", "c"] },
      { amount: 100, eligiblePlayerIds: ["c"] },
    ]);
  });

  it("keeps folded chips in pots but removes folded players from eligibility", () => {
    expect(
      buildPots([
        { playerId: "a", committed: 50, folded: true },
        { playerId: "b", committed: 100, folded: false },
        { playerId: "c", committed: 100, folded: false },
      ]),
    ).toEqual([
      { amount: 150, eligiblePlayerIds: ["b", "c"] },
      { amount: 100, eligiblePlayerIds: ["b", "c"] },
    ]);
  });
});
