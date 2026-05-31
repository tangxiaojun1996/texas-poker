import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatCard, type Card } from "../shared/cards";
import { emitWithAck, socket } from "./client/socket";
import type {
  Ack,
  LobbyRoomSummary,
  PrivatePlayerState,
  PublicRoomState,
  SessionState,
  SettlementResult,
} from "./client/types";
import type { LegalActions } from "../shared/pokerTypes";

type CreateRoomForm = {
  smallBlind: number;
  bigBlind: number;
  straddleEnabled: boolean;
  password: string;
};

type ActionInput = {
  type: string;
  amount?: number;
};

type GamePlayer = NonNullable<PublicRoomState["game"]>["players"][number];

const initialCreateForm: CreateRoomForm = {
  smallBlind: 5,
  bigBlind: 10,
  straddleEnabled: true,
  password: "",
};
const nicknameStorageKey = "texas-poker:nickname";

export function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [nickname, setNickname] = useState("");
  const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [privateState, setPrivateState] = useState<PrivatePlayerState | null>(null);
  const [createForm, setCreateForm] = useState<CreateRoomForm>(initialCreateForm);
  const [joinPassword, setJoinPassword] = useState<Record<string, string>>({});
  const [betAmount, setBetAmount] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("200");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [message, setMessage] = useState("连接中...");
  const [now, setNow] = useState(Date.now());
  const [handToast, setHandToast] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [hostSettingsOpen, setHostSettingsOpen] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [myProfileOpen, setMyProfileOpen] = useState(false);
  const [requestsDrawerOpen, setRequestsDrawerOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [raisePanelOpen, setRaisePanelOpen] = useState(false);
  const lastHandToastKeyRef = useRef<string | null>(null);
  const nicknameAutoSyncedRef = useRef(false);

  const isHost = Boolean(session && room?.hostSessionId === session.id);
  const currentPlayer = room?.players.find((player) => player.sessionId === session?.id);
  const isMyTurn = Boolean(room?.game?.actorId && room.game.actorId === session?.id);
  const pot = room?.game?.pot ?? 0;
  const actionSecondsLeft = room?.game?.actionTimeoutAt
    ? Math.max(0, Math.ceil((room.game.actionTimeoutAt - now) / 1_000))
    : null;
  const canRequestTopUp = !room?.game || room.game.street === "handComplete" || room.game.street === "waiting";
  const pendingTopUpRequests = room?.topUpRequests.filter((request) => request.status === "pending") ?? [];
  const submittedBetAmount = Number(betAmount);
  const isSubmittedBetValid = Boolean(
    privateState &&
      Number.isInteger(submittedBetAmount) &&
      submittedBetAmount >= privateState.legalActions.minAmount &&
      submittedBetAmount <= privateState.legalActions.maxAmount,
  );

  useEffect(() => {
    const onSession = (value: SessionState) => {
      const localNickname = readStoredNickname();
      const preferredNickname = localNickname ?? value.nickname;
      setSession({ ...value, nickname: preferredNickname });
      setNickname(preferredNickname);
      setMessage("已连接");

      if (localNickname && localNickname !== value.nickname && !nicknameAutoSyncedRef.current) {
        nicknameAutoSyncedRef.current = true;
        updateNickname(localNickname).catch(showError);
      }
    };
    const onRooms = (value: LobbyRoomSummary[]) => setRooms(value);
    const onRoom = (value: PublicRoomState | undefined) => {
      setRoom(value ?? null);
      if (!value) {
        setPrivateState(null);
        setSettlement(null);
      }
    };
    const onNotification = (value: string) => {
      setMessage(value);
      setNotifications((items) => [value, ...items].slice(0, 8));
    };

    socket.on("session:state", onSession);
    socket.on("lobby:roomsUpdated", onRooms);
    socket.on("room:state", onRoom);
    socket.on("notification", onNotification);
    emitWithAck<undefined, Ack<LobbyRoomSummary[]>>("lobby:listRooms", undefined)
      .then(unwrap)
      .then(setRooms)
      .catch(showError);

    return () => {
      socket.off("session:state", onSession);
      socket.off("lobby:roomsUpdated", onRooms);
      socket.off("room:state", onRoom);
      socket.off("notification", onNotification);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    const event = `game:privateState:${session.id}`;
    const onPrivateState = (value: PrivatePlayerState) => setPrivateState(value);
    socket.on(event, onPrivateState);
    return () => {
      socket.off(event, onPrivateState);
    };
  }, [session]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      socket.emit("heartbeat");
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!room?.game?.handResult || room.game.street !== "handComplete") {
      return;
    }

    const toastKey = `${room.code}:${room.game.handResult.reason}:${room.game.handResult.winners.join(",")}:${Object.entries(
      room.game.handResult.payouts,
    )
      .map(([playerId, payout]) => `${playerId}:${payout}`)
      .join("|")}`;

    if (lastHandToastKeyRef.current === toastKey) {
      return;
    }

    lastHandToastKeyRef.current = toastKey;
    setHandToast(buildHandToast(room));
  }, [room]);

  useEffect(() => {
    if (!handToast) {
      return;
    }
    const timer = window.setTimeout(() => setHandToast(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [handToast]);

  const tablePlayers = useMemo(() => room?.players ?? [], [room]);

  async function saveNickname() {
    await updateNickname(nickname);
  }

  async function updateNickname(nextNickname: string) {
    const result = await emitWithAck<{ nickname: string }, Ack<SessionState>>("session:updateNickname", {
      nickname: nextNickname,
    });
    const updated = unwrap(result);
    setSession(updated);
    setNickname(updated.nickname);
    localStorage.setItem(nicknameStorageKey, updated.nickname);
    setMessage("昵称已更新");
  }

  async function createRoom() {
    const result = await emitWithAck<CreateRoomForm, Ack<PublicRoomState>>("room:create", createForm);
    setRoom(unwrap(result));
    setSettlement(null);
  }

  async function joinRoom(code: string) {
    const result = await emitWithAck<{ code: string; password?: string }, Ack<PublicRoomState>>("room:join", {
      code,
      password: joinPassword[code],
    });
    setRoom(unwrap(result));
    setSettlement(null);
  }

  async function leaveRoom() {
    if (!room) return;
    await emitWithAck<{ code: string }, Ack<boolean>>("room:leave", { code: room.code }).then(unwrap);
    setRoom(null);
    setPrivateState(null);
  }

  async function startHand() {
    if (!room) return;
    setRoom(unwrap(await emitWithAck<{ code: string }, Ack<PublicRoomState>>("room:startHand", { code: room.code })));
  }

  async function chooseStraddle(enabled: boolean) {
    if (!room) return;
    setRoom(
      unwrap(
        await emitWithAck<{ code: string; enabled: boolean }, Ack<PublicRoomState>>("game:chooseStraddle", {
          code: room.code,
          enabled,
        }),
      ),
    );
  }

  async function act(action: ActionInput) {
    if (!room) return;
    setRoom(unwrap(await emitWithAck("game:act", { code: room.code, action })));
    setBetAmount("");
  }

  async function requestTopUp() {
    if (!room) return;
    const amount = Number(topUpAmount);
    setRoom(unwrap(await emitWithAck("room:requestTopUp", { code: room.code, amount })));
  }

  async function approveTopUp(requestId: string) {
    if (!room) return;
    setRoom(unwrap(await emitWithAck("room:approveTopUp", { code: room.code, requestId })));
  }

  async function setPassword() {
    if (!room) return;
    setRoom(unwrap(await emitWithAck("room:setPassword", { code: room.code, password: passwordDraft })));
  }

  async function dismissRoom() {
    if (!room) return;
    unwrap(await emitWithAck<{ code: string }, Ack<boolean>>("room:dismiss", { code: room.code }));
    setRoom(null);
  }

  async function showSettlement() {
    if (!room) return;
    setSettlement(unwrap(await emitWithAck("room:settlement", { code: room.code })));
    setSettlementModalOpen(true);
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className={`app-shell ${room ? "room-mode" : ""}`} onClick={() => message && setMessage(message)}>
      <header className="topbar">
        <div className="brand-placeholder" aria-hidden="true" />
        <div className="session-card">
          <span>{message}</span>
          <div className="inline-form">
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="昵称" />
            <button onClick={() => saveNickname().catch(showError)}>保存昵称</button>
          </div>
        </div>
      </header>

      {isMyTurn ? (
        <div className="my-turn-banner">
          <strong>轮到你决策</strong>
          {actionSecondsLeft !== null ? <span>{actionSecondsLeft}s</span> : null}
        </div>
      ) : null}

      {!room ? (
        <section className="grid-layout">
          <article className="panel">
            <h2>创建房间</h2>
            <label>
              小盲
              <input
                type="number"
                min={1}
                value={createForm.smallBlind}
                onChange={(event) => setCreateForm({ ...createForm, smallBlind: Number(event.target.value) })}
              />
            </label>
            <label>
              大盲
              <input
                type="number"
                min={2}
                value={createForm.bigBlind}
                onChange={(event) => setCreateForm({ ...createForm, bigBlind: Number(event.target.value) })}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createForm.straddleEnabled}
                onChange={(event) => setCreateForm({ ...createForm, straddleEnabled: event.target.checked })}
              />
              支持 UTG Straddle
            </label>
            <label>
              房间密码（可空）
              <input
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              />
            </label>
            <button className="primary" onClick={() => createRoom().catch(showError)}>
              创建房间
            </button>
          </article>

          <article className="panel">
            <h2>游戏大厅</h2>
            <div className="room-list">
              {rooms.length === 0 ? <p className="muted">暂无房间，先创建一个。</p> : null}
              {rooms.map((item) => (
                <div className="room-row" key={item.code}>
                  <div>
                    <strong>#{item.code}</strong>
                    <p>
                      {item.smallBlind}/{item.bigBlind} · {item.straddleEnabled ? "Straddle" : "无 Straddle"} ·{" "}
                      {item.hasPassword ? "有密码" : "无密码"} · {item.status}
                    </p>
                    <small>
                      房主 {item.hostNickname} · {item.playerCount} 人
                    </small>
                  </div>
                  <div className="join-box">
                    {item.hasPassword ? (
                      <input
                        placeholder="密码"
                        value={joinPassword[item.code] ?? ""}
                        onChange={(event) => setJoinPassword({ ...joinPassword, [item.code]: event.target.value })}
                      />
                    ) : null}
                    <button disabled={item.playerCount >= 9} onClick={() => joinRoom(item.code).catch(showError)}>
                      {item.playerCount >= 9 ? "已满" : "加入"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : (
        <section className="table-layout">
          <article className="table-panel">
            <div className="room-header">
              <div>
                <h2>房间 #{room.code}</h2>
                <p>
                  盲注 {room.config.smallBlind}/{room.config.bigBlind} ·{" "}
                  {room.config.straddleEnabled ? "支持 Straddle" : "不支持 Straddle"} · 玩家 {room.players.length}/9
                </p>
              </div>
              <div className="room-header-actions">
                {isHost ? (
                  <button className="ghost-button" onClick={() => setHostSettingsOpen((open) => !open)}>
                    房主设置
                  </button>
                ) : null}
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
                {room.game?.actorId ? (
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
                {tablePlayers.map((player, index) => {
                  const gamePlayer = room.game?.players.find((item) => item.id === player.sessionId);
                  return (
                    <div
                      className={`seat seat-${index + 1} ${room.game?.actorId === player.sessionId ? "acting" : ""}`}
                      key={player.sessionId}
                    >
                      <PlayerIcon name={player.nickname} />
                      <div>
                        <strong>
                          {player.nickname}
                          {room.hostSessionId === player.sessionId ? " · 房主" : ""}
                        </strong>
                        {room.game?.actorId === player.sessionId && actionSecondsLeft !== null ? (
                          <span className="seat-timer">{actionSecondsLeft}s</span>
                        ) : null}
                        <span>{player.online ? "在线" : "离线"}</span>
                        <span>筹码 {player.chips}</span>
                        <span>已补 {Math.max(0, player.totalInvested - 1000)}</span>
                        <span>{gamePlayer?.status ?? "等待"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="my-hand">
              <h3>我的手牌</h3>
              <div className="cards">
                {(privateState?.holeCards ?? []).map((card, index) => (
                  <CardView card={card} key={`${formatCard(card)}-${index}`} />
                ))}
                {(privateState?.holeCards.length ?? 0) === 0 ? <span className="muted">等待发牌</span> : null}
              </div>
            </div>

            {room.game?.street === "straddleDecision" && room.game.actorId === session?.id ? (
              <div className="action-panel">
                <h3>是否 Straddle？</h3>
                <button onClick={() => chooseStraddle(true).catch(showError)}>Straddle {room.config.bigBlind * 2}</button>
                <button onClick={() => chooseStraddle(false).catch(showError)}>不 Straddle</button>
              </div>
            ) : null}

            {privateState && room.game && room.game.actorId === session?.id && room.game.street !== "straddleDecision" ? (
              <div className="action-panel">
                <h3>轮到你行动</h3>
                <div className="button-row">
                  {privateState.legalActions.canFold ? <button onClick={() => act({ type: "fold" }).catch(showError)}>弃牌</button> : null}
                  {privateState.legalActions.canCheck ? <button onClick={() => act({ type: "check" }).catch(showError)}>过牌</button> : null}
                  {privateState.legalActions.canCall ? (
                    <button onClick={() => act({ type: "call" }).catch(showError)}>跟注 {privateState.legalActions.callAmount}</button>
                  ) : null}
                  {privateState.legalActions.canAllIn ? <button onClick={() => act({ type: "all-in" }).catch(showError)}>All-in</button> : null}
                </div>
                <div className="bet-box">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(event) => setBetAmount(event.target.value)}
                    placeholder={`${privateState.legalActions.minAmount} - ${privateState.legalActions.maxAmount}`}
                  />
                  {[1 / 3, 1 / 2, 2 / 3, 1].map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setBetAmount(String(clampWager(Math.floor(pot * ratio), privateState.legalActions)))}
                    >
                      底池 {ratio === 1 ? "1" : ratio === 1 / 3 ? "1/3" : ratio === 1 / 2 ? "1/2" : "2/3"}
                    </button>
                  ))}
                  {privateState.legalActions.canBet ? (
                    <button disabled={!isSubmittedBetValid} onClick={() => act({ type: "bet", amount: submittedBetAmount }).catch(showError)}>
                      下注
                    </button>
                  ) : null}
                  {privateState.legalActions.canRaise ? (
                    <button disabled={!isSubmittedBetValid} onClick={() => act({ type: "raise", amount: submittedBetAmount }).catch(showError)}>
                      加注到
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>

          <aside className="side-panel">
            <h2>我的信息</h2>
            <div className="room-nickname-editor">
              <label>
                我的昵称
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="修改我的昵称" />
              </label>
              <button onClick={() => saveNickname().catch(showError)}>更新昵称</button>
            </div>
            <p>玩家人数：{room.players.length}/9</p>
            <p>我的筹码：{currentPlayer?.chips ?? 0}</p>
            <p>我的累计补码：{Math.max(0, (currentPlayer?.totalInvested ?? 1000) - 1000)}</p>
            <div className="inline-form">
              <input type="number" value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value)} />
              <button disabled={!canRequestTopUp} onClick={() => requestTopUp().catch(showError)}>
                {canRequestTopUp ? "申请补码" : "牌局中不可补码"}
              </button>
            </div>

            <div className="message-list">
              <h3>消息</h3>
              {pendingTopUpRequests.length === 0 && notifications.length === 0 ? <p className="muted">暂无消息</p> : null}
              {pendingTopUpRequests.map((request) => (
                <div className="request-row" key={request.id}>
                  <span>
                    {room.players.find((player) => player.sessionId === request.sessionId)?.nickname} 申请 {request.amount}
                  </span>
                  {isHost ? <button onClick={() => approveTopUp(request.id).catch(showError)}>批准</button> : null}
                </div>
              ))}
              {notifications.map((item, index) => (
                <div className="notice-row" key={`${item}-${index}`}>
                  {item}
                </div>
              ))}
            </div>

            {settlement ? (
              <div className="settlement">
                <h3>结算结果</h3>
                {settlement.players.map((player) => (
                  <div className="settlement-row" key={player.sessionId}>
                    <span>{player.nickname}</span>
                    <strong className={player.net >= 0 ? "win" : "lose"}>{player.net}</strong>
                  </div>
                ))}
                <p>合计：{settlement.totalNet}</p>
              </div>
            ) : null}
          </aside>
        </section>
      )}
      {handToast ? <div className="toast">{handToast}</div> : null}
    </main>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
  gamePlayer?: GamePlayer;
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

function CardView({ card }: { card: Card }) {
  const red = card.suit === "h" || card.suit === "d";
  return (
    <span className={`card ${red ? "red" : ""}`}>
      <span>{rankLabel(card.rank)}</span>
      <SuitIcon suit={card.suit} />
    </span>
  );
}

function PlayerIcon({ name }: { name: string }) {
  return <span className="player-icon">{name.trim().slice(0, 1).toUpperCase() || "玩"}</span>;
}

function SuitIcon({ suit }: { suit: Card["suit"] }) {
  if (suit === "h") {
    return (
      <svg className="suit-icon" viewBox="0 0 24 24" aria-label="红桃">
        <path d="M12 21s-7.8-4.9-9.6-10.1C1 6.7 3.4 3.5 7 3.5c2.1 0 3.6 1.1 5 3 1.4-1.9 2.9-3 5-3 3.6 0 6 3.2 4.6 7.4C19.8 16.1 12 21 12 21Z" />
      </svg>
    );
  }

  if (suit === "d") {
    return (
      <svg className="suit-icon" viewBox="0 0 24 24" aria-label="方块">
        <path d="M12 2 21 12 12 22 3 12 12 2Z" />
      </svg>
    );
  }

  if (suit === "s") {
    return (
      <svg className="suit-icon" viewBox="0 0 24 24" aria-label="黑桃">
        <path d="M12 2s8.2 5.8 9.3 10.4c.8 3.2-1.2 5.7-4.1 5.7-1.7 0-3.1-.8-4.1-2.2.3 2.1 1 3.5 2.2 5.1H8.7c1.2-1.6 1.9-3 2.2-5.1-1 1.4-2.4 2.2-4.1 2.2-2.9 0-4.9-2.5-4.1-5.7C3.8 7.8 12 2 12 2Z" />
      </svg>
    );
  }

  return (
    <svg className="suit-icon" viewBox="0 0 24 24" aria-label="梅花">
      <path d="M9.2 10.4A4.2 4.2 0 1 1 12 6.5a4.2 4.2 0 1 1 2.8 3.9 4.2 4.2 0 1 1-4.5 6.8c.2 1.6.8 2.8 2 4H7.8c1.2-1.2 1.8-2.4 2-4a4.2 4.2 0 1 1-.6-6.8Z" />
    </svg>
  );
}

function rankLabel(rank: Card["rank"]) {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

function buildHandToast(room: PublicRoomState) {
  const result = room.game?.handResult;
  if (!room.game || !result) {
    return "";
  }

  const winnerNames = result.winners.map((winnerId) => findNickname(room, winnerId)).join("、");
  const playerNets = room.game.players
    .map((player) => {
      const net = (result.payouts[player.id] ?? 0) - player.committedTotal;
      return `${findNickname(room, player.id)} ${net >= 0 ? "+" : ""}${net}`;
    })
    .join("，");

  return `${winnerNames} 赢了。本局输赢：${playerNets}`;
}

function findNickname(room: PublicRoomState, sessionId: string) {
  return room.players.find((player) => player.sessionId === sessionId)?.nickname ?? sessionId;
}

function clampWager(amount: number, legalActions: LegalActions) {
  return Math.min(legalActions.maxAmount, Math.max(legalActions.minAmount, amount));
}

function readStoredNickname() {
  const value = localStorage.getItem(nicknameStorageKey)?.trim();
  return value || undefined;
}

function unwrap<T>(ack: Ack<T>): T {
  if (!ack.ok) {
    throw new Error(ack.message);
  }
  return ack.data;
}
