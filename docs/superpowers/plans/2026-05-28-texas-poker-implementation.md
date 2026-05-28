# Web 德州扑克 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight browser-based Texas Hold'em cash game for friends, with session identity, in-memory rooms, UTG straddle, real-time play, top-up requests, heartbeat handling, and settlement.

**Architecture:** Use one Node.js process to serve both the React client and Socket.IO API. Keep poker rules in a pure TypeScript core so betting, side pots, hand evaluation, and stage progression can be tested without UI or sockets. Keep all room/session/game state in memory and treat the server as the authoritative source.

**Tech Stack:** Vite, React, TypeScript, Express, Socket.IO, Vitest, Node.js in-memory Maps.

---

## File Structure

- Create: `package.json` - scripts and dependencies.
- Create: `tsconfig.json` - shared TypeScript config.
- Create: `tsconfig.node.json` - server build config.
- Create: `index.html` - Vite HTML entry.
- Create: `vite.config.ts` - React/Vite config.
- Create: `src/main.tsx` - React app entry.
- Create: `src/App.tsx` - top-level client routing between lobby and room.
- Create: `src/client/socket.ts` - Socket.IO client wrapper.
- Create: `src/client/types.ts` - client-facing DTO types.
- Create: `src/styles.css` - lightweight poker table styling.
- Create: `server/index.ts` - Express and Socket.IO bootstrap.
- Create: `server/session.ts` - anonymous session and cookie handling.
- Create: `server/roomStore.ts` - in-memory room lifecycle and heartbeat handling.
- Create: `server/socketHandlers.ts` - Socket.IO events and validation boundaries.
- Create: `shared/cards.ts` - cards, deck, shuffle helpers.
- Create: `shared/handEvaluator.ts` - seven-card hand evaluator.
- Create: `shared/pokerTypes.ts` - core game state and action types.
- Create: `shared/pots.ts` - side pot construction and settlement helpers.
- Create: `shared/gameEngine.ts` - hand lifecycle, legal actions, betting, streets.
- Create: `tests/handEvaluator.test.ts` - hand ranking tests.
- Create: `tests/pots.test.ts` - side pot tests.
- Create: `tests/gameEngine.test.ts` - stage, action order, straddle, top-up timing tests.
- Create: `tests/roomStore.test.ts` - room, host transfer, heartbeat, settlement tests.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `server/index.ts`

- [ ] **Step 1: Create package manifest**

Write `package.json`:

```json
{
  "name": "texas-poker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build && tsc -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "express": "latest",
    "socket.io": "latest",
    "socket.io-client": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@types/express": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "typescript": "latest",
    "tsx": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "shared", "tests", "vite.config.ts"]
}
```

Write `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-server",
    "types": ["node"]
  },
  "include": ["server", "shared"]
}
```

Write `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create minimal client and server**

Write `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, and `server/index.ts` so `npm run dev` starts Express on port `3000` and Vite middleware in development. `App.tsx` initially renders a title and "连接中" status.

- [ ] **Step 4: Verify scaffold**

Run: `npm install`

Expected: dependencies install successfully.

Run: `npm run typecheck`

Expected: TypeScript passes.

- [ ] **Step 5: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json index.html vite.config.ts src server
git commit -m "Add web poker project scaffold"
```

---

### Task 2: Cards and Hand Evaluation

**Files:**
- Create: `shared/cards.ts`
- Create: `shared/handEvaluator.ts`
- Create: `tests/handEvaluator.test.ts`

- [ ] **Step 1: Write failing hand evaluator tests**

Write `tests/handEvaluator.test.ts` with cases for royal flush, straight flush, four of a kind, full house, flush, wheel straight, two pair kicker, high card, and exact split.

Core assertions:

```ts
expect(compareHands(evaluateBestHand(cards("As Ks")), evaluateBestHand(cards("Qs Js")))).toBeGreaterThan(0);
expect(evaluateBestHand(cards("As 2d 3h 4c 5s 9d Kc")).name).toBe("straight");
expect(compareHands(evaluateBestHand(cards("Ah Ad Kc Qs 9d 4c 2h")), evaluateBestHand(cards("Ac As Kd Qh 9s 3c 2d")))).toBe(0);
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/handEvaluator.test.ts`

Expected: fails because `shared/cards.ts` and `shared/handEvaluator.ts` do not exist.

- [ ] **Step 3: Implement cards**

Write `shared/cards.ts` with:

```ts
export type Suit = "s" | "h" | "d" | "c";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Card = { rank: Rank; suit: Suit };

