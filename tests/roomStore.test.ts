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
  updatePlayerNickname,
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

  it("rejects joining more than 9 players", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });

    for (let index = 2; index <= 9; index += 1) {
      joinRoom(`p${index}`, room.code);
    }

    expect(() => joinRoom("p10", room.code)).toThrow("房间最多支持 9 名玩家");
  });

  it("rejects starting with fewer than 2 online players", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });

    expect(() => startNextHand("host", room.code)).toThrow("至少需要 2 名在线玩家才能开始");
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

  it("automatically folds the current actor after 45 seconds", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false }, 1000);
    joinRoom("p2", room.code, undefined, 1000);
    joinRoom("p3", room.code, undefined, 1000);

    startNextHand("host", room.code, 1, 1000);
    const actorId = getRoom(room.code)?.game?.actorId;
    handleHeartbeat("host", 45_000);
    handleHeartbeat("p2", 45_000);
    handleHeartbeat("p3", 45_000);

    const result = sweepOfflinePlayers(46_001);

    expect(getRoom(room.code)?.game?.players.find((player) => player.id === actorId)?.status).toBe("folded");
    expect(result.changedRooms.map((changedRoom) => changedRoom.code)).toContain(room.code);
  });

  it("automatically folds a timed-out straddle decision", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: true }, 1000);
    joinRoom("p2", room.code, undefined, 1000);
    joinRoom("p3", room.code, undefined, 1000);

    startNextHand("host", room.code, 1, 1000);
    const actorId = getRoom(room.code)?.game?.actorId;
    handleHeartbeat("host", 45_000);
    handleHeartbeat("p2", 45_000);
    handleHeartbeat("p3", 45_000);

    sweepOfflinePlayers(46_001);

    expect(getRoom(room.code)?.game?.street).toBe("preflop");
    expect(getRoom(room.code)?.game?.players.find((player) => player.id === actorId)?.status).toBe("folded");
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

  it("rejects top-up requests while a hand is in progress", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });
    joinRoom("p2", room.code);
    startNextHand("host", room.code, 1);

    expect(() => requestTopUp("p2", room.code, 200)).toThrow("补码只能在一局结束后、下一局开始前申请");
  });

  it("updates nickname for room player and active game player", () => {
    const room = createRoom("host", { smallBlind: 5, bigBlind: 10, straddleEnabled: false });
    joinRoom("p2", room.code);
    startNextHand("host", room.code, 1);

    updatePlayerNickname("p2", "新昵称");

    expect(getRoom(room.code)?.players.find((player) => player.sessionId === "p2")?.nickname).toBe("新昵称");
    expect(getRoom(room.code)?.game?.players.find((player) => player.id === "p2")?.nickname).toBe("新昵称");
  });
});
