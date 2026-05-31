# 横屏移动端牌桌界面重设计 - 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在横屏移动端（≤940px landscape）重做牌桌界面：取消右侧栏、座位卡片瘦身、椭圆桌最大化、操作按钮贴近手牌、加注子面板紧凑化。

**Architecture:** 修改 `src/App.tsx` 在 `room` 模式下增加新的状态（开关 Modal/抽屉、加注子面板可见性），并新增 4 个内联子组件（`PlayerDetailModal` / `MyProfileModal` / `TopUpRequestsDrawer` / `SettlementModal`）；`src/styles.css` 在 `@media (max-width: 940px) and (orientation: landscape)` 块内重写关键样式，并新增通用 Modal/Drawer 样式。不动 socket 协议、引擎逻辑、桌面端与竖屏布局。

**Tech Stack:** React 19 + Vite + Vitest（无 UI 测试套件，UI 验证以 typecheck + 浏览器手测为主）

**Spec:** `docs/superpowers/specs/2026-05-31-landscape-mobile-poker-redesign-design.md`

---

## 文件清单

**修改：**
- `src/App.tsx` — 重构 `room-mode` 渲染、新增 4 个 Modal/Drawer 子组件、新增加注子面板状态机
- `src/styles.css` — 新增通用 Modal/Drawer 样式；在横屏 media query 内重写 `.poker-table` `.seat` `.my-hand` `.action-panel` `.bet-box` 等

**不改：**
- `server/**`（socket 协议、引擎、roomStore）
- `shared/**`（类型）
- `tests/**`（无 UI 测试）

---

## 注意事项

- 没有 UI 单元测试基础设施。每个任务以「typecheck pass + 启 dev server + 浏览器横屏视口手测」为验证手段。
- `pnpm` 不一定可用，命令统一用 `npm`。
- 每个任务结束都要 commit。

---

## 任务 0：基线核对

**Files:** 无

- [ ] **Step 0.1: 确认工作树干净**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 0.2: 确认 typecheck 通过**

Run: `npm run typecheck`
Expected: 无错误退出

- [ ] **Step 0.3: 确认现有测试通过**

Run: `npm test`
Expected: 所有测试 pass

---

## 任务 1：通用 Modal / Drawer 样式

**Files:**
- Modify: `src/styles.css`（在文件末尾追加）

- [ ] **Step 1.1: 追加 Modal/Drawer 通用样式**

打开 `src/styles.css`，在文件末尾追加：

```css
/* === Modal & Drawer (shared) === */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}

.modal-card {
  position: relative;
  width: min(420px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  border: 1px solid rgba(247, 242, 223, 0.18);
  border-radius: 18px;
  padding: 18px;
  background: rgba(7, 19, 13, 0.96);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
  color: #f7f2df;
}

.modal-card h3 {
  margin-bottom: 12px;
  font-size: 16px;
}

.modal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #f7f2df;
  font-size: 16px;
  line-height: 28px;
}

.modal-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.modal-row span:first-child {
  color: rgba(247, 242, 223, 0.6);
}

.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.45);
}

.drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 31;
  display: grid;
  grid-template-rows: auto 1fr;
  width: min(360px, 90vw);
  height: 100dvh;
  padding: 16px;
  background: rgba(7, 19, 13, 0.98);
  border-left: 1px solid rgba(247, 242, 223, 0.18);
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.5);
  color: #f7f2df;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.drawer-body {
  overflow: auto;
  display: grid;
  gap: 8px;
  align-content: start;
}

.online-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #5df19a;
  box-shadow: 0 0 0 2px rgba(93, 241, 154, 0.18);
}

.online-dot.offline {
  background: rgba(247, 242, 223, 0.42);
  box-shadow: none;
}

.has-unread {
  position: relative;
}

.has-unread::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ff6b6b;
}
```

- [ ] **Step 1.2: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 1.3: commit**

```bash
git add src/styles.css
git commit -m "feat(ui): add shared Modal and Drawer styles"
```

---

## 任务 2：新增 Modal / Drawer 子组件骨架

**Files:**
- Modify: `src/App.tsx`（在 `App` 函数底部、`CardView` 之前新增组件）

- [ ] **Step 2.1: 新增四个组件函数**

在 `src/App.tsx` 中，在 `function CardView` 之前插入：

