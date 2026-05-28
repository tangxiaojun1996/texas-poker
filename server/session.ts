import { randomUUID } from "node:crypto";

export type Session = {
  id: string;
  nickname: string;
  createdAt: number;
  lastSeenAt: number;
};

const sessions = new Map<string, Session>();

export function getOrCreateSession(cookieHeader: string | undefined, now = Date.now()): {
  session: Session;
  setCookie?: string;
} {
  const existingId = parseSessionId(cookieHeader);
  const existing = existingId ? sessions.get(existingId) : undefined;

  if (existing) {
    existing.lastSeenAt = now;
    return { session: existing };
  }

  const id = randomUUID();
  const session: Session = {
    id,
    nickname: `玩家${id.slice(0, 4)}`,
    createdAt: now,
    lastSeenAt: now,
  };
  sessions.set(id, session);

  return {
    session,
    setCookie: `texas_poker_session=${id}; Path=/; HttpOnly; SameSite=Lax`,
  };
}

export function updateNickname(sessionId: string, nickname: string): Session {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const trimmed = nickname.trim();
  if (trimmed.length < 1 || trimmed.length > 20) {
    throw new Error("昵称长度需要在 1 到 20 个字符之间");
  }

  session.nickname = trimmed;
  return session;
}

export function touchSession(sessionId: string, now = Date.now()): Session | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastSeenAt = now;
  }
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function resetSessionsForTests(): void {
  sessions.clear();
}

function parseSessionId(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("texas_poker_session="))
    ?.split("=")[1];
}
