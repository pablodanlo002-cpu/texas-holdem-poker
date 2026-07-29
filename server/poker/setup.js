import jwt from "jsonwebtoken";
import { randomInt } from "crypto";
import { PokerTable } from "./engine.js";
import { decideBotAction, pickBotProfile } from "./bot.js";
import { findUserById, updateChips } from "../../lib/db.js";

const JWT_SECRET = process.env.JWT_SECRET;
const TURN_MS = 25000;

// Rythme de la partie
const BOT_MIN_MS = 1500;
const BOT_MAX_MS = 3600;
const STREET_MS = 1900;
const DEAL_MS = 1300;
const SHOWDOWN_MS = 7000;
const FOLD_END_MS = 3800;
const MAX_BOTS = 3;

if (!JWT_SECRET) {
  console.error("JWT_SECRET requis dans .env.local");
  process.exit(1);
}

// Niveaux de blinds
const STAKES = [
  { key: "micro", label: "Micro", smallBlind: 5, bigBlind: 10 },
  { key: "low", label: "Low", smallBlind: 10, bigBlind: 20 },
  { key: "medium", label: "Medium", smallBlind: 25, bigBlind: 50 },
  { key: "high", label: "High", smallBlind: 50, bigBlind: 100 },
  { key: "vip", label: "VIP", smallBlind: 100, bigBlind: 200 },
];

// État global des tables
const tables = new Map();
const turnTimers = new Map();
let tableCounter = 1;
let botCounter = 1;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  } while ([...tables.values()].some((t) => t.code === code));
  return code;
}

function createTable(name, opts = {}) {
  const num = tableCounter++;
  const id = `table-${num}`;
  const maxSeats = Math.min(9, Math.max(2, opts.maxSeats || 6));
  const isPrivate = Boolean(opts.isPrivate);
  const table = new PokerTable({
    id,
    name: name || `Table ${num}`,
    smallBlind: opts.smallBlind || 10,
    bigBlind: opts.bigBlind || 20,
    maxSeats,
    isPrivate,
    code: isPrivate ? generateCode() : null,
    botsEnabled: opts.botsEnabled !== false,
    ownerId: opts.ownerId ?? null,
  });
  tables.set(id, table);
  return table;
}

function tableList() {
  return [...tables.values()].filter((t) => !t.isPrivate).map((t) => t.summary());
}

function findTableByCode(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return [...tables.values()].find((t) => t.code === c) || null;
}

function getBankroll(userId) {
  const u = findUserById(userId);
  return u ? u.chips : 0;
}

function setBankroll(userId, chips) {
  updateChips(userId, chips);
}

function addBot(table) {
  const taken = table.botSeats().map((x) => x.s.username);
  const profile = pickBotProfile(taken);
  const stack = Math.min(table.maxBuyIn(), Math.max(table.minBuyIn(), table.bigBlind * 60));
  const res = table.seatPlayer(`bot:${botCounter++}`, profile.name, stack, { isBot: true });
  if (res.error) return false;
  table.seats[res.seatIndex].aggression = profile.aggression;
  table.logAction(`${profile.name} (bot) s'assoit`);
  return true;
}

function ensureBots(table) {
  if (table.handActive) return false;
  let changed = false;
  const humans = table.humanSeats().length;

  if (!table.botsEnabled || humans === 0) {
    for (const { s } of table.botSeats()) {
      table.removePlayer(s.userId);
      changed = true;
    }
    return changed;
  }

  for (const { s } of table.botSeats()) {
    if (s.chips <= 0) {
      table.removePlayer(s.userId);
      table.logAction(`${s.username} (bot) est ruiné et quitte`);
      changed = true;
    }
  }

  if (humans >= 2) {
    for (const { s } of table.botSeats()) {
      table.removePlayer(s.userId);
      table.logAction(`${s.username} (bot) laisse la place aux joueurs`);
      changed = true;
    }
    return changed;
  }

  const target = Math.min(MAX_BOTS, table.maxSeats - humans);
  while (table.botSeats().length < target && table.freeSeatCount() > 0) {
    if (!addBot(table)) break;
    changed = true;
  }
  return changed;
}

function freeSeatForHuman(table) {
  if (table.freeSeatCount() > 0) return true;
  const bots = table.botSeats();
  if (bots.length === 0) return false;

  const priority = (x) => (x.s.sittingOut ? 0 : x.s.folded ? 1 : 2);
  const victim = [...bots].sort((a, b) => priority(a) - priority(b) || a.s.chips - b.s.chips)[0].s;

  table.removePlayer(victim.userId);
  table.logAction(`${victim.username} (bot) cède sa place`);
  return true;
}

function clearTurnTimer(table) {
  const t = turnTimers.get(table.id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(table.id);
  }
  table.turnDeadline = null;
  table.pausedUntil = null;
}

