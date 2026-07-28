import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { randomInt } from "crypto";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local"), quiet: true });
process.chdir(path.join(__dirname, ".."));

const { PokerTable } = await import("./poker/engine.js");
const { decideBotAction, pickBotProfile } = await import("./poker/bot.js");
const { findUserById, updateChips } = await import("../lib/db.js");

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.POKER_PORT || 4000;
const TURN_MS = 25000; // temps par tour avant auto-action (humains)

// ---- Rythme de la partie ----------------------------------------------------
// Le poker se joue à un tempo lisible : on laisse le temps de voir les cartes
// tomber, les jetons partir, et l'abattage se dérouler. Sans ces pauses, une
// main entière se joue en une seconde et devient illisible.
const BOT_MIN_MS = 1500; // réflexion mini d'un bot
const BOT_MAX_MS = 3600; // réflexion maxi d'un bot
const STREET_MS = 1900; // pause après le flop / turn / river
const DEAL_MS = 1300; // pause après la distribution + les blinds
const SHOWDOWN_MS = 7000; // temps d'affichage d'un abattage (cartes révélées)
const FOLD_END_MS = 3800; // temps d'affichage d'une main gagnée sans abattage

const MAX_BOTS = 3; // bots ajoutés quand un humain est seul

if (!JWT_SECRET) {
  console.error("JWT_SECRET requis dans .env.local");
  process.exit(1);
}

// Niveaux de blinds proposés dans le lobby (façon Zynga).
const STAKES = [
  { key: "micro", label: "Micro", smallBlind: 5, bigBlind: 10 },
  { key: "low", label: "Low", smallBlind: 10, bigBlind: 20 },
  { key: "medium", label: "Medium", smallBlind: 25, bigBlind: 50 },
  { key: "high", label: "High", smallBlind: 50, bigBlind: 100 },
  { key: "vip", label: "VIP", smallBlind: 100, bigBlind: 200 },
];

// ---- État global des tables -----------------------------------------------

/** @type {Map<string, PokerTable>} */
const tables = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const turnTimers = new Map();
let tableCounter = 1;
let botCounter = 1;

// Alphabet sans caractères ambigus (0/O, 1/I) pour les codes de partie privée.
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

/** Le lobby public ne liste jamais les parties privées. */
function tableList() {
  return [...tables.values()].filter((t) => !t.isPrivate).map((t) => t.summary());
}

function findTableByCode(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return [...tables.values()].find((t) => t.code === c) || null;
}

// ---- Bankroll : data.json = solde total ; le stack à la table est en mémoire.
function getBankroll(userId) {
  const u = findUserById(userId);
  return u ? u.chips : 0;
}
function setBankroll(userId, chips) {
  updateChips(userId, chips);
}

// ---- Serveur HTTP + Socket.IO ---------------------------------------------

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Poker server running");
});

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

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

function broadcastTable(table) {
  const room = `table:${table.id}`;
  const sockets = io.sockets.adapter.rooms.get(room);
  if (!sockets) return;
  for (const socketId of sockets) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;
    s.emit("table:state", table.publicState(s.data.user?.id));
  }
}

function broadcastLobby() {
  io.emit("lobby:tables", tableList());
}

// ---- Bots ------------------------------------------------------------------

function addBot(table) {
  const taken = table.botSeats().map((x) => x.s.username);
  const profile = pickBotProfile(taken);
  // Tapis d'entrée d'un bot : 60 BB, borné par les limites de la table.
  const stack = Math.min(table.maxBuyIn(), Math.max(table.minBuyIn(), table.bigBlind * 60));
  const res = table.seatPlayer(`bot:${botCounter++}`, profile.name, stack, { isBot: true });
  if (res.error) return false;
  table.seats[res.seatIndex].aggression = profile.aggression;
  table.logAction(`${profile.name} (bot) s'assoit`);
  return true;
}

/**
 * Ajuste les bots présents. Appelé uniquement entre deux mains.
 * - 0 humain  : on retire tous les bots (la table va être fermée).
 * - 1 humain  : on complète avec des bots pour pouvoir jouer.
 * - 2+ humains: les bots libèrent leurs sièges.
 */
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

  // Bots ruinés : on les sort, ils seront remplacés juste après.
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

