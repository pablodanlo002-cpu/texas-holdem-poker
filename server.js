import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env.local") });

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Socket.IO pour le poker
  const io = new Server(httpServer, {
    path: "/socket.io/",
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Import et configuration du serveur poker
  const { setupPokerServer } = await import("./server/poker/setup.js");
  setupPokerServer(io);

  httpServer.listen(port, () => {
    console.log(`✓ Next.js + Poker WebSocket démarré sur http://${hostname}:${port}`);
  });
});