export function createDeck(seed = Date.now()): Card[];
export function parseCard(token: string): Card;
export function formatCard(card: Card): string;
```

Use deterministic seeded shuffle with a small linear congruential generator so tests can reproduce deals.

- [ ] **Step 4: Implement evaluator**

Write `shared/handEvaluator.ts` with:

```ts
export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-kind"
  | "straight-flush"
  | "royal-flush";

export type EvaluatedHand = {
  category: number;
  name: HandCategory;
  ranks: number[];
  cards: Card[];
};

export function evaluateBestHand(cards: Card[]): EvaluatedHand;
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number;
```

Implementation rule: enumerate all 5-card combinations from 7 cards, evaluate each 5-card hand, sort by category then rank kickers, and return the best. This is small, reliable, and fast enough for a home game.

- [ ] **Step 5: Verify evaluator**

Run: `npm test -- tests/handEvaluator.test.ts`

Expected: all hand evaluator tests pass.

- [ ] **Step 6: Commit evaluator**

Run:

```bash
git add shared/cards.ts shared/handEvaluator.ts tests/handEvaluator.test.ts
git commit -m "Add poker hand evaluator"
```

---

### Task 3: Pots and Core Game Engine

**Files:**
- Create: `shared/pokerTypes.ts`
- Create: `shared/pots.ts`
- Create: `shared/gameEngine.ts`
- Create: `tests/pots.test.ts`
- Create: `tests/gameEngine.test.ts`

- [ ] **Step 1: Write pot tests**

Write `tests/pots.test.ts` to cover:

```ts
expect(buildPots([
  { playerId: "a", committed: 50, folded: false },
  { playerId: "b", committed: 100, folded: false },
  { playerId: "c", committed: 200, folded: false }
])).toEqual([
  { amount: 150, eligiblePlayerIds: ["a", "b", "c"] },
  { amount: 100, eligiblePlayerIds: ["b", "c"] },
  { amount: 100, eligiblePlayerIds: ["c"] }
]);
```

Also cover folded players contributing chips but not being eligible to win.

- [ ] **Step 2: Write game engine tests**

Write `tests/gameEngine.test.ts` to cover:

- Normal preflop first actor is left of big blind.
- UTG straddle first actor is left of straddler.
- Straddler acts last preflop.
- Flop/turn/river reveal 3/1/1 community cards.
- One remaining non-folded player wins immediately.
- Mid-hand top-up is not added to `currentChips` until next hand.

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- tests/pots.test.ts tests/gameEngine.test.ts`

Expected: fails because pot and game engine modules do not exist.

- [ ] **Step 4: Implement core types**

Write `shared/pokerTypes.ts` with explicit state:

```ts
export type Street = "waiting" | "straddleDecision" | "preflop" | "flop" | "turn" | "river" | "showdown" | "handComplete";
export type PlayerStatus = "active" | "folded" | "all-in" | "sitting-out";
export type PlayerAction =
  | { type: "fold"; playerId: string }
  | { type: "check"; playerId: string }
  | { type: "call"; playerId: string }
  | { type: "bet"; playerId: string; amount: number }
  | { type: "raise"; playerId: string; amount: number }
  | { type: "all-in"; playerId: string };
```

Include `GamePlayer`, `GameState`, `LegalActions`, `RoomConfig`, and `HandResult` types with chip counts, per-street commitments, total hand commitments, button index, blinds, straddle flag, current bet, minimum raise, deck, community cards, and action player id.

- [ ] **Step 5: Implement side pots**

Write `shared/pots.ts` with:

```ts
export type PotInput = { playerId: string; committed: number; folded: boolean };
export type SidePot = { amount: number; eligiblePlayerIds: string[] };
export function buildPots(inputs: PotInput[]): SidePot[];
```

Sort unique committed levels ascending, create each layer amount by `(level - previousLevel) * contributors.length`, and eligible players are non-folded contributors at that layer.

- [ ] **Step 6: Implement engine**

Write `shared/gameEngine.ts` with:

```ts
export function startHand(state: GameState, seed?: number): GameState;
export function chooseStraddle(state: GameState, playerId: string, enabled: boolean): GameState;
export function getLegalActions(state: GameState, playerId: string): LegalActions;
export function applyAction(state: GameState, action: PlayerAction): GameState;
export function advanceIfNeeded(state: GameState): GameState;
export function settleHand(state: GameState): HandResult;
```

Use immutable returns for predictability. Keep table stakes by applying pending top-ups only inside `startHand`.

