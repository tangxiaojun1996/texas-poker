import type { Card } from "./cards";

export type Street =
  | "waiting"
  | "straddleDecision"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "handComplete";

export type PlayerStatus = "active" | "folded" | "all-in" | "sitting-out";

export type PlayerAction =
  | { type: "fold"; playerId: string }
  | { type: "check"; playerId: string }
  | { type: "call"; playerId: string }
  | { type: "bet"; playerId: string; amount: number }
  | { type: "raise"; playerId: string; amount: number }
  | { type: "all-in"; playerId: string };

export type RoomConfig = {
  smallBlind: number;
  bigBlind: number;
  straddleEnabled: boolean;
};

export type GamePlayer = {
  id: string;
  nickname: string;
  chips: number;
  pendingTopUp: number;
  totalInvested: number;
  status: PlayerStatus;
  holeCards: Card[];
  committedThisStreet: number;
  committedTotal: number;
  hasActed: boolean;
};

export type LegalActions = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  minAmount: number;
  maxAmount: number;
  canAllIn: boolean;
};

export type HandResult = {
  winners: string[];
  payouts: Record<string, number>;
  reason: "fold" | "showdown";
};

export type GameState = {
  config: RoomConfig;
  players: GamePlayer[];
  buttonIndex: number;
  deck: Card[];
  communityCards: Card[];
  street: Street;
  currentBet: number;
  minRaise: number;
  pot: number;
  actorId?: string;
  actionStartedAt?: number;
  actionTimeoutAt?: number;
  smallBlindPlayerId?: string;
  bigBlindPlayerId?: string;
  straddlePlayerId?: string;
  handResult?: HandResult;
};