```tsx
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function PlayerDetailModal({
  player,
  gamePlayer,
  isHost,
  onClose,
}: {
  player: PublicRoomState["players"][number];
  gamePlayer?: PublicRoomState["game"] extends infer G ? (G extends { players: infer P } ? (P extends Array<infer Q> ? Q : never) : never) : never;
  isHost: boolean;
  onClose: () => void;
}) {
  return (
    <ModalShell title={`${player.nickname}${isHost ? " · 房主" : ""}`} onClose={onClose}>
      <div className="modal-row">
        <span>状态</span>
        <span>
          <span className={`online-dot ${player.online ? "" : "offline"}`} /> {player.online ? "在线" : "离线"}
        </span>
      </div>
      <div className="modal-row">
        <span>当前筹码</span>
        <span>{player.chips}</span>
      </div>
      <div className="modal-row">
        <span>累计补码</span>
        <span>{Math.max(0, player.totalInvested - 1000)}</span>
      </div>
      <div className="modal-row">
        <span>本局状态</span>
        <span>{gamePlayer?.status ?? "等待"}</span>
      </div>
    </ModalShell>
  );
}

function MyProfileModal({
  nickname,
  onNicknameChange,
  onNicknameSave,
  chips,
  topUp,
  topUpAmount,
  onTopUpAmountChange,
  onRequestTopUp,
  canRequestTopUp,
  onClose,
}: {
  nickname: string;
  onNicknameChange: (value: string) => void;
  onNicknameSave: () => void;
  chips: number;
  topUp: number;
  topUpAmount: string;
  onTopUpAmountChange: (value: string) => void;
  onRequestTopUp: () => void;
  canRequestTopUp: boolean;
  onClose: () => void;
}) {
  return (
    <ModalShell title="我的信息" onClose={onClose}>
      <label>
        我的昵称
        <input value={nickname} onChange={(event) => onNicknameChange(event.target.value)} />
      </label>
      <button onClick={onNicknameSave}>更新昵称</button>
      <div style={{ height: 12 }} />
      <div className="modal-row">
        <span>我的筹码</span>
        <span>{chips}</span>
      </div>
      <div className="modal-row">
        <span>累计补码</span>
        <span>{topUp}</span>
      </div>
      <label>
        申请补码（金额）
        <input type="number" value={topUpAmount} onChange={(event) => onTopUpAmountChange(event.target.value)} />
      </label>
      <button disabled={!canRequestTopUp} onClick={onRequestTopUp}>
        {canRequestTopUp ? "申请补码" : "牌局中不可补码"}
      </button>
    </ModalShell>
  );
}

function TopUpRequestsDrawer({
  requests,
  isHost,
  canApprove,
  findNicknameById,
  onApprove,
  onClose,
}: {
  requests: PublicRoomState["topUpRequests"];
  isHost: boolean;
  canApprove: boolean;
  findNicknameById: (sessionId: string) => string;
  onApprove: (requestId: string) => void;
  onClose: () => void;
}) {
  const pending = requests.filter((request) => request.status === "pending");
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <h3 style={{ margin: 0 }}>补码申请</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="drawer-body">
          {pending.length === 0 ? <p className="muted">暂无待处理申请</p> : null}
          {pending.map((request) => (
            <div className="request-row" key={request.id}>
              <span>
                {findNicknameById(request.sessionId)} 申请 {request.amount}
              </span>
              {isHost ? (
                <button disabled={!canApprove} onClick={() => onApprove(request.id)}>
                  {canApprove ? "通过" : "牌局中"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

function SettlementModal({ settlement, onClose }: { settlement: SettlementResult; onClose: () => void }) {
  return (
    <ModalShell title="结算结果" onClose={onClose}>
      {settlement.players.map((player) => (
        <div className="settlement-row" key={player.sessionId}>
          <span>{player.nickname}</span>
          <strong className={player.net >= 0 ? "win" : "lose"}>{player.net}</strong>
        </div>
      ))}
      <p style={{ marginTop: 12 }}>合计：{settlement.totalNet}</p>
    </ModalShell>
  );
}
```

注意 `PlayerDetailModal` 的 `gamePlayer` 复杂类型容易出错，改用更直接的：

```tsx
type GamePlayer = NonNullable<PublicRoomState["game"]>["players"][number];

function PlayerDetailModal({
  player,
  gamePlayer,
  isHost,
  onClose,
}: {
  player: PublicRoomState["players"][number];
  gamePlayer?: GamePlayer;
  isHost: boolean;
  onClose: () => void;
}) {
  // ... 同上 body
}
```

把上面 `PlayerDetailModal` 的 `gamePlayer` 类型从条件表达式改为直接的 `GamePlayer`，并在文件顶部（其他 type 声明之后）增加 `type GamePlayer = NonNullable<PublicRoomState["game"]>["players"][number];`。

- [ ] **Step 2.2: typecheck**

Run: `npm run typecheck`
Expected: 无错误