- [ ] **Step 7: Verify core**

Run: `npm test -- tests/pots.test.ts tests/gameEngine.test.ts`

Expected: all core tests pass.

- [ ] **Step 8: Commit core engine**

Run:

```bash
git add shared/pokerTypes.ts shared/pots.ts shared/gameEngine.ts tests/pots.test.ts tests/gameEngine.test.ts
git commit -m "Add poker game engine"
```

---

### Task 4: Session and Room Store

**Files:**
- Create: `server/session.ts`
- Create: `server/roomStore.ts`
- Create: `tests/roomStore.test.ts`

- [ ] **Step 1: Write room store tests**

Write `tests/roomStore.test.ts` to cover:

- Creating a room generates a 4-digit room code.
- Password-protected room rejects wrong password.
- Host transfers to earliest joined online player.
- Empty room is deleted.
- Heartbeat older than 30 seconds marks player offline.
- Offline mid-hand player is folded.
- Settlement returns `currentChips + pendingTopUp - totalInvested`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/roomStore.test.ts`

Expected: fails because room store does not exist.

- [ ] **Step 3: Implement sessions**

Write `server/session.ts`:

```ts
export type Session = {
  id: string;
  nickname: string;
  createdAt: number;
  lastSeenAt: number;
};

export function getOrCreateSession(cookieHeader: string | undefined): { session: Session; setCookie?: string };
export function updateNickname(sessionId: string, nickname: string): Session;
export function touchSession(sessionId: string, now?: number): Session | undefined;
```

Use an in-memory `Map<string, Session>`. Generate default nicknames like `玩家1234`.

- [ ] **Step 4: Implement room store**

Write `server/roomStore.ts` with:

```ts
export function createRoom(hostSessionId: string, input: CreateRoomInput): PublicRoomState;
export function joinRoom(sessionId: string, roomCode: string, password?: string): PublicRoomState;
export function leaveRoom(sessionId: string, roomCode: string): void;
export function startNextHand(hostSessionId: string, roomCode: string): PublicRoomState;
export function requestTopUp(sessionId: string, roomCode: string, amount: number): PublicRoomState;
export function approveTopUp(hostSessionId: string, roomCode: string, requestId: string): PublicRoomState;
export function calculateSettlement(hostSessionId: string, roomCode: string): SettlementResult;
export function handleHeartbeat(sessionId: string, now?: number): void;
export function sweepOfflinePlayers(now?: number): void;
```

Represent join order with a monotonic `joinedAtOrder` number. When host leaves or is offline, choose the online player with the lowest join order.

- [ ] **Step 5: Verify room store**

Run: `npm test -- tests/roomStore.test.ts`

Expected: all room store tests pass.

- [ ] **Step 6: Commit room store**

Run:

```bash
git add server/session.ts server/roomStore.ts tests/roomStore.test.ts
git commit -m "Add in-memory room store"
```

---

### Task 5: Socket.IO API

**Files:**
- Modify: `server/index.ts`
- Create: `server/socketHandlers.ts`
- Create: `src/client/socket.ts`
- Create: `src/client/types.ts`

- [ ] **Step 1: Define client DTOs**

Write `src/client/types.ts` with public-only types:

```ts
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
```

Also include `PublicRoomState`, `PublicPlayer`, `PrivatePlayerState`, `LegalActionDto`, and `SettlementResult`.

- [ ] **Step 2: Implement socket client wrapper**

Write `src/client/socket.ts`:

```ts
import { io } from "socket.io-client";

export const socket = io({
  autoConnect: true,
  withCredentials: true,
});