/**
 * Libère un siège pour un humain qui arrive sur une table pleine de bots.
 * On sacrifie en priorité un bot ruiné, puis un bot couché, puis le plus
 * petit tapis — pour perturber la main en cours le moins possible.
 */
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

// ---- Chronos et rythme -----------------------------------------------------
// Une table n'a qu'un seul timer à la fois (turnTimers) : soit le chrono du
// joueur dont c'est le tour, soit une pause de mise en scène. Tout annulation
// remet aussi `pausedUntil` à zéro, pour qu'aucun état ne puisse rester gelé.

function clearTurnTimer(table) {
  const t = turnTimers.get(table.id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(table.id);
  }
  table.turnDeadline = null;
  table.pausedUntil = null;
}

/**
 * Gèle la table quelques instants (distribution, nouvelle street, abattage)
 * puis exécute `then`. Pendant la pause, aucune action n'est acceptée et
 * aucun chrono ne tourne : le client peut jouer l'animation tranquillement.
 */
function pauseThen(table, ms, then) {
  clearTurnTimer(table);
  table.pausedUntil = Date.now() + ms;
  broadcastTable(table);
  const timer = setTimeout(() => {
    turnTimers.delete(table.id);
    if (!tables.has(table.id)) return;
    table.pausedUntil = null;
    then();
  }, ms);
  turnTimers.set(table.id, timer);
}

/** Fin de main : on laisse le résultat à l'écran, puis on enchaîne. */
function scheduleNextHand(table, ms) {
  pauseThen(table, ms, () => {
    broadcastTable(table);
    maybeStartHand(table);
  });
}

/** Reprise des enchères après une pause : la main a pu se terminer entre-temps. */
function resumeBetting(table) {
  broadcastTable(table);
  if (table.handActive) armTurnTimer(table);
  else scheduleNextHand(table, FOLD_END_MS);
}

function armTurnTimer(table) {
  clearTurnTimer(table);
  if (!table.handActive || table.currentTurn < 0) return;
  const actor = table.currentActor();
  if (!actor) {
    // Plus personne pour agir alors que la main est marquée active : on
    // referme proprement plutôt que de laisser la table bloquée.
    scheduleNextHand(table, FOLD_END_MS);
    return;
  }

  // ---- Tour d'un bot : réflexion, puis décision.
  if (actor.isBot) {
    const delay = BOT_MIN_MS + randomInt(BOT_MAX_MS - BOT_MIN_MS);
    table.turnDeadline = Date.now() + delay;
    const timer = setTimeout(() => {
      turnTimers.delete(table.id);
      if (!tables.has(table.id)) return;
      const cur = table.currentActor();
      if (!cur || !cur.isBot) {
        resumeBetting(table);
        return;
      }
      const decision = decideBotAction(table, cur);
      let res = table.act(cur.userId, decision.action, decision.amount);
      if (res.error) {
        // Repli sûr si la décision était illégale (bord de tapis, min-raise…).
        const toCall = table.currentBet - cur.bet;
        res = table.act(cur.userId, toCall > 0 ? "call" : "check");
        if (res.error) res = table.act(cur.userId, "fold");
        if (res.error) {
          resumeBetting(table);
          return;
        }
      }
      afterAction(table);
    }, delay);
    turnTimers.set(table.id, timer);
    return;
  }

  // ---- Tour d'un humain : 25 s puis auto-action.
  table.turnDeadline = Date.now() + TURN_MS;
  const timer = setTimeout(() => {
    turnTimers.delete(table.id);
    if (!tables.has(table.id)) return;
    const cur = table.currentActor();
    if (!cur) {
      resumeBetting(table);
      return;
    }
    const toCall = table.currentBet - cur.bet;
    const res = table.act(cur.userId, toCall > 0 ? "fold" : "check");
    if (res.error) {
      resumeBetting(table);
      return;
    }
    afterAction(table);
  }, TURN_MS + 300);
  turnTimers.set(table.id, timer);
}