function pauseThen(table, ms, then, io) {
  clearTurnTimer(table);
  table.pausedUntil = Date.now() + ms;
  broadcastTable(table, io);
  const timer = setTimeout(() => {
    turnTimers.delete(table.id);
    if (!tables.has(table.id)) return;
    table.pausedUntil = null;
    then();
  }, ms);
  turnTimers.set(table.id, timer);
}

function scheduleNextHand(table, ms, io) {
  pauseThen(table, ms, () => {
    broadcastTable(table, io);
    maybeStartHand(table, io);
  }, io);
}

function resumeBetting(table, io) {
  broadcastTable(table, io);
  if (table.handActive) armTurnTimer(table, io);
  else scheduleNextHand(table, FOLD_END_MS, io);
}

function armTurnTimer(table, io) {
  clearTurnTimer(table);
  if (!table.handActive || table.currentTurn < 0) return;
  const actor = table.currentActor();
  if (!actor) {
    scheduleNextHand(table, FOLD_END_MS, io);
    return;
  }

  if (actor.isBot) {
    const delay = BOT_MIN_MS + randomInt(BOT_MAX_MS - BOT_MIN_MS);
    table.turnDeadline = Date.now() + delay;
    const timer = setTimeout(() => {
      turnTimers.delete(table.id);
      if (!tables.has(table.id)) return;
      const cur = table.currentActor();
      if (!cur || !cur.isBot) {
        resumeBetting(table, io);
        return;
      }
      const decision = decideBotAction(table, cur);
      let res = table.act(cur.userId, decision.action, decision.amount);
      if (res.error) {
        const toCall = table.currentBet - cur.bet;
        res = table.act(cur.userId, toCall > 0 ? "call" : "check");
        if (res.error) res = table.act(cur.userId, "fold");
        if (res.error) {
          resumeBetting(table, io);
          return;
        }
      }
      afterAction(table, io);
    }, delay);
    turnTimers.set(table.id, timer);
    return;
  }

  table.turnDeadline = Date.now() + TURN_MS;
  const timer = setTimeout(() => {
    turnTimers.delete(table.id);
    if (!tables.has(table.id)) return;
    const cur = table.currentActor();
    if (!cur) {
      resumeBetting(table, io);
      return;
    }
    const toCall = table.currentBet - cur.bet;
    const res = table.act(cur.userId, toCall > 0 ? "fold" : "check");
    if (res.error) {
      resumeBetting(table, io);
      return;
    }
    afterAction(table, io);
  }, TURN_MS + 300);
  turnTimers.set(table.id, timer);
}

function maybeStartHand(table, io) {
  if (table.handActive) return;
  if (table.pausedUntil && table.pausedUntil > Date.now()) return;
  const botsChanged = ensureBots(table);

  const playableHumans = table.humanSeats().filter((x) => x.s.chips > 0).length;

  if (table.playablePlayers().length >= 2 && playableHumans >= 1) {
    const res = table.startHand();
    if (res.ok) {
      table._lastPhase = table.phase;
      if (botsChanged) broadcastLobby(io);
      pauseThen(table, DEAL_MS, () => resumeBetting(table, io), io);
      return;
    }
  }

  if (botsChanged) {
    broadcastTable(table, io);
    broadcastLobby(io);
  }
}

function afterAction(table, io) {
  const phaseChanged = table.phase !== table._lastPhase;
  table._lastPhase = table.phase;

  if (table.handActive) {
    if (phaseChanged) {
      pauseThen(table, STREET_MS, () => resumeBetting(table, io), io);
    } else {
      broadcastTable(table, io);
      armTurnTimer(table, io);
    }
    return;
  }

  const showdown = Boolean(table.lastWinners?.some((w) => w.hand));
  scheduleNextHand(table, showdown ? SHOWDOWN_MS : FOLD_END_MS, io);
}

function broadcastTable(table, io) {
  const room = `table:${table.id}`;
  const sockets = io.sockets.adapter.rooms.get(room);
  if (!sockets) return;
  for (const socketId of sockets) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;
    s.emit("table:state", table.publicState(s.data.user?.id));
  }
}

function broadcastLobby(io) {
  io.emit("lobby:tables", tableList());
}

function leaveCurrentTable(socket, io) {
  const tableId = socket.data.tableId;
  if (!tableId) return;
  const table = tables.get(tableId);
  if (table) {
    const stack = table.removePlayer(socket.data.user.id);
    if (typeof stack === "number") {
      const bank = getBankroll(socket.data.user.id);
      setBankroll(socket.data.user.id, bank + stack);
      socket.emit("me", {
        id: socket.data.user.id,
        username: socket.data.user.username,
        chips: getBankroll(socket.data.user.id),
      });
    }
    socket.leave(`table:${tableId}`);

    if (table.humanSeats().length === 0) {
      clearTurnTimer(table);
      tables.delete(tableId);
    } else if (table.pausedUntil && table.pausedUntil > Date.now()) {
      broadcastTable(table, io);
    } else if (table.handActive) {
      broadcastTable(table, io);
      armTurnTimer(table, io);
    } else {
      broadcastTable(table, io);
      maybeStartHand(table, io);
    }
    broadcastLobby(io);
  }
  socket.data.tableId = null;
}

