import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { broadcastLobby, emitRoom, registerSocketHandlers } from "./socketHandlers";
import { getOrCreateSession } from "./session";
import { sweepOfflinePlayers } from "./roomStore";

const port = Number(process.env.PORT ?? 3000);
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use((request, response, next) => {
  const { setCookie } = getOrCreateSession(request.headers.cookie);
  if (setCookie) {
    response.setHeader("Set-Cookie", setCookie);
  }
  next();
});

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

registerSocketHandlers(io);
setInterval(() => {
  const result = sweepOfflinePlayers(Date.now());
  for (const room of result.changedRooms) {
    emitRoom(io, room);
  }
  if (result.lobbyChanged || result.changedRooms.length > 0) {
    broadcastLobby(io);
  }
}, 1_000);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(rootDir, "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(port, () => {
  console.log(`Texas poker server listening on http://localhost:${port}`);
});
