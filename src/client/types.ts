import type { Card } from "../../shared/cards";
import type { GameState, LegalActions, RoomConfig } from "../../shared/pokerTypes";
import type { RoomPlayer, SettlementResult, TopUpRequest } from "../../server/roomStore";

export type SessionState = {
  id: string;
  nickname: string;
};

export type LobbyRoomSummary = {
  code: string;
  playerCount: number;
  smallBlind: number;
  bigBlind: number;
  straddleEnabled: boolean;
  hasPassword: boolean;
  hostNickname: string;
  status: string;
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

export type PrivatePlayerState = {
  playerId: string;
  holeCards: Card[];
  legalActions: LegalActions;
};

export type Ack<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export type { SettlementResult };
