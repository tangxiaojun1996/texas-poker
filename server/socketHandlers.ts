import type { Server, Socket } from "socket.io";
import { getOrCreateSession, updateNickname } from "./session";
import {
  applyGameAction,
  approveTopUp,
  calculateSettlement,
  chooseRoomStraddle,
  createRoom,
  dismissRoom,
  handleHeartbeat,
  joinRoom,
  leaveRoom,
  listRooms,
  requestTopUp,
  setRoomPassword,
  startNextHand,
  type PublicRoomState,
} from "./roomStore";
import type { Card } from "../shared/cards";
import { getLegalActions } from "../shared/gameEngine";
import type { LegalActions } from "../shared/pokerTypes";

type Handler<TInput, TOutput> = (input: TInput, socket: Socket) => TOutput;
type Ack<T = unknown> = { ok: true; data: T } | { ok: false; message: string };
type LobbyRoomSummary = {
  code: string;
  playerCount: number;
  smallBlind: number;
  bigBlind: number;
  straddleEnabled: boolean;
  hasPassword: boolean;
  hostNickname: string;
  status: string;
};
type PrivatePlayerState = {
  playerId: string;
  holeCards: Card[];
  legalActions: LegalActions;
};

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket) => {
    const { session } = getOrCreateSession(socket.handshake.headers.cookie);
    socket.data.sessionId = session.id;
    socket.emit("session:state", { id: session.id, nickname: session.nickname });
    socket.emit("lobby:roomsUpdated", summarizeRooms(listRooms()));

    socket.on("session:updateNickname", ack(socket, (input: { nickname: string }) => {
      const updated = updateNickname(session.id, input.nickname);
      return { id: updated.id, nickname: updated.nickname };
    }));

    socket.on("lobby:listRooms", ack(socket, () => summarizeRooms(listRooms())));

    socket.on("room:create", ack(socket, (input: { smallBlind: number; bigBlind: number; straddleEnabled: boolean; password?: string }) => {
      const room = createRoom(session.id, input);
      socket.join(room.code);
      broadcastLobby(io);
      emitRoom(io, room);
      return room;
    }));

    socket.on("room:join", ack(socket, (input: { code: string; password?: string }) => {
      const room = joinRoom(session.id, input.code, input.password);
      socket.join(room.code);
      broadcastLobby(io);
      emitRoom(io, room);
      return room;
    }));

    socket.on("room:leave", ack(socket, (input: { code: string }) => {
      leaveRoom(session.id, input.code);
      socket.leave(input.code);
      broadcastLobby(io);
      return true;
    }));

    socket.on("room:setPassword", ack(socket, (input: { code: string; password?: string }) => {
      const room = setRoomPassword(session.id, input.code, input.password);
      broadcastLobby(io);
      emitRoom(io, room);
      return room;
    }));

    socket.on("room:dismiss", ack(socket, (input: { code: string }) => {
      dismissRoom(session.id, input.code);
      io.to(input.code).emit("room:state", undefined);
      io.in(input.code).socketsLeave(input.code);
      broadcastLobby(io);
      return true;
    }));

    socket.on("room:startHand", ack(socket, (input: { code: string }) => {
      const room = startNextHand(session.id, input.code);
      emitRoom(io, room);
      return room;
    }));

    socket.on("room:requestTopUp", ack(socket, (input: { code: string; amount: number }) => {
      const room = requestTopUp(session.id, input.code, input.amount);
      emitRoom(io, room);
      return room;
    }));

    socket.on("room:approveTopUp", ack(socket, (input: { code: string; requestId: string }) => {
      const room = approveTopUp(session.id, input.code, input.requestId);
      emitRoom(io, room);
      return room;
    }));

    socket.on("game:chooseStraddle", ack(socket, (input: { code: string; enabled: boolean }) => {
      const room = chooseRoomStraddle(session.id, input.code, input.enabled);
      emitRoom(io, room);
      return room;
    }));

    socket.on("game:act", ack(socket, (input: { code: string; action: { type: string; amount?: number } }) => {
      const room = applyGameAction(session.id, input.code, input.action as never);
      emitRoom(io, room);
      return room;
    }));

    socket.on("room:settlement", ack(socket, (input: { code: string }) => calculateSettlement(session.id, input.code)));

    socket.on("heartbeat", () => {
      handleHeartbeat(session.id);
    });
  });
}

function ack<TInput, TOutput>(socket: Socket, handler: Handler<TInput, TOutput>) {
  return (input: TInput, callback?: (response: Ack<TOutput>) => void) => {
    try {
      callback?.({ ok: true, data: handler(input, socket) });
    } catch (error) {
      callback?.({ ok: false, message: error instanceof Error ? error.message : "操作失败" });
    }
  };
}

function emitRoom(io: Server, room: PublicRoomState): void {
  io.to(room.code).emit("room:state", room);
  io.to(room.code).emit("game:state", room.game);

  if (!room.game) {
    return;
  }

  for (const player of room.players) {
    const gamePlayer = room.game.players.find((item) => item.id === player.sessionId);
    const privateState: PrivatePlayerState = {
      playerId: player.sessionId,
      holeCards: gamePlayer?.holeCards ?? [],
      legalActions: gamePlayer ? getLegalActions(room.game, player.sessionId) : getLegalActions(room.game, ""),
    };
    io.to(room.code).emit(`game:privateState:${player.sessionId}`, privateState);
  }
}

function broadcastLobby(io: Server): void {
  io.emit("lobby:roomsUpdated", summarizeRooms(listRooms()));
}

function summarizeRooms(rooms: PublicRoomState[]): LobbyRoomSummary[] {
  return rooms.map((room) => ({
    code: room.code,
    playerCount: room.players.length,
    smallBlind: room.config.smallBlind,
    bigBlind: room.config.bigBlind,
    straddleEnabled: room.config.straddleEnabled,
    hasPassword: room.hasPassword,
    hostNickname: room.players.find((player) => player.sessionId === room.hostSessionId)?.nickname ?? "房主",
    status: room.game && room.game.street !== "handComplete" ? "游戏中" : "等待中",
  }));
}