如果报错关于 `React.ReactNode`，确保 `import { useEffect, useMemo, useRef, useState } from "react";` 改为：

```tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
```

并在 `ModalShell` 里把 `React.ReactNode` 改为 `ReactNode`。

- [ ] **Step 2.3: commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): scaffold modal/drawer components"
```

---

## 任务 3：新增交互状态

**Files:**
- Modify: `src/App.tsx`（`App` 函数体内）

- [ ] **Step 3.1: 添加状态 hook**

在 `App` 函数体里，在 `const [hostSettingsOpen, setHostSettingsOpen] = useState(false);` 之后插入：

```tsx
const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
const [myProfileOpen, setMyProfileOpen] = useState(false);
const [requestsDrawerOpen, setRequestsDrawerOpen] = useState(false);
const [settlementModalOpen, setSettlementModalOpen] = useState(false);
const [raisePanelOpen, setRaisePanelOpen] = useState(false);
```

- [ ] **Step 3.2: 自动开启结算 modal**

修改现有 `showSettlement`：在 `setSettlement(unwrap(...))` 之后追加 `setSettlementModalOpen(true);`。

完整新版本：

```tsx
async function showSettlement() {
  if (!room) return;
  setSettlement(unwrap(await emitWithAck("room:settlement", { code: room.code })));
  setSettlementModalOpen(true);
}
```

- [ ] **Step 3.3: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3.4: commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): add modal/drawer/raise-panel toggle state"
```

---

## 任务 4：重写 room-mode 渲染骨架

**Files:**
- Modify: `src/App.tsx`（`room` 分支整体重写）

> **关键**：保留 `!room` 分支不变。仅重写 `room` 分支内 `<section className="table-layout">…</section>` 这一段（第 354 行起）。同时拆掉 `<aside className="side-panel">…</aside>`（右侧栏整体移除，内容已迁移到 Modal）。

- [ ] **Step 4.1: 替换 room 分支**

将 `App.tsx` 中以下整段：

```tsx
) : (
  <section className="table-layout">
    <article className="table-panel">
      ...
    </article>

    <aside className="side-panel">
      ...
    </aside>
  </section>
)}
```

替换为：

