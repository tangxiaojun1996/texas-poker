import { advanceIfNeeded, applyAction, chooseStraddle, startHand } from "../shared/gameEngine";
import type { GameState, PlayerAction, RoomConfig } from "../shared/pokerTypes";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const DEFAULT_BUY_IN = 1_000;
const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS_PER_ROOM = 9;

export type RoomPlayer = {
  sessionId: string;
  nickname: string;
  chips: number;
  totalInvested: number;
  pendingTopUp: number;
  online: boolean;
  lastSeenAt: number;
  joinedOrder: number;
};

export type TopUpRequest = {
  id: string;
  sessionId: string;
  amount: number;
  status: "pending" | "approved";
};

export type Room = {
  code: string;
  hostSessionId: string;
  config: RoomConfig;
  password?: string;
  players: RoomPlayer[];
  topUpRequests: TopUpRequest[];
  game?: GameState;
  nextJoinOrder: number;
};

export type CreateRoomInput = RoomConfig & {
  password?: string;
};

export type PublicRoomState = {
  code: string;
  hostSessionId: string;
  config: RoomConfig;
  hasPassword: boolean;
  players: RoomPlayer[];
  topUpRequests: TopUpRequest[];
  game?: GameState;
};

export type SettlementResult = {
  players: Array<{
    sessionId: string;
    nickname: string;
    chips: number;
    totalInvested: number;
    pendingTopUp: number;
    net: number;
  }>;
  totalNet: number;
};

export type SweepResult = {
  changedRooms: PublicRoomState[];
  lobbyChanged: boolean;
};

const rooms = new Map<string, Room>();

export function createRoom(hostSessionId: string, input: CreateRoomInput, now = Date.now()): PublicRoomState {
  const code = generateRoomCode();
  const host = createRoomPlayer(hostSessionId, now, 1, DEFAULT_BUY_IN);
  const room: Room = {
    code,
    hostSessionId,
    config: {
      smallBlind: input.smallBlind,
      bigBlind: input.bigBlind,
      straddleEnabled: input.straddleEnabled,
    },
    password: normalizePassword(input.password),
    players: [host],
    topUpRequests: [],
    nextJoinOrder: 2,
  };

  rooms.set(code, room);
  return toPublicRoom(room);
}

export function joinRoom(sessionId: string, roomCode: string, password?: string, now = Date.now()): PublicRoomState {
  const room = requireRoom(roomCode);
  if (room.password && room.password !== password) {
    throw new Error("房间密码错误");
  }

  const existing = room.players.find((player) => player.sessionId === sessionId);
  if (existing) {
    existing.online = true;
    existing.lastSeenAt = now;
    return toPublicRoom(room);
  }

  if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
    throw new Error("房间最多支持 9 名玩家");
  }

  room.players.push(createRoomPlayer(sessionId, now, room.nextJoinOrder, DEFAULT_BUY_IN));
  room.nextJoinOrder += 1;
  return toPublicRoom(room);
}

export function leaveRoom(sessionId: string, roomCode: string): void {
  const room = requireRoom(roomCode);
  room.players = room.players.filter((player) => player.sessionId !== sessionId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return;
  }

  if (room.hostSessionId === sessionId) {
    transferHost(room);
  }
}

export function startNextHand(hostSessionId: string, roomCode: string, seed?: number, now = Date.now()): PublicRoomState {
  const room = requireHostRoom(hostSessionId, roomCode);
  const gamePlayers = room.players
    .filter((player) => player.online && player.chips + player.pendingTopUp > 0)
    .sort((a, b) => a.joinedOrder - b.joinedOrder)
    .map((player) => ({
      id: player.sessionId,
      nickname: player.nickname,
      chips: player.chips,
      pendingTopUp: player.pendingTopUp,
      totalInvested: player.totalInvested,
      status: "active" as const,
      holeCards: [],
      committedThisStreet: 0,
      committedTotal: 0,
      hasActed: false,
    }));

  if (gamePlayers.length < MIN_PLAYERS_TO_START) {
    throw new Error("至少需要 2 名在线玩家才能开始");
  }

  room.game = startHand(
    {
      config: room.config,
      players: gamePlayers,
      buttonIndex: room.game?.buttonIndex ?? -1,
      deck: [],
      communityCards: [],
      street: "waiting",
      currentBet: 0,
      minRaise: room.config.bigBlind,
      pot: 0,
    },
    seed,
    now,
  );
  syncRoomPlayersFromGame(room);
  return toPublicRoom(room);
}