export function emitWithAck<TInput, TOutput>(event: string, input: TInput): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, input, (error: Error | null, response: TOutput) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}
```

- [ ] **Step 3: Implement server socket handlers**

Write `server/socketHandlers.ts` to register:

- `session:updateNickname`
- `lobby:listRooms`
- `room:create`
- `room:join`
- `room:leave`
- `room:setPassword`
- `room:dismiss`
- `room:startHand`
- `room:requestTopUp`
- `room:approveTopUp`
- `game:chooseStraddle`
- `game:act`
- `heartbeat`

Every handler must catch errors and return `{ ok: false, message }` without mutating state after validation failure.

- [ ] **Step 4: Wire Socket.IO into server**

Modify `server/index.ts` to create an HTTP server, attach `new Server(httpServer, { cors: { origin: true, credentials: true } })`, call `registerSocketHandlers(io)`, and run `setInterval(() => sweepOfflinePlayers(Date.now()), 5000)`.

- [ ] **Step 5: Verify API type safety**

Run: `npm run typecheck`

Expected: TypeScript passes.

- [ ] **Step 6: Commit socket API**

Run:

```bash
git add server/index.ts server/socketHandlers.ts src/client/socket.ts src/client/types.ts
git commit -m "Add realtime poker socket API"
```

---

### Task 6: React Lobby and Table UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Implement app state**

Modify `src/App.tsx` to keep:

```ts
type View = "lobby" | "room";
const [view, setView] = useState<View>("lobby");
const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
const [room, setRoom] = useState<PublicRoomState | null>(null);
const [privateState, setPrivateState] = useState<PrivatePlayerState | null>(null);
```

Subscribe to `session:state`, `lobby:roomsUpdated`, `room:state`, `game:state`, `game:privateState`, `settlement:result`, and `notification`.

- [ ] **Step 2: Implement lobby**

Add lobby UI:

- nickname input and save button.
- room creation form with small blind, big blind, straddle checkbox, password.
- room list with 4-digit code, blinds, straddle, lock indicator, player count, and join button.
- password prompt for locked rooms.

- [ ] **Step 3: Implement table**

Add room UI:

- poker table container.
- player seats around table with nickname, chip count, host mark, online/offline, folded/all-in/current actor status.
- community cards in center.
- pot and street labels.
- private hole cards for current player only.
- action panel visible only when current player can act.
- host panel with start next hand, settlement, password, dismiss room, and top-up approvals.

- [ ] **Step 4: Implement action panel**

Action panel behavior:

- Show only legal buttons returned from server.
- Use amount input for bet/raise.
- Quick amount buttons compute from current visible pot: `Math.floor(pot * ratio)`.
- Quick amount buttons only set the input value.
- Submit through `game:act`; display server errors.

- [ ] **Step 5: Implement heartbeat**

In `src/App.tsx`, add:

```ts
useEffect(() => {
  const timer = window.setInterval(() => {
    socket.emit("heartbeat");
  }, 10_000);
  return () => window.clearInterval(timer);
}, []);
```

- [ ] **Step 6: Style playable UI**

Modify `src/styles.css` with dark green poker table styling, card rectangles, readable forms, action buttons, and responsive layout for laptop and mobile widths.

- [ ] **Step 7: Verify UI builds**

Run: `npm run typecheck`

Expected: TypeScript passes.

Run: `npm run build`

Expected: Vite and server TypeScript builds pass.

- [ ] **Step 8: Commit UI**

Run:

```bash
git add src/App.tsx src/styles.css
git commit -m "Add poker lobby and table UI"
```

---

### Task 7: End-to-End Manual Verification

**Files:**
- Modify: only the exact source or test file identified by a failed automated check or failed manual verification step.

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 2: Run dev server**

Run: `npm run dev`

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 3: Manual two-browser test**

Open two browser sessions and verify:

- Each session gets a different default nickname.
- Session nickname can be changed.
- Player A creates a room with blinds and straddle enabled.
- Player B joins by room code.
- Host starts next hand.
- Straddle decision appears only for UTG.
- Betting buttons follow legal actions.
- Quick bet buttons fill amount and allow manual edit.
- Mid-hand browser close causes fold after heartbeat timeout.
- Host transfers when host leaves.
- Top-up request appears for host and approved top-up follows next-hand timing.
- Settlement shows per-player net.
- Dismiss room sends everyone back to lobby.

- [ ] **Step 4: Commit final fixes**

Run:

```bash
git add .
git commit -m "Complete lightweight web poker game"
```

---

## Self-Review

Spec coverage:

- Texas Hold'em rules, streets, hand rankings, showdown, all-in, side pots: covered by Tasks 2 and 3.
- UTG straddle: covered by Task 3 engine tests and Task 6 UI.
- Blind configuration and room creation: covered by Tasks 4, 5, and 6.
- Top-up requests and host approval: covered by Tasks 4, 5, and 6.
- Quick bet amounts: covered by Task 6.
- Session-only identity and nickname edits: covered by Tasks 4, 5, and 6.
- Lobby, 4-digit rooms, password rooms, auto dissolve: covered by Tasks 4, 5, and 6.
- Host transfer, settlement, dismiss room: covered by Tasks 4, 5, and 6.
- Heartbeat every 10 seconds and 30-second timeout: covered by Tasks 4, 5, and 6.

Placeholder scan: no incomplete requirements remain in this plan.

Type consistency: public DTOs are separated from core state, and core functions named here match the design spec.
