import { beforeEach, describe, expect, it } from "vitest";
import {
  approveTopUp,
  calculateSettlement,
  createRoom,
  getRoom,
  handleHeartbeat,
  joinRoom,
  leaveRoom,
  requestTopUp,
  resetRoomStoreForTests,
  startNextHand,
  sweepOfflinePlayers,
} from "../server/roomStore";

describe("room store", () => {
  beforeEach(() => {
    resetRoomStoreForTests();
  });

  it("creates a room with a 4-digit code", () => {
    const room = createRoom("host", {
      smallBlind: 5,
      bigBlind: 10,
      straddleEnabled: true,
      password: "pw",
    });

    expect(room.code).toMatch(/^\d{4}$/);
    expect(room.config.bigBlind).toBe(10);
    expect(room.hasPassword).toBe(true);
  });

  it("rejects a wrong password", () => {
    const room = createRoom("host", {
      smallBlind: 5,
      bigBlind: 10,
      straddleEnabled: false,
      password: "pw",
    });

    expect(() => joinRoom("guest", room.code, "bad")).toThrow("房间密码错误");
  });

  it("transfers host to the earliest joined online player", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });
    joinRoom("p2", room.code);
    joinRoom("p3", room.code);

    leaveRoom("host", room.code);

    expect(getRoom(room.code)?.hostSessionId).toBe("p2");
  });

  it("deletes an empty room", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });

    leaveRoom("host", room.code);

    expect(getRoom(room.code)).toBeUndefined();
  });

  it("marks stale heartbeat players offline after 30 seconds", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false }, 1000);
    joinRoom("p2", room.code, undefined, 1000);

    handleHeartbeat("host", 31_000);
    sweepOfflinePlayers(31_001);

    expect(getRoom(room.code)?.players.find((player) => player.sessionId === "p2")?.online).toBe(false);
  });

  it("folds an offline player during a hand", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false }, 1000);
    joinRoom("p2", room.code, undefined, 1000);
    joinRoom("p3", room.code, undefined, 1000);
    joinRoom("p4", room.code, undefined, 1000);

    startNextHand("host", room.code, 1);
    handleHeartbeat("host", 31_000);
    handleHeartbeat("p3", 31_000);
    handleHeartbeat("p4", 31_000);
    sweepOfflinePlayers(31_001);

    expect(getRoom(room.code)?.game?.players.find((player) => player.id === "p2")?.status).toBe("folded");
  });

  it("applies approved top-up on the next hand and includes it in settlement", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });
    joinRoom("p2", room.code);
    const request = requestTopUp("p2", room.code, 200).topUpRequests[0];

    approveTopUp("host", room.code, request.id);
    const settlement = calculateSettlement("host", room.code);

    expect(settlement.players.find((player) => player.sessionId === "p2")?.net).toBe(0);
    expect(getRoom(room.code)?.players.find((player) => player.sessionId === "p2")?.pendingTopUp).toBe(0);
    expect(getRoom(room.code)?.players.find((player) => player.sessionId === "p2")?.chips).toBe(1200);
  });
});
