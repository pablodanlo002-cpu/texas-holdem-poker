import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupPokerServer } from "./poker/setup.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

// Serveur HTTP simple
const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Poker WebSocket Server Running");
});

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

console.log("Initialisation du serveur poker...");
setupPokerServer(io);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Serveur Poker WebSocket démarré sur le port ${PORT}`);
  console.log(`CORS autorisé pour toutes les origines`);
});
