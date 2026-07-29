import pkg from "pokersolver";
import { freshShuffledDeck } from "./deck.js";

const { Hand } = pkg;

// Phases d'une main
const PHASES = ["preflop", "flop", "turn", "river", "showdown"];

/**
 * Moteur Texas Hold'em No-Limit. Serveur autoritaire : il valide chaque
 * action et calcule tout l'état. L'état des joueurs contient leurs cartes ;
 * c'est au serveur Socket.IO de filtrer ce que chaque client reçoit.
 */
export class PokerTable {
  constructor({
    id,
    name,
    smallBlind = 10,
    bigBlind = 20,
    maxSeats = 6,
    isPrivate = false,
    code = null,
    botsEnabled = true,
    ownerId = null,
  }) {
    this.id = id;
    this.name = name;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.maxSeats = maxSeats;
    this.isPrivate = isPrivate;
    this.code = code; // code de partie privée (null si publique)
    this.botsEnabled = botsEnabled;
    this.ownerId = ownerId;

    this.seats = new Array(maxSeats).fill(null); // { userId, username, chips, ... }
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.phase = "waiting"; // waiting | preflop | flop | turn | river | showdown
    this.dealerIndex = -1;
    this.currentTurn = -1; // index du siège dont c'est le tour
    this.currentBet = 0; // mise la plus haute du tour courant
    this.lastRaiseSize = 0;
    this.handActive = false;
    this.lastWinners = null; // résumé du dernier showdown
    this.message = "En attente de joueurs...";
    this.turnDeadline = null; // timestamp (ms) de fin du tour courant (géré par le serveur)
    this.pausedUntil = null; // pause de mise en scène (distribution, abattage)
    this.actionLog = []; // dernières actions, pour l'affichage client
    this.actionSeq = 0; // compteur monotone : permet au client de savoir
    // combien de lignes sont nouvelles (le log est tronqué à 12).
  }

  logAction(text) {
    this.actionLog.push(text);
    this.actionSeq++;
    if (this.actionLog.length > 12) this.actionLog.shift();
  }

  // Bornes de buy-in (façon cash-game) : 10 BB mini, 100 BB maxi.
  // Volontairement large pour que le curseur ait toujours une plage utile.
  minBuyIn() {
    return this.bigBlind * 10;
  }
  maxBuyIn() {
    return this.bigBlind * 100;
  }

  // Siège dont c'est le tour (ou null).
  currentActor() {
    const s = this.seats[this.currentTurn];
    return s || null;
  }

  // Recharge de jetons à la table (uniquement hors main, ou si couché).
  addChips(userId, amount) {
    const idx = this.seats.findIndex((s) => s && s.userId === userId);
    if (idx === -1) return { error: "Pas à cette table" };
    if (this.handActive && !this.seats[idx].folded) {
      return { error: "Recharge possible seulement entre deux mains" };
    }
    this.seats[idx].chips += Math.max(0, Math.round(amount));
    this.seats[idx].sittingOut = this.seats[idx].chips <= 0;
    return { ok: true, chips: this.seats[idx].chips };
  }


  // ---- Gestion des sièges -------------------------------------------------

  seatPlayer(userId, username, chips, opts = {}) {
    if (this.seats.some((s) => s && s.userId === userId)) {
      return { error: "Déjà assis à cette table" };
    }
    const idx = this.seats.findIndex((s) => s === null);
    if (idx === -1) return { error: "Table pleine" };

    // Arrivée en pleine main : le joueur n'a pas de cartes, il ne doit donc
    // surtout pas entrer dans les enchères. On le marque couché/ayant agi ;
    // `startHand()` réinitialise ces drapeaux à la main suivante.
    const midHand = this.handActive;

    this.seats[idx] = {
      userId,
      username,
      chips,
      isBot: Boolean(opts.isBot),
      cards: [],
      bet: 0, // mise engagée sur le tour courant
      totalBet: 0, // total engagé sur la main
      folded: midHand,
      allIn: false,
      acted: midHand,
      sittingOut: chips <= 0,
      waitingForHand: midHand, // purement informatif (affichage client)
    };
    return { seatIndex: idx };
  }

  // ---- Helpers humains / bots ---------------------------------------------

  humanSeats() {
    return this.occupiedSeats().filter((x) => !x.s.isBot);
  }

  botSeats() {
    return this.occupiedSeats().filter((x) => x.s.isBot);
  }

  freeSeatCount() {
    return this.seats.filter((s) => s === null).length;
  }