export function requestTopUp(sessionId: string, roomCode: string, amount: number): PublicRoomState {
  const room = requireRoom(roomCode);
  if (room.game && room.game.street !== "handComplete" && room.game.street !== "waiting") {
    throw new Error("补码只能在一局结束后、下一局开始前申请");
  }
  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new Error("补码数量必须是正整数");
  }
  requireRoomPlayer(room, sessionId);
  room.topUpRequests.push({
    id: `${sessionId}-${Date.now()}-${room.topUpRequests.length + 1}`,
    sessionId,
    amount,
    status: "pending",
  });
  return toPublicRoom(room);
}

export function approveTopUp(hostSessionId: string, roomCode: string, requestId: string): PublicRoomState {
  const room = requireHostRoom(hostSessionId, roomCode);
  const request = room.topUpRequests.find((item) => item.id === requestId);
  if (!request || request.status !== "pending") {
    throw new Error("补码申请不存在");
  }
  const player = requireRoomPlayer(room, request.sessionId);
  request.status = "approved";
  player.totalInvested += request.amount;

  if (room.game && room.game.street !== "waiting" && room.game.street !== "handComplete") {
    player.pendingTopUp += request.amount;
  } else {
    player.chips += request.amount;
  }

  return toPublicRoom(room);
}

export function calculateSettlement(hostSessionId: string, roomCode: string): SettlementResult {
  const room = requireHostRoom(hostSessionId, roomCode);
  const players = room.players.map((player) => {
    const net = player.chips + player.pendingTopUp - player.totalInvested;
    return {
      sessionId: player.sessionId,
      nickname: player.nickname,
      chips: player.chips,
      totalInvested: player.totalInvested,
      pendingTopUp: player.pendingTopUp,
      net,
    };
  });

  return {
    players,
    totalNet: players.reduce((sum, player) => sum + player.net, 0),
  };
}

export function handleHeartbeat(sessionId: string, now = Date.now()): void {
  for (const room of rooms.values()) {
    const player = room.players.find((item) => item.sessionId === sessionId);
    if (player) {
      player.online = true;
      player.lastSeenAt = now;
    }
  }
}

export function updatePlayerNickname(sessionId: string, nickname: string): PublicRoomState[] {
  const changedRooms: PublicRoomState[] = [];

  for (const room of rooms.values()) {
    const player = room.players.find((item) => item.sessionId === sessionId);
    if (!player) {
      continue;
    }

    player.nickname = nickname;
    const gamePlayer = room.game?.players.find((item) => item.id === sessionId);
    if (gamePlayer) {
      gamePlayer.nickname = nickname;
    }
    changedRooms.push(toPublicRoom(room));
  }

  return changedRooms;
}

export function getRoomsForSession(sessionId: string): PublicRoomState[] {
  return [...rooms.values()]
    .filter((room) => room.players.some((player) => player.sessionId === sessionId))
    .map(toPublicRoom);
}

export function sweepOfflinePlayers(now = Date.now()): SweepResult {
  const changedRooms = new Map<string, PublicRoomState>();
  let lobbyChanged = false;

  for (const [code, room] of rooms) {
    for (const player of room.players) {
      if (player.online && now - player.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        player.online = false;
        foldPlayerIfNeeded(room, player.sessionId, now);
        changedRooms.set(code, toPublicRoom(room));
        lobbyChanged = true;
      }
    }

    if (timeOutCurrentActor(room, now)) {
      changedRooms.set(code, toPublicRoom(room));
    }

    if (room.players.every((player) => !player.online)) {
      rooms.delete(code);
      changedRooms.delete(code);
      lobbyChanged = true;
      continue;
    }

    if (!room.players.some((player) => player.sessionId === room.hostSessionId && player.online)) {
      transferHost(room);
      changedRooms.set(code, toPublicRoom(room));
      lobbyChanged = true;
    }
  }

  return {
    changedRooms: [...changedRooms.values()],
    lobbyChanged,
  };
}

export function applyGameAction(sessionId: string, roomCode: string, action: Omit<PlayerAction, "playerId">): PublicRoomState {
  const room = requireRoom(roomCode);
  if (!room.game) {
    throw new Error("当前没有进行中的牌局");
  }
  room.game = applyAction(room.game, { ...action, playerId: sessionId } as PlayerAction);
  syncRoomPlayersFromGame(room);
  return toPublicRoom(room);
}

export function chooseRoomStraddle(
  sessionId: string,
  roomCode: string,
  enabled: boolean,
): PublicRoomState {
  const room = requireRoom(roomCode);
  if (!room.game) {
    throw new Error("当前没有进行中的牌局");
  }
  room.game = chooseStraddle(room.game, sessionId, enabled);
  syncRoomPlayersFromGame(room);
  return toPublicRoom(room);
}