```tsx
) : (
  <section className="table-layout">
    <article className="table-panel">
      <div className="room-header">
        <div className="room-header-info">
          <h2>房间 #{room.code}</h2>
          <p>
            盲注 {room.config.smallBlind}/{room.config.bigBlind} ·{" "}
            {room.config.straddleEnabled ? "支持 Straddle" : "不支持 Straddle"} · 玩家 {room.players.length}/9
          </p>
        </div>
        <div className="room-header-actions">
          {isMyTurn ? (
            <span className="my-turn-pill">
              <strong>轮到你</strong>
              {actionSecondsLeft !== null ? <span>{actionSecondsLeft}s</span> : null}
            </span>
          ) : null}
          {isHost ? (
            <button className="ghost-button" onClick={() => setHostSettingsOpen((open) => !open)}>
              房主设置
            </button>
          ) : null}
          <button
            className={`ghost-button ${pendingTopUpRequests.length > 0 ? "has-unread" : ""}`}
            onClick={() => setRequestsDrawerOpen(true)}
            aria-label="补码申请"
          >
            消息
          </button>
          <button className="ghost-button me-button" onClick={() => setMyProfileOpen(true)}>
            <span className="player-icon-mini">{(session?.nickname ?? "我").trim().slice(0, 1).toUpperCase()}</span>
            <span className={`online-dot ${session ? "" : "offline"}`} />
          </button>
          <button onClick={() => leaveRoom().catch(showError)}>退出</button>
        </div>
      </div>

      {isHost && hostSettingsOpen ? (
        <div className="host-settings-popover">
          <button className="primary" onClick={() => startHand().catch(showError)}>
            {room.players.filter((player) => player.online).length < 2 ? "人数不够，至少 2 人" : "开始下一局 / 发牌"}
          </button>
          <div className="inline-form">
            <input placeholder="新密码，留空清除" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} />
            <button onClick={() => setPassword().catch(showError)}>设置密码</button>
          </div>
          <button onClick={() => showSettlement().catch(showError)}>结算</button>
          <button className="danger" onClick={() => dismissRoom().catch(showError)}>
            解散房间
          </button>
        </div>
      ) : null}

      <div className="poker-table">
        <div className="community">
          <p>{room.game?.street ?? "waiting"}</p>
          {room.game?.actorId && room.game.actorId !== session?.id ? (
            <p className="timer">
              {room.players.find((player) => player.sessionId === room.game?.actorId)?.nickname ?? "玩家"} 决策中
              {actionSecondsLeft !== null ? ` · ${actionSecondsLeft}s` : ""}
            </p>
          ) : null}
          <div className="cards">
            {(room.game?.communityCards ?? []).map((card, index) => (
              <CardView card={card} key={`${formatCard(card)}-${index}`} />
            ))}
          </div>
          <strong>底池 {pot}</strong>
        </div>

        <div className="seats">
          {tablePlayers
            .filter((player) => player.sessionId !== session?.id)
            .map((player, index) => {
              const gamePlayer = room.game?.players.find((item) => item.id === player.sessionId);
              return (
                <button
                  type="button"
                  className={`seat seat-${index + 1} ${room.game?.actorId === player.sessionId ? "acting" : ""}`}
                  key={player.sessionId}
                  onClick={() => setActivePlayerId(player.sessionId)}
                >
                  <div className="seat-row">
                    <span className="seat-name">{player.nickname}</span>
                    <span className={`online-dot ${player.online ? "" : "offline"}`} />
                  </div>
                  <span className="seat-chips">筹码 {player.chips}</span>
                  {room.game?.actorId === player.sessionId && actionSecondsLeft !== null ? (
                    <span className="seat-timer">{actionSecondsLeft}s</span>
                  ) : null}
                  {gamePlayer?.status === "folded" ? <span className="seat-status">已弃牌</span> : null}
                </button>
              );
            })}
        </div>

        {(privateState?.holeCards.length ?? 0) > 0 ? (
          <div className="my-hand-floating">
            <div className="cards">
              {privateState!.holeCards.map((card, index) => (
                <CardView card={card} key={`${formatCard(card)}-${index}`} />
              ))}
            </div>
            {privateState && room.game && room.game.actorId === session?.id && room.game.street !== "straddleDecision" ? (
              <ActionButtons
                legalActions={privateState.legalActions}
                raisePanelOpen={raisePanelOpen}
                onToggleRaise={() => setRaisePanelOpen((open) => !open)}
                onAct={(action) => act(action).catch(showError)}
              />
            ) : null}
            {room.game?.street === "straddleDecision" && room.game.actorId === session?.id ? (
              <div className="action-stack">
                <button className="primary" onClick={() => chooseStraddle(true).catch(showError)}>
                  Straddle {room.config.bigBlind * 2}
                </button>
                <button onClick={() => chooseStraddle(false).catch(showError)}>不 Straddle</button>
              </div>
            ) : null}
            {raisePanelOpen && privateState && room.game && room.game.actorId === session?.id ? (
              <RaiseSubPanel
                bigBlind={room.config.bigBlind}
                legalActions={privateState.legalActions}
                betAmount={betAmount}
                setBetAmount={setBetAmount}
                onSubmit={(action) => {
                  act(action).catch(showError);
                  setRaisePanelOpen(false);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="self-anchor">
        <span className="seat-name">{session?.nickname ?? "我"}</span>
        <span className="seat-chips">筹码 {currentPlayer?.chips ?? 0}</span>
        <span className={`online-dot ${session ? "" : "offline"}`} />
      </div>
    </article>
  </section>
)}
```

注意 `ActionButtons` 和 `RaiseSubPanel` 在任务 5 实现，本任务先让它们以最简空函数存在以让 typecheck 通过：在 `function CardView` 之前先放占位：

```tsx
function ActionButtons(_props: {
  legalActions: LegalActions;
  raisePanelOpen: boolean;
  onToggleRaise: () => void;
  onAct: (action: ActionInput) => void;
}) {
  return null;
}

function RaiseSubPanel(_props: {
  bigBlind: number;
  legalActions: LegalActions;
  betAmount: string;
  setBetAmount: (value: string) => void;
  onSubmit: (action: ActionInput) => void;
}) {
  return null;
}
```

- [ ] **Step 4.2: 渲染 Modal/Drawer**

在 `{handToast ? <div className="toast">{handToast}</div> : null}` 之后、`</main>` 之前，插入：