  removePlayer(userId) {
    const idx = this.seats.findIndex((s) => s && s.userId === userId);
    if (idx === -1) return null;
    const chips = this.seats[idx].chips;
    // Si le joueur part au milieu d'une main, il fold implicitement.
    if (this.handActive && !this.seats[idx].folded) {
      this.seats[idx].folded = true;
    }
    this.seats[idx] = null;
    if (this.activePlayers().length < 2) {
      this.endHandDueToLackOfPlayers();
    }
    return chips;
  }

  occupiedSeats() {
    return this.seats
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s !== null);
  }

  playablePlayers() {
    // joueurs pouvant démarrer une main (assis, avec des jetons)
    return this.occupiedSeats().filter((x) => x.s.chips > 0);
  }

  activePlayers() {
    // joueurs encore dans la main
    return this.occupiedSeats().filter((x) => !x.s.folded && !x.s.sittingOut);
  }

  // ---- Démarrage d'une main ----------------------------------------------

  startHand() {
    const ready = this.playablePlayers();
    if (ready.length < 2) {
      this.message = "En attente d'au moins 2 joueurs...";
      return { error: "Pas assez de joueurs" };
    }

    // Reset état de main
    this.deck = freshShuffledDeck();
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.lastWinners = null;
    this.handActive = true;
    this.phase = "preflop";

    for (const { s } of this.occupiedSeats()) {
      s.cards = [];
      s.bet = 0;
      s.totalBet = 0;
      s.folded = false;
      s.allIn = false;
      s.acted = false;
      s.waitingForHand = false;
      s.sittingOut = s.chips <= 0;
    }

    // Bouton du donneur : avance vers le prochain siège jouable
    this.dealerIndex = this.nextOccupiedSeat(this.dealerIndex, true);

    // Distribution : 2 cartes par joueur actif
    const players = this.activePlayers();
    for (let round = 0; round < 2; round++) {
      for (const { s } of players) {
        s.cards.push(this.deck.pop());
      }
    }

    this.postBlinds();
    this.message = "Nouvelle main : les blinds sont postées.";
    return { ok: true };
  }

  postBlinds() {
    const players = this.activePlayers();
    const isHeadsUp = players.length === 2;

    // En heads-up, le bouton poste la small blind.
    let sbIndex, bbIndex;
    if (isHeadsUp) {
      sbIndex = this.dealerIndex;
      bbIndex = this.nextActiveSeat(this.dealerIndex);
    } else {
      sbIndex = this.nextActiveSeat(this.dealerIndex);
      bbIndex = this.nextActiveSeat(sbIndex);
    }

    this.placeBet(sbIndex, this.smallBlind);
    this.placeBet(bbIndex, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.lastRaiseSize = this.bigBlind;

    // Le premier à parler preflop est juste après la big blind.
    this.currentTurn = this.nextActiveSeat(bbIndex);
    // La big blind n'a pas encore "agi" (elle a l'option).
    this.seats[bbIndex].acted = false;
  }

  // ---- Actions des joueurs ------------------------------------------------

  act(userId, action, amount = 0) {
    if (!this.handActive) return { error: "Aucune main en cours" };
    const idx = this.seats.findIndex((s) => s && s.userId === userId);
    if (idx === -1) return { error: "Tu n'es pas à cette table" };
    if (idx !== this.currentTurn) return { error: "Ce n'est pas ton tour" };

    const player = this.seats[idx];
    if (player.folded || player.allIn) return { error: "Action impossible" };

    const toCall = this.currentBet - player.bet;

    switch (action) {
      case "fold":
        player.folded = true;
        this.logAction(`${player.username} se couche`);
        break;

      case "check":
        if (toCall > 0) return { error: "Impossible de checker, il faut suivre ou fold" };
        this.logAction(`${player.username} check`);
        break;

      case "call": {
        if (toCall <= 0) return { error: "Rien à suivre (utilise check)" };
        this.placeBet(idx, Math.min(toCall, player.chips));
        this.logAction(`${player.username} suit ${Math.min(toCall, player.chips + toCall)}`);
        break;
      }

      case "raise": {
        // amount = montant TOTAL de la mise visée sur ce tour
        const target = Math.floor(amount);
        const minRaiseTotal = this.currentBet + this.lastRaiseSize;
        const maxTotal = player.bet + player.chips; // all-in
        if (target > maxTotal) return { error: "Pas assez de jetons" };
        // Autorise l'all-in même s'il est inférieur au min-raise.
        const isAllIn = target === maxTotal;
        if (!isAllIn && target < minRaiseTotal) {
          return { error: `Relance minimum : ${minRaiseTotal}` };
        }
        const added = target - player.bet;
        const raiseSize = target - this.currentBet;
        this.placeBet(idx, added);
        this.currentBet = target;
        if (raiseSize >= this.lastRaiseSize) this.lastRaiseSize = raiseSize;
        // Une relance rouvre le tour pour les autres.
        for (const { s } of this.activePlayers()) {
          if (s !== player && !s.allIn) s.acted = false;
        }
        this.logAction(`${player.username} ${isAllIn ? "part à tapis" : "relance"} à ${target}`);
        break;
      }

      default:
        return { error: "Action inconnue" };
    }

    player.acted = true;
    this.advance();
    return { ok: true };
  }

  placeBet(idx, amount) {
    const p = this.seats[idx];
    const real = Math.min(amount, p.chips);
    p.chips -= real;
    p.bet += real;
    p.totalBet += real;
    this.pot += real;
    if (p.chips === 0) p.allIn = true;
  }

  // ---- Progression du tour / des phases ----------------------------------

  advance() {
    const contenders = this.activePlayers();

    // S'il ne reste qu'un joueur non couché : il gagne le pot immédiatement.
    if (contenders.filter((x) => !x.s.folded).length === 1) {
      this.awardUncontested();
      return;
    }

    // Le tour de mise est-il terminé ?
    if (this.bettingRoundComplete()) {
      this.nextPhase();
      return;
    }

    // Sinon, passe au prochain joueur pouvant agir.
    this.currentTurn = this.nextActionableSeat(this.currentTurn);
  }

  bettingRoundComplete() {
    const inHand = this.activePlayers().filter((x) => !x.s.folded);
    const canAct = inHand.filter((x) => !x.s.allIn);
    // Tous ceux qui peuvent agir ont agi et égalisé la mise courante.
    return canAct.every((x) => x.s.acted && x.s.bet === this.currentBet);
  }

  nextPhase() {
    // Réinitialise les mises du tour.
    for (const { s } of this.occupiedSeats()) {
      s.bet = 0;
      s.acted = false;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;

    const order = ["preflop", "flop", "turn", "river", "showdown"];
    const next = order[order.indexOf(this.phase) + 1];
    this.phase = next;

    if (next === "flop") {
      this.deck.pop(); // burn
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (next === "turn" || next === "river") {
      this.deck.pop(); // burn
      this.community.push(this.deck.pop());
    }

    if (next === "showdown") {
      this.showdown();
      return;
    }

    // Si plus personne ne peut miser (tous all-in sauf ≤1), on déroule.
    const canAct = this.activePlayers().filter((x) => !x.s.folded && !x.s.allIn);
    if (canAct.length <= 1) {
      this.currentTurn = -1;
      this.nextPhase();
      return;
    }

    // Post-flop : premier à parler = premier joueur actif après le bouton.
    this.currentTurn = this.nextActionableSeat(this.dealerIndex);
    this.message = `Phase : ${next}`;
  }

  // ---- Fin de main --------------------------------------------------------

  awardUncontested() {
    const winner = this.activePlayers().find((x) => !x.s.folded);
    if (winner) {
      winner.s.chips += this.pot;
      this.lastWinners = [
        { userId: winner.s.userId, username: winner.s.username, amount: this.pot, hand: null },
      ];
      this.message = `${winner.s.username} remporte ${this.pot} (tous les autres se couchent).`;
    }
    this.finishHand();
  }

  showdown() {
    // Révèle et évalue les mains via pokersolver, distribue avec side pots.
    const contenders = this.activePlayers().filter((x) => !x.s.folded);

    const solved = contenders.map((x) => {
      const hand = Hand.solve([...x.s.cards, ...this.community]);
      return { seat: x, hand };
    });

    const results = this.distributePots(solved);
    this.lastWinners = results;
    this.message = results
      .map((r) => `${r.username} gagne ${r.amount} (${r.hand})`)
      .join(" • ");
    this.phase = "showdown";
    this.finishHand();
  }

  /**
   * Distribution avec side pots : trie par contribution totale et attribue
   * chaque palier aux meilleures mains éligibles.
   */
  distributePots(solved) {
    const payouts = {}; // userId -> montant gagné
    const handByUser = {};
    for (const { seat, hand } of solved) {
      handByUser[seat.s.userId] = hand;
    }

    // Toutes les contributions de la main (y compris joueurs couchés).
    const contributors = this.occupiedSeats()
      .filter((x) => x.s.totalBet > 0)
      .map((x) => ({ userId: x.s.userId, contrib: x.s.totalBet }));

    const levels = [...new Set(contributors.map((c) => c.contrib))].sort((a, b) => a - b);

    let prev = 0;
    for (const level of levels) {
      const slice = level - prev;
      // Combien de joueurs ont contribué au moins jusqu'à ce niveau.
      const potContributors = contributors.filter((c) => c.contrib >= level);
      const potAmount = slice * potContributors.length;

      // Éligibles à ce pot : contenders non couchés ayant misé >= level.
      const eligible = solved.filter(
        (x) => x.seat.s.totalBet >= level
      );
      if (eligible.length > 0) {
        const best = Hand.winners(eligible.map((e) => e.hand));
        const winners = eligible.filter((e) => best.includes(e.hand));
        const share = Math.floor(potAmount / winners.length);
        let remainder = potAmount - share * winners.length;
        for (const w of winners) {
          let gain = share;
          if (remainder > 0) {
            gain += 1;
            remainder -= 1;
          }
          payouts[w.seat.s.userId] = (payouts[w.seat.s.userId] || 0) + gain;
        }
      }
      prev = level;
    }

    // Applique les gains.
    const results = [];
    for (const [userId, amount] of Object.entries(payouts)) {
      const seat = this.occupiedSeats().find((x) => String(x.s.userId) === String(userId));
      if (seat) {
        seat.s.chips += amount;
        const hand = handByUser[userId];
        results.push({
          userId: seat.s.userId,
          username: seat.s.username,
          amount,
          hand: hand ? hand.descr : null,
        });
      }
    }
    return results;
  }

  endHandDueToLackOfPlayers() {
    if (!this.handActive) return;
    const remaining = this.activePlayers().filter((x) => !x.s.folded);
    if (remaining.length === 1) {
      remaining[0].s.chips += this.pot;
    }
    this.finishHand();
  }

  finishHand() {
    this.handActive = false;
    this.phase = "showdown";
    this.pot = 0;
    this.currentTurn = -1;
    // Les joueurs à sec passent en sitting-out.
    for (const { s } of this.occupiedSeats()) {
      s.sittingOut = s.chips <= 0;
    }
  }

  // ---- Helpers de navigation entre sièges --------------------------------

  nextOccupiedSeat(from, playableOnly = false) {
    for (let step = 1; step <= this.maxSeats; step++) {
      const i = (from + step) % this.maxSeats;
      const s = this.seats[i];
      if (s && (!playableOnly || s.chips > 0)) return i;
    }
    return from;
  }

  nextActiveSeat(from) {
    for (let step = 1; step <= this.maxSeats; step++) {
      const i = (from + step) % this.maxSeats;
      const s = this.seats[i];
      if (s && !s.folded && !s.sittingOut) return i;
    }
    return from;
  }

  nextActionableSeat(from) {
    for (let step = 1; step <= this.maxSeats; step++) {
      const i = (from + step) % this.maxSeats;
      const s = this.seats[i];
      if (s && !s.folded && !s.allIn && !s.sittingOut) return i;
    }
    return from;
  }

  // ---- Sérialisation ------------------------------------------------------

  /**
   * État public de la table. Si `forUserId` est fourni, seules ses cartes
   * sont visibles (les autres sont masquées), sauf au showdown.
   */
  publicState(forUserId = null) {
    const reveal = this.phase === "showdown";
    return {
      id: this.id,
      name: this.name,
      isPrivate: this.isPrivate,
      code: this.code,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      maxSeats: this.maxSeats,
      pot: this.pot,
      community: this.community,
      phase: this.phase,
      dealerIndex: this.dealerIndex,
      currentTurn: this.currentTurn,
      currentBet: this.currentBet,
      handActive: this.handActive,
      message: this.message,
      lastWinners: this.lastWinners,
      turnDeadline: this.turnDeadline,
      paused: Boolean(this.pausedUntil && this.pausedUntil > Date.now()),
      pausedUntil: this.pausedUntil,
      actionLog: this.actionLog,
      actionSeq: this.actionSeq,
      minBuyIn: this.minBuyIn(),
      maxBuyIn: this.maxBuyIn(),
      seats: this.seats.map((s) => {
        if (!s) return null;
        const mine = forUserId != null && String(s.userId) === String(forUserId);
        const showCards = mine || (reveal && !s.folded);
        return {
          userId: s.userId,
          username: s.username,
          isBot: Boolean(s.isBot),
          chips: s.chips,
          bet: s.bet,
          folded: s.folded,
          allIn: s.allIn,
          sittingOut: s.sittingOut,
          waitingForHand: Boolean(s.waitingForHand),
          isMe: mine,
          cards: showCards ? s.cards : s.cards.map(() => "back"),
        };
      }),
    };
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      isPrivate: this.isPrivate,
      players: this.occupiedSeats().length,
      humans: this.humanSeats().length,
      bots: this.botSeats().length,
      maxSeats: this.maxSeats,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      minBuyIn: this.minBuyIn(),
      maxBuyIn: this.maxBuyIn(),
      handActive: this.handActive,
      phase: this.phase,
      pot: this.pot,
    };
  }
}
