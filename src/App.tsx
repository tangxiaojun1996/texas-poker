import { useEffect, useMemo, useState } from "react";
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

const initialCreateForm: CreateRoomForm = {
  smallBlind: 5,
  bigBlind: 10,
  straddleEnabled: true,
  password: "",
};

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

  const isHost = Boolean(session && room?.hostSessionId === session.id);
  const currentPlayer = room?.players.find((player) => player.sessionId === session?.id);
  const pot = room?.game?.pot ?? 0;

  useEffect(() => {
    const onSession = (value: SessionState) => {
      setSession(value);
      setNickname(value.nickname);
      setMessage("已连接");
    };
    const onRooms = (value: LobbyRoomSummary[]) => setRooms(value);
    const onRoom = (value: PublicRoomState | undefined) => {
      setRoom(value ?? null);
      if (!value) {
        setPrivateState(null);
        setSettlement(null);
      }
    };
    const onNotification = (value: string) => setMessage(value);

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

  const tablePlayers = useMemo(() => room?.players ?? [], [room]);

  async function saveNickname() {
    const result = await emitWithAck<{ nickname: string }, Ack<SessionState>>("session:updateNickname", { nickname });
    const updated = unwrap(result);
    setSession(updated);
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
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className="app-shell" onClick={() => message && setMessage(message)}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Texas Hold'em</p>
          <h1>朋友德州扑克</h1>
        </div>
        <div className="session-card">
          <span>{message}</span>
          <div className="inline-form">
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="昵称" />
            <button onClick={() => saveNickname().catch(showError)}>保存昵称</button>
          </div>
        </div>
      </header>

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
                    <button onClick={() => joinRoom(item.code).catch(showError)}>加入</button>
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
                  {room.config.straddleEnabled ? "支持 Straddle" : "不支持 Straddle"}
                </p>
              </div>
              <button onClick={() => leaveRoom().catch(showError)}>退出房间</button>
            </div>

            <div className="poker-table">
              <div className="community">
                <p>{room.game?.street ?? "waiting"}</p>
                <div className="cards">
                  {(room.game?.communityCards ?? []).map((card, index) => (
                    <CardView card={card} key={`${formatCard(card)}-${index}`} />
                  ))}
                </div>
                <strong>底池 {pot}</strong>
              </div>
              <div className="seats">
                {tablePlayers.map((player) => {
                  const gamePlayer = room.game?.players.find((item) => item.id === player.sessionId);
                  return (
                    <div
                      className={`seat ${room.game?.actorId === player.sessionId ? "acting" : ""}`}
                      key={player.sessionId}
                    >
                      <strong>
                        {player.nickname}
                        {room.hostSessionId === player.sessionId ? " · 房主" : ""}
                      </strong>
                      <span>{player.online ? "在线" : "离线"}</span>
                      <span>筹码 {player.chips}</span>
                      <span>{gamePlayer?.status ?? "等待"}</span>
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
                    <button key={ratio} onClick={() => setBetAmount(String(Math.max(1, Math.floor(pot * ratio))))}>
                      底池 {ratio === 1 ? "1" : ratio === 1 / 3 ? "1/3" : ratio === 1 / 2 ? "1/2" : "2/3"}
                    </button>
                  ))}
                  {privateState.legalActions.canBet ? (
                    <button onClick={() => act({ type: "bet", amount: Number(betAmount) }).catch(showError)}>下注</button>
                  ) : null}
                  {privateState.legalActions.canRaise ? (
                    <button onClick={() => act({ type: "raise", amount: Number(betAmount) }).catch(showError)}>加注</button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>

          <aside className="side-panel">
            <h2>房间工具</h2>
            <p>我的筹码：{currentPlayer?.chips ?? 0}</p>
            <div className="inline-form">
              <input type="number" value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value)} />
              <button onClick={() => requestTopUp().catch(showError)}>申请补码</button>
            </div>

            {isHost ? (
              <>
                <button className="primary" onClick={() => startHand().catch(showError)}>
                  开始下一局 / 发牌
                </button>
                <div className="inline-form">
                  <input placeholder="新密码，留空清除" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} />
                  <button onClick={() => setPassword().catch(showError)}>设置密码</button>
                </div>
                <button onClick={() => showSettlement().catch(showError)}>结算</button>
                <button className="danger" onClick={() => dismissRoom().catch(showError)}>
                  解散房间
                </button>
                <h3>补码申请</h3>
                {room.topUpRequests.filter((request) => request.status === "pending").length === 0 ? (
                  <p className="muted">暂无申请</p>
                ) : null}
                {room.topUpRequests
                  .filter((request) => request.status === "pending")
                  .map((request) => (
                    <div className="request-row" key={request.id}>
                      <span>
                        {room.players.find((player) => player.sessionId === request.sessionId)?.nickname} 申请 {request.amount}
                      </span>
                      <button onClick={() => approveTopUp(request.id).catch(showError)}>批准</button>
                    </div>
                  ))}
              </>
            ) : null}

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
    </main>
  );
}

function CardView({ card }: { card: Card }) {
  const red = card.suit === "h" || card.suit === "d";
  return <span className={`card ${red ? "red" : ""}`}>{formatCard(card).toUpperCase()}</span>;
}

function unwrap<T>(ack: Ack<T>): T {
  if (!ack.ok) {
    throw new Error(ack.message);
  }
  return ack.data;
}