```tsx
{activePlayerId
  ? (() => {
      const target = room?.players.find((p) => p.sessionId === activePlayerId);
      if (!target) return null;
      const gamePlayer = room?.game?.players.find((p) => p.id === activePlayerId);
      return (
        <PlayerDetailModal
          player={target}
          gamePlayer={gamePlayer}
          isHost={room?.hostSessionId === target.sessionId}
          onClose={() => setActivePlayerId(null)}
        />
      );
    })()
  : null}

{myProfileOpen && room ? (
  <MyProfileModal
    nickname={nickname}
    onNicknameChange={setNickname}
    onNicknameSave={() => saveNickname().catch(showError)}
    chips={currentPlayer?.chips ?? 0}
    topUp={Math.max(0, (currentPlayer?.totalInvested ?? 1000) - 1000)}
    topUpAmount={topUpAmount}
    onTopUpAmountChange={setTopUpAmount}
    onRequestTopUp={() => requestTopUp().catch(showError)}
    canRequestTopUp={canRequestTopUp}
    onClose={() => setMyProfileOpen(false)}
  />
) : null}

{requestsDrawerOpen && room ? (
  <TopUpRequestsDrawer
    requests={room.topUpRequests}
    isHost={isHost}
    canApprove={canRequestTopUp}
    findNicknameById={(sessionId) => room.players.find((p) => p.sessionId === sessionId)?.nickname ?? sessionId}
    onApprove={(requestId) => approveTopUp(requestId).catch(showError)}
    onClose={() => setRequestsDrawerOpen(false)}
  />
) : null}

{settlementModalOpen && settlement ? (
  <SettlementModal settlement={settlement} onClose={() => setSettlementModalOpen(false)} />
) : null}
```

- [ ] **Step 4.3: 删除旧的 my-turn-banner**

`isMyTurn` 横幅已迁到顶条。删除 `App.tsx` 中以下整段：

```tsx
{isMyTurn ? (
  <div className="my-turn-banner">
    <strong>轮到你决策</strong>
    {actionSecondsLeft !== null ? <span>{actionSecondsLeft}s</span> : null}
  </div>
) : null}
```

- [ ] **Step 4.4: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 4.5: 启 dev server 视觉冒烟**

Run: `npm run dev`
打开浏览器并切换横屏 940×420 视口，确认：
- 进房后顶条上有「房主设置 / 消息 / 我 / 退出」入口
- 牌桌占满主区
- 自己锚点出现在桌底外
- Modal/Drawer 可点开关
- ActionButtons / RaiseSubPanel 暂时为空（占位）

按 Ctrl-C 关闭 dev server。