// Auto-démarre une main si possible (en complétant avec des bots au besoin).
function maybeStartHand(table) {
  if (table.handActive) return;
  // Une pause de mise en scène est en cours (abattage, distribution) :
  // c'est elle qui relancera la suite, on ne double pas le déclenchement.
  if (table.pausedUntil && table.pausedUntil > Date.now()) return;
  const botsChanged = ensureBots(table);

  // Il faut au moins un humain qui a des jetons : sinon les bots joueraient
  // entre eux indéfiniment devant un joueur ruiné.
  const playableHumans = table.humanSeats().filter((x) => x.s.chips > 0).length;

  if (table.playablePlayers().length >= 2 && playableHumans >= 1) {
    const res = table.startHand();
    if (res.ok) {
      table._lastPhase = table.phase;
      if (botsChanged) broadcastLobby();
      // Laisse voir la distribution et les blinds avant la première action.
      pauseThen(table, DEAL_MS, () => resumeBetting(table));
      return;
    }
  }

  if (botsChanged) {
    broadcastTable(table);
    broadcastLobby();
  }
}

// Après chaque action : diffuse, gère le rythme, enchaîne la main suivante.
function afterAction(table) {
  const phaseChanged = table.phase !== table._lastPhase;
  table._lastPhase = table.phase;

  if (table.handActive) {
    if (phaseChanged) {
      // Nouvelles cartes sur le tapis : on marque une pause avant de relancer
      // les enchères, sinon le flop apparaît et disparaît en un clin d'œil.
      pauseThen(table, STREET_MS, () => resumeBetting(table));
    } else {
      broadcastTable(table);
      armTurnTimer(table);
    }
    return;
  }

  // Fin de main : l'abattage reste affiché plus longtemps qu'un fold général.
  const showdown = Boolean(table.lastWinners?.some((w) => w.hand));
  scheduleNextHand(table, showdown ? SHOWDOWN_MS : FOLD_END_MS);
}

io.on("connection", (socket) => {
  const user = socket.data.user;
  const sendMe = () =>
    socket.emit("me", { id: user.id, username: user.username, chips: getBankroll(user.id) });

  sendMe();
  socket.emit("lobby:stakes", STAKES);
  socket.emit("lobby:tables", tableList());

  socket.on("lobby:list", () => socket.emit("lobby:tables", tableList()));
  socket.on("me:refresh", sendMe);

  // Recharge gratuite si le solde est bas (jetons virtuels, pour le fun).
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
    broadcastLobby();
    socket.emit("lobby:created", {
      id: table.id,
      code: table.code,
      isPrivate: table.isPrivate,
      summary: table.summary(),
    });
  });

  // Recherche d'une partie privée par code.
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

    // Table privée : le code est obligatoire (sauf pour son créateur).
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

    // Table pleine : un bot cède sa place à l'humain.
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
    broadcastTable(table);
    broadcastLobby();
    maybeStartHand(table);
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
    broadcastTable(table);
    maybeStartHand(table);
  });

  socket.on("table:leave", () => leaveCurrentTable(socket));

  socket.on("table:action", ({ action, amount } = {}) => {
    const table = tables.get(socket.data.tableId);
    if (!table) return;
    // Pendant une pause (cartes qui tombent, abattage), on n'accepte rien.
    if (table.pausedUntil && table.pausedUntil > Date.now()) return;
    const res = table.act(user.id, action, amount);
    if (res.error) return socket.emit("error:msg", res.error);
    afterAction(table);
  });

  socket.on("disconnect", () => leaveCurrentTable(socket));
});

function leaveCurrentTable(socket) {
  const tableId = socket.data.tableId;
  if (!tableId) return;
  const table = tables.get(tableId);
  if (table) {
    // Rend le stack restant à la bankroll du joueur.
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

    // Une table sans humain est fermée (les bots ne la gardent pas en vie).
    if (table.humanSeats().length === 0) {
      clearTurnTimer(table);
      tables.delete(tableId);
    } else if (table.pausedUntil && table.pausedUntil > Date.now()) {
      // Une pause est en cours : elle enchaînera d'elle-même, on ne la coupe pas.
      broadcastTable(table);
    } else if (table.handActive) {
      broadcastTable(table);
      armTurnTimer(table);
    } else {
      broadcastTable(table);
      maybeStartHand(table);
    }
    broadcastLobby();
  }
  socket.data.tableId = null;
}

httpServer.listen(PORT, () => {
  console.log(`Serveur Poker démarré sur le port ${PORT} (timer ${TURN_MS / 1000}s/tour, bots activés)`);
});
