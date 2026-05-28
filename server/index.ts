import express from "express";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const app = express();
const server = createServer(app);

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

server.listen(port, () => {
  console.log(`Texas poker server listening on http://localhost:${port}`);
});