- [ ] **Step 4.6: commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): rewrite room mode skeleton; remove side panel; add modals"
```

---

## 任务 5：实现 ActionButtons 与 RaiseSubPanel

**Files:**
- Modify: `src/App.tsx`（替换占位实现）

- [ ] **Step 5.1: 实现 ActionButtons**

替换 `ActionButtons` 占位为：

```tsx
function ActionButtons({
  legalActions,
  raisePanelOpen,
  onToggleRaise,
  onAct,
}: {
  legalActions: LegalActions;
  raisePanelOpen: boolean;
  onToggleRaise: () => void;
  onAct: (action: ActionInput) => void;
}) {
  const showCallSlot = legalActions.canCall || legalActions.canCheck;
  const showRaiseSlot = legalActions.canBet || legalActions.canRaise;

  return (
    <div className="action-stack">
      {legalActions.canFold ? (
        <button className="action-btn fold" onClick={() => onAct({ type: "fold" })}>
          弃牌
        </button>
      ) : null}
      {showCallSlot ? (
        legalActions.canCall ? (
          <button className="action-btn call" onClick={() => onAct({ type: "call" })}>
            跟注 {legalActions.callAmount}
          </button>
        ) : (
          <button className="action-btn check" onClick={() => onAct({ type: "check" })}>
            过牌
          </button>
        )
      ) : null}
      {showRaiseSlot ? (
        <button className={`action-btn raise ${raisePanelOpen ? "active" : ""}`} onClick={onToggleRaise}>
          {legalActions.canRaise ? "加注" : "下注"}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5.2: 实现 RaiseSubPanel**

替换 `RaiseSubPanel` 占位为：

```tsx
function RaiseSubPanel({
  bigBlind,
  legalActions,
  betAmount,
  setBetAmount,
  onSubmit,
}: {
  bigBlind: number;
  legalActions: LegalActions;
  betAmount: string;
  setBetAmount: (value: string) => void;
  onSubmit: (action: ActionInput) => void;
}) {
  const min = legalActions.minAmount;
  const max = legalActions.maxAmount;

  useEffect(() => {
    if (betAmount === "") {
      setBetAmount(String(min));
    }
  }, [betAmount, min, setBetAmount]);

  const numeric = Number(betAmount);
  const valid = Number.isInteger(numeric) && numeric >= min && numeric <= max;

  function adjust(delta: number) {
    const current = Number.isFinite(numeric) ? numeric : min;
    const next = Math.min(max, Math.max(min, current + delta));
    setBetAmount(String(next));
  }

  function submit() {
    if (!valid) return;
    if (legalActions.canRaise) {
      onSubmit({ type: "raise", amount: numeric });
    } else if (legalActions.canBet) {
      onSubmit({ type: "bet", amount: numeric });
    }
  }

  return (
    <div className="raise-subpanel">
      <button className="step-btn" disabled={numeric - bigBlind < min} onClick={() => adjust(-bigBlind)} aria-label="减少">−</button>
      <input
        type="number"
        className="raise-input"
        value={betAmount}
        min={min}
        max={max}
        onChange={(event) => setBetAmount(event.target.value)}
      />
      <button className="step-btn" disabled={numeric + bigBlind > max} onClick={() => adjust(bigBlind)} aria-label="增加">+</button>
      {legalActions.canAllIn ? (
        <button className="all-in-btn" onClick={() => setBetAmount(String(max))}>All-in</button>
      ) : null}
      <button className="confirm-btn" disabled={!valid} onClick={submit}>
        {legalActions.canRaise ? `加注到 ${valid ? numeric : "?"}` : `下注 ${valid ? numeric : "?"}`}
      </button>
    </div>
  );
}
```

- [ ] **Step 5.3: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 5.4: commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): implement action buttons and raise sub-panel"
```

---

## 任务 6：横屏 media query 样式

**Files:**
- Modify: `src/styles.css`（修改并扩展 `@media (max-width: 940px) and (orientation: landscape)` 块）

- [ ] **Step 6.1: 在通用规则区域新增非媒体查询样式**

在 `src/styles.css` 文件末尾追加（在任务 1 写的 Modal/Drawer 样式之后）：

```css
/* === Action stack & raise sub-panel (shared) === */
.action-stack {
  display: grid;
  gap: 4px;
  align-content: start;
}

.action-btn {
  min-width: 64px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
}

.action-btn.fold {
  background: #d94f4f;
  color: #fff;
}

.action-btn.call,
.action-btn.check {
  background: rgba(247, 242, 223, 0.92);
  color: #09150e;
}

.action-btn.raise {
  background: #f1c15d;
  color: #09150e;
}

.action-btn.raise.active {
  outline: 2px solid #5df19a;
}

.raise-subpanel {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(7, 19, 13, 0.85);
  border: 1px solid rgba(247, 242, 223, 0.18);
}

.raise-subpanel .step-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  color: #f7f2df;
  font-size: 16px;
}

.raise-subpanel .raise-input {
  width: 64px;
  min-height: auto;
  padding: 4px 6px;
  font-size: 12px;
  text-align: center;
}

.raise-subpanel .all-in-btn {
  padding: 4px 8px;
  font-size: 11px;
  background: rgba(247, 242, 223, 0.18);
  color: #f7f2df;
}

.raise-subpanel .confirm-btn {
  padding: 4px 10px;
  font-size: 12px;
}

/* === Self anchor (horizontal landscape only — see media query) === */
.self-anchor {
  display: none;
}

/* === My turn pill === */
.my-turn-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f1c15d, #5df19a);
  color: #09150e;
  font-weight: 900;
  font-size: 12px;
}

.player-icon-mini {
  display: inline-grid;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  place-items: center;
  border-radius: 999px;
  background: linear-gradient(135deg, #f1c15d, #5df19a);
  color: #092015;
  font-size: 11px;
  font-weight: 900;
}

.me-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.my-hand-floating {
  display: none;
}

.seat-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.seat-status {
  font-size: 10px;
  color: rgba(247, 242, 223, 0.7);
}
```

- [ ] **Step 6.2: 在横屏 media query 内重写关键样式**

定位到 `@media (max-width: 940px) and (orientation: landscape) {` 块（第 488 行起）。在该块的最后一个 `}` 前追加（不删除原有规则，但新增的会覆盖：旧的 `.room-mode .my-hand` `.room-mode .action-panel` `.room-mode .bet-box` 等大部分会因 DOM 改变而失效，留着不影响）：

```css
  /* landscape mobile: horizontal full-width layout */
  .room-mode .table-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .room-mode .side-panel {
    display: none;
  }

  .room-mode .table-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100dvh;
    padding: 4px 8px 0;
  }

  .room-mode .room-header {
    align-items: center;
    flex-direction: row;
    gap: 8px;
    padding: 4px 0;
  }

  .room-mode .room-header h2 {
    margin: 0;
    font-size: 14px;
  }

  .room-mode .room-header p {
    margin: 0;
    font-size: 11px;
  }

  .room-mode .room-header-info {
    flex: 1;
    min-width: 0;
  }

  .room-mode .room-header-actions {
    flex-wrap: nowrap;
  }

  .room-mode .ghost-button {
    padding: 4px 8px;
    font-size: 11px;
  }

  .room-mode .my-turn-pill {
    font-size: 11px;
    padding: 3px 8px;
  }

  .room-mode .poker-table {
    position: relative;
    height: 100%;
    min-height: 0;
    margin: 4px 0 2px;
    border-radius: 50% / 50%;
    border-width: 6px;
  }

  .room-mode .seats {
    inset: 4px;
  }

  .room-mode .seat {
    width: 96px;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 4px 6px;
    border-radius: 10px;
    background: rgba(7, 19, 13, 0.86);
    cursor: pointer;
  }

  .room-mode .seat-name {
    display: block;
    max-width: 76px;
    overflow: hidden;
    color: #f7f2df;
    font-weight: 700;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .room-mode .seat-chips {
    color: rgba(247, 242, 223, 0.78);
    font-size: 10px;
  }

  .room-mode .seat-1 { top: 2%; left: 50%; transform: translateX(-50%); }
  .room-mode .seat-2 { top: 8%; right: 4%; }
  .room-mode .seat-3 { top: 38%; right: 0; }
  .room-mode .seat-4 { top: 8%; left: 4%; }
  .room-mode .seat-5 { top: 38%; left: 0; }
  .room-mode .seat-6,
  .room-mode .seat-7,
  .room-mode .seat-8 { display: none; }

  .room-mode .my-hand-floating {
    position: absolute;
    bottom: 8px;
    left: 50%;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    transform: translateX(-50%);
  }

  .room-mode .my-hand-floating .cards {
    min-height: 0;
  }

  .room-mode .self-anchor {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 4px 8px;
    color: #f7f2df;
    font-size: 12px;
  }

  .room-mode .community {
    max-width: 38%;
    padding: 6px;
    font-size: 11px;
  }
```

> **注意**：`seat-6/7/8` 在横屏被隐藏因为座位 1–5 已覆盖 5 个其他玩家；横屏移动端布局以 5 人桌为主要场景；后续如需 8 人桌再扩展。

- [ ] **Step 6.3: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6.4: 视觉冒烟**

Run: `npm run dev`
横屏 940×420 视口下：
- 顶条紧凑、各按钮可见
- 椭圆桌占满主体
- 其他玩家座位卡片仅显示昵称/筹码/绿点，可点击弹出详情 Modal
- 自己的手牌浮在桌底
- 轮到自己时手牌右侧出现弃牌/跟注/加注按钮列
- 点加注 → 右侧展开 −/输入框/+/All-in/确认子面板
- + / − 步长 = 1 BB
- 默认值 = 最小加注

Ctrl-C 关闭。

- [ ] **Step 6.5: commit**

```bash
git add src/styles.css
git commit -m "feat(ui): landscape mobile styles for new table layout"
```

---

## 任务 7：清理旧样式

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 7.1: 移除横屏 media query 中已无 DOM 引用的旧规则**

横屏 media query 块中下列规则的目标 DOM 已不存在（因 `my-hand` `action-panel` `bet-box` `side-panel` 已重构或移除），可删除以减少混淆。从 `src/styles.css` 第 488 行开始的 `@media (max-width: 940px) and (orientation: landscape) {` 块内删除：

- `.room-mode .my-hand` 与 `.room-mode .action-panel` 的样式（包括 padding/margin/h3）
- `.room-mode .my-hand h3, .room-mode .action-panel h3, .room-mode .side-panel h2, .room-mode .side-panel h3`
- `.room-mode .button-row, .room-mode .bet-box, .room-mode .inline-form`
- `.room-mode .bet-box` / `.room-mode .bet-box input`
- `.room-mode .side-panel`
- `.room-mode .room-nickname-editor, .room-mode .message-list, .room-mode .settlement`
- `.room-mode .message-list`
- `.room-mode .request-row, .room-mode .notice-row, .room-mode .settlement-row`

**保留**：`.room-mode .topbar`（隐藏）；`.room-mode .my-turn-banner`（任务 4 已删除 DOM，规则可一并删）；`.room-mode .toast`；`.room-mode button`；`.room-mode input`；`.room-mode .host-settings-popover`；`.room-mode .seat-timer`；`.room-mode .player-icon`（仍可能被旧 popover 使用）。

> **保守策略**：如果不确定某条规则是否还有用，先保留；只删上面明确列出的。

- [ ] **Step 7.2: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 7.3: 视觉回归冒烟**

Run: `npm run dev`
切回桌面视口（>940）确认大屏布局**未受影响**：
- 桌面端仍然是主桌+右侧栏布局（旧逻辑）
- 注意：右侧栏的 `<aside className="side-panel">` 已在任务 4 删除，所以**桌面端也会丢失右栏！**

> **重要回退判断**：如果用户希望桌面端保留右栏，则任务 4 应保留 `<aside>` 但仅在横屏隐藏。当前 spec 仅要求改横屏，桌面端原右栏行为应保留 → **回到任务 4 把 `<aside>` 加回去**。

- [ ] **Step 7.4: 修复桌面端右栏（如有需要）**

如果发现桌面端右栏丢失，回到 `App.tsx`，在 `</article>` 与 `</section>` 之间重新插入完整的 `<aside className="side-panel">…</aside>`（参考 git diff `git show HEAD~3:src/App.tsx`）。然后由 task 6 已添加的 `.room-mode .side-panel { display: none; }` 在横屏隐藏即可。

- [ ] **Step 7.5: commit**

```bash
git add src/styles.css src/App.tsx
git commit -m "refactor(ui): clean up unused landscape styles; preserve desktop side panel"
```

---

## 任务 8：横屏验收 & 最终回归

**Files:** 无

- [ ] **Step 8.1: typecheck**

Run: `npm run typecheck`

- [ ] **Step 8.2: 服务端测试**

Run: `npm test`
Expected: all pass

- [ ] **Step 8.3: 浏览器验收**

Run: `npm run dev`
打开两个标签页（A、B），分别用不同 nickname 进同一房间，分别在以下视口下验证：

**横屏 940×420**（Chrome DevTools 设备模式）：
- [ ] 顶条入口完整：房间号、盲注信息、轮到你 pill、房主设置、消息（红点）、我、退出
- [ ] 椭圆桌占满主体，公共牌+底池居中
- [ ] 其他玩家座位卡片仅显示「昵称 + 筹码 + 在线绿点」，点击弹出详情 Modal
- [ ] 自己锚点在桌外底部中央
- [ ] 手牌浮在桌底内沿
- [ ] 轮到自己时，手牌右侧出现弃牌→跟注/过牌→加注按钮列
- [ ] 不能跟注/过牌时该位置消失，但弃牌还在
- [ ] 不能加注/下注时该位置消失
- [ ] 点加注 → 子面板展开（−/输入框/+/All-in/确认）
- [ ] +/− 步长 = bigBlind
- [ ] 默认值 = legalActions.minAmount
- [ ] All-in 按钮把输入框设为 maxAmount
- [ ] 确认按钮文案动态切换"加注到 X" / "下注 X"
- [ ] 房主点结算 → 独立 SettlementModal 弹出
- [ ] 点消息 → 抽屉滑出，仅含补码申请
- [ ] 点我 → MyProfileModal 弹出，包含昵称编辑、筹码、累计补码、申请补码

**桌面端 ≥1024px**：
- [ ] 原有布局未受影响（主桌+右侧栏，右栏含原信息）

**竖屏移动端 ≤640px**：
- [ ] 原有布局未受影响

- [ ] **Step 8.4: 提交 final（如有微调）**

```bash
git status
# 如有 untracked 改动：
git add -A
git commit -m "chore(ui): polish landscape redesign per QA"
```

- [ ] **Step 8.5: 任务完成**

确认所有 commit 已落库：

```bash
git log --oneline -10
```

---

## 自审清单（plan 作者填写）

- [x] Spec §3 顶条 → 任务 4 step 4.1 实现
- [x] Spec §5.1 座位卡片瘦身（无头像 / 仅昵称+筹码+绿点）→ 任务 4 step 4.1 + 任务 6 step 6.2
- [x] Spec §5.2 自己锚点 → 任务 4 + 任务 6
- [x] Spec §5.3 手牌浮动 → 任务 4 + 任务 6
- [x] Spec §6 操作按钮规则 → 任务 5 step 5.1
- [x] Spec §7 加注子面板 → 任务 5 step 5.2
- [x] Spec §8 五个弹层 → 任务 2 + 任务 4 step 4.2
- [x] Spec §8.1 toast → 现有 `notifications` toast 已存在，不变
- [x] Spec §9 不动桌面/竖屏 → 任务 7 step 7.4 修复桌面端右栏

**类型一致性**：`ActionInput`、`LegalActions`、`PublicRoomState`、`PrivatePlayerState`、`SettlementResult` 全部沿用现有定义；新增 `GamePlayer` type alias。

**已知简化**：横屏只显示 5 个其他玩家座位（seat-1..5），seat-6/7/8 隐藏。如果实际有 8 人在桌该做扩展，但符合"先解决横屏拥挤"的优先级。