export function setRoomPassword(hostSessionId: string, roomCode: string, password?: string): PublicRoomState {
  const room = requireHostRoom(hostSessionId, roomCode);
  room.password = normalizePassword(password);
  return toPublicRoom(room);
}

export function dismissRoom(hostSessionId: string, roomCode: string): void {
  requireHostRoom(hostSessionId, roomCode);
  rooms.delete(roomCode);
}

export function getRoom(roomCode: string): Room | undefined {
  return rooms.get(roomCode);
}

export function listRooms(): PublicRoomState[] {
  return [...rooms.values()].map(toPublicRoom);
}

export function resetRoomStoreForTests(): void {
  rooms.clear();
}

function foldPlayerIfNeeded(room: Room, sessionId: string, now = Date.now()): void {
  if (!room.game || room.game.street === "waiting" || room.game.street === "handComplete") {
    return;
  }

  const gamePlayer = room.game.players.find((player) => player.id === sessionId);
  if (!gamePlayer || gamePlayer.status !== "active") {
    return;
  }

  if (room.game.actorId === sessionId) {
    room.game = applyAction(room.game, { type: "fold", playerId: sessionId }, now);
  } else {
    gamePlayer.status = "folded";
    room.game = advanceIfNeeded(room.game, now);
  }
  syncRoomPlayersFromGame(room);
}

function timeOutCurrentActor(room: Room, now: number): boolean {
  if (!room.game?.actorId || !room.game.actionTimeoutAt || now <= room.game.actionTimeoutAt) {
    return false;
  }

  if (room.game.street === "straddleDecision") {
    const timedOutPlayerId = room.game.actorId;
    room.game = chooseStraddle(room.game, timedOutPlayerId, false, now);
    const timedOutPlayer = room.game.players.find((player) => player.id === timedOutPlayerId);
    if (timedOutPlayer) {
      timedOutPlayer.status = "folded";
      timedOutPlayer.hasActed = true;
    }
    if (room.game.players.filter((player) => player.status !== "folded" && player.status !== "sitting-out").length === 1) {
      room.game = advanceIfNeeded(room.game, now);
    }
  } else {
    room.game = applyAction(room.game, { type: "fold", playerId: room.game.actorId }, now);
  }
  syncRoomPlayersFromGame(room);
  return true;
}

function syncRoomPlayersFromGame(room: Room): void {
  if (!room.game) {
    return;
  }

  for (const gamePlayer of room.game.players) {
    const roomPlayer = room.players.find((player) => player.sessionId === gamePlayer.id);
    if (roomPlayer) {
      roomPlayer.chips = gamePlayer.chips;
      roomPlayer.pendingTopUp = gamePlayer.pendingTopUp;
      roomPlayer.totalInvested = gamePlayer.totalInvested;
    }
  }
}

function transferHost(room: Room): void {
  const nextHost = room.players
    .filter((player) => player.online)
    .sort((a, b) => a.joinedOrder - b.joinedOrder)[0];
  if (nextHost) {
    room.hostSessionId = nextHost.sessionId;
  }
}

function createRoomPlayer(sessionId: string, now: number, joinedOrder: number, buyIn: number): RoomPlayer {
  return {
    sessionId,
    nickname: `玩家${sessionId.slice(0, 4)}`,
    chips: buyIn,
    totalInvested: buyIn,
    pendingTopUp: 0,
    online: true,
    lastSeenAt: now,
    joinedOrder,
  };
}

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const code = Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, "0");
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new Error("没有可用房间号");
}

function normalizePassword(password: string | undefined): string | undefined {
  const trimmed = password?.trim();
  return trimmed ? trimmed : undefined;
}

function requireRoom(roomCode: string): Room {
  const room = rooms.get(roomCode);
  if (!room) {
    throw new Error("房间不存在");
  }
  return room;
}

function requireHostRoom(hostSessionId: string, roomCode: string): Room {
  const room = requireRoom(roomCode);
  if (room.hostSessionId !== hostSessionId) {
    throw new Error("只有房主可以执行该操作");
  }
  return room;
}

function requireRoomPlayer(room: Room, sessionId: string): RoomPlayer {
  const player = room.players.find((item) => item.sessionId === sessionId);
  if (!player) {
    throw new Error("玩家不在房间中");
  }
  return player;
}

function toPublicRoom(room: Room): PublicRoomState {
  return {
    code: room.code,
    hostSessionId: room.hostSessionId,
    config: room.config,
    hasPassword: Boolean(room.password),
    players: room.players.map((player) => ({ ...player })),
    topUpRequests: room.topUpRequests.map((request) => ({ ...request })),
    game: room.game,
  };
}