export function setupPokerServer(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Token manquant"));
      const payload = jwt.verify(token, JWT_SECRET);
      const user = findUserById(payload.id);
      if (!user) return next(new Error("Utilisateur introuvable"));
      socket.data.user = { id: user.id, username: user.username };
      next();
    } catch {
      next(new Error("Authentification échouée"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const sendMe = () =>
      socket.emit("me", { id: user.id, username: user.username, chips: getBankroll(user.id) });

    sendMe();
    socket.emit("lobby:stakes", STAKES);
    socket.emit("lobby:tables", tableList());

    socket.on("lobby:list", () => socket.emit("lobby:tables", tableList()));
    socket.on("me:refresh", sendMe);

    socket.on("me:recharge", () => {
      const bank = getBankroll(user.id);
      if (bank < 1000) setBankroll(user.id, bank + 2000);
      sendMe();
    });

    socket.on("lobby:create", ({ name, smallBlind, bigBlind, maxSeats, isPrivate, withBots } = {}) => {
      const table = createTable(name, {
        smallBlind,
        bigBlind,
        maxSeats,
        isPrivate,
        botsEnabled: withBots !== false,
        ownerId: user.id,
      });
      broadcastLobby(io);
      socket.emit("lobby:created", {
        id: table.id,
        code: table.code,
        isPrivate: table.isPrivate,
        summary: table.summary(),
      });
    });

    socket.on("lobby:findCode", ({ code } = {}) => {
      const table = findTableByCode(code);
      if (!table) {
        return socket.emit("lobby:codeResult", { error: "Aucune partie avec ce code" });
      }
      socket.emit("lobby:codeResult", { summary: table.summary(), code: table.code });
    });

    socket.on("table:join", ({ tableId, buyIn, code } = {}) => {
      const table = tables.get(tableId);
      if (!table) return socket.emit("error:msg", "Table introuvable");

      if (table.isPrivate && table.ownerId !== user.id) {
        const given = String(code || "").trim().toUpperCase();
        if (given !== table.code) {
          return socket.emit("error:msg", "Code de partie invalide");
        }
      }

      const bank = getBankroll(user.id);
      const min = table.minBuyIn();
      const max = Math.min(table.maxBuyIn(), bank);

      if (table.seats.some((s) => s && s.userId === user.id)) {
        return socket.emit("error:msg", "Tu es déjà assis à cette table");
      }
      if (bank <= 0) return socket.emit("error:msg", "Solde insuffisant, recharge des jetons");
      if (bank < min) {
        return socket.emit(
          "error:msg",
          `Cette table demande ${min.toLocaleString()} jetons minimum (blinds ${table.smallBlind}/${table.bigBlind}). Tu en as ${bank.toLocaleString()}.`
        );
      }

      if (!freeSeatForHuman(table)) {
        return socket.emit("error:msg", "Table pleine");
      }

      let amount = Math.round(buyIn || max);
      amount = Math.min(Math.max(amount, min), max);

      const res = table.seatPlayer(user.id, user.username, amount);
      if (res.error) return socket.emit("error:msg", res.error);

      setBankroll(user.id, bank - amount);

      socket.data.tableId = tableId;
      socket.join(`table:${tableId}`);
      socket.emit("table:joined", { id: tableId });
      sendMe();
      broadcastTable(table, io);
      broadcastLobby(io);
      maybeStartHand(table, io);
    });

    socket.on("table:addChips", ({ amount } = {}) => {
      const table = tables.get(socket.data.tableId);
      if (!table) return;
      const seat = table.seats.find((s) => s && s.userId === user.id);
      if (!seat) return socket.emit("error:msg", "Pas à cette table");

      const bank = getBankroll(user.id);
      const room = Math.max(0, table.maxBuyIn() - seat.chips);
      const add = Math.min(Math.round(amount || 0), bank, room);
      if (add <= 0) {
        return socket.emit(
          "error:msg",
          room <= 0 ? "Stack déjà au maximum de la table" : "Solde insuffisant"
        );
      }
      const res = table.addChips(user.id, add);
      if (res.error) return socket.emit("error:msg", res.error);
      setBankroll(user.id, bank - add);
      sendMe();
      broadcastTable(table, io);
      maybeStartHand(table, io);
    });

    socket.on("table:leave", () => leaveCurrentTable(socket, io));

    socket.on("table:action", ({ action, amount } = {}) => {
      const table = tables.get(socket.data.tableId);
      if (!table) return;
      if (table.pausedUntil && table.pausedUntil > Date.now()) return;
      const res = table.act(user.id, action, amount);
      if (res.error) return socket.emit("error:msg", res.error);
      afterAction(table, io);
    });

    socket.on("disconnect", () => leaveCurrentTable(socket, io));
  });

  console.log("✓ Serveur Poker WebSocket configuré (bots activés)");
}
