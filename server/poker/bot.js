import pkg from "pokersolver";

const { Hand } = pkg;

// Noms + personnalités des bots. L'agressivité module la fréquence de relance
// et la tolérance au bluff, pour que les adversaires ne jouent pas tous pareil.
const BOT_PROFILES = [
  { name: "Ada", aggression: 0.55 },
  { name: "Milo", aggression: 0.3 },
  { name: "Nova", aggression: 0.75 },
  { name: "Rex", aggression: 0.45 },
  { name: "Iris", aggression: 0.65 },
  { name: "Otto", aggression: 0.25 },
  { name: "Zoe", aggression: 0.8 },
  { name: "Kai", aggression: 0.4 },
];

/** Profils encore libres à cette table (évite deux bots du même nom). */
export function pickBotProfile(takenNames = []) {
  const free = BOT_PROFILES.filter((p) => !takenNames.includes(p.name));
  const pool = free.length > 0 ? free : BOT_PROFILES;
  return pool[Math.floor(Math.random() * pool.length)];
}

const RANK_ORDER = "23456789TJQKA";

function rankValue(card) {
  return RANK_ORDER.indexOf(card.slice(0, -1)) + 2; // 2..14
}

/**
 * Force préflop approximative, sur 0..1. Basée sur les paires, les hautes
 * cartes, la couleur et la connexion — pas une table de Sklansky complète,
 * mais suffisant pour un adversaire crédible.
 */
function preflopStrength(cards) {
  if (cards.length < 2) return 0.3;
  const [a, b] = cards;
  const va = rankValue(a);
  const vb = rankValue(b);
  const hi = Math.max(va, vb);
  const lo = Math.min(va, vb);
  const suited = a.slice(-1) === b.slice(-1);
  const gap = hi - lo;

  if (va === vb) {
    // Paires : de 22 (0.5) à AA (1.0)
    return Math.min(1, 0.5 + ((va - 2) / 12) * 0.5);
  }

  let score = (hi - 2) / 12 * 0.45 + (lo - 2) / 12 * 0.25;
  if (suited) score += 0.1;
  if (gap === 1) score += 0.07;
  else if (gap === 2) score += 0.03;
  else if (gap > 4) score -= 0.08;
  return Math.max(0.05, Math.min(0.95, score));
}

/**
 * Force post-flop : le rang de main de pokersolver (1 = carte haute,
 * 9 = quinte flush) ramené sur 0..1, ajusté par la hauteur du kicker.
 */
function postflopStrength(cards, community) {
  try {
    const hand = Hand.solve([...cards, ...community]);
    const rank = typeof hand.rank === "number" ? hand.rank : 1;
    const base = Math.min(1, (rank - 1) / 8);
    // Une carte haute / petite paire vaut plus si nos cartes sont grosses.
    const kicker = Math.max(...cards.map(rankValue)) / 14;
    return Math.max(0.05, Math.min(0.98, base * 0.82 + kicker * 0.18));
  } catch {
    return 0.35;
  }
}

function handStrength(seat, table) {
  return table.community.length === 0
    ? preflopStrength(seat.cards)
    : postflopStrength(seat.cards, table.community);
}

/**
 * Décide l'action d'un bot. Retourne { action, amount } directement
 * consommable par PokerTable.act().
 *
 * La décision croise trois éléments : la force de la main, les cotes du pot
 * (ce que coûte le call rapporté à ce qu'il peut rapporter) et l'agressivité
 * du profil. Un peu d'aléatoire évite un jeu totalement lisible.
 */
export function decideBotAction(table, seat) {
  const toCall = Math.max(0, table.currentBet - seat.bet);
  const strength = handStrength(seat, table);
  const aggression = seat.aggression ?? 0.45;
  const rand = Math.random();

  // Cotes du pot : part du pot final que représente notre call.
  const potOdds = toCall > 0 ? toCall / (table.pot + toCall) : 0;

  const maxTotal = seat.bet + seat.chips;
  const minRaiseTotal = table.currentBet + (table.lastRaiseSize || table.bigBlind);
  const canRaise = maxTotal > table.currentBet;

  // Taille de relance visée : fraction du pot, bornée par le tapis.
  const raiseTo = (fraction) => {
    const target = table.currentBet + Math.round((table.pot + toCall) * fraction);
    return Math.max(minRaiseTotal, Math.min(target, maxTotal));
  };

  // ---- Personne n'a misé : check ou ouverture -----------------------------
  if (toCall === 0) {
    if (!canRaise) return { action: "check" };
    if (strength > 0.78 && rand < 0.55 + aggression * 0.35) {
      return { action: "raise", amount: raiseTo(0.75) };
    }
    if (strength > 0.55 && rand < aggression * 0.6) {
      return { action: "raise", amount: raiseTo(0.5) };
    }
    // Bluff occasionnel sur main faible.
    if (strength < 0.35 && rand < aggression * 0.14) {
      return { action: "raise", amount: raiseTo(0.4) };
    }
    return { action: "check" };
  }

  // ---- Il faut payer -----------------------------------------------------
  const allInToCall = toCall >= seat.chips;

  // Main très forte : relance, ou tapis si la relance est trop chère.
  if (strength > 0.82 && canRaise && rand < 0.4 + aggression * 0.45) {
    return { action: "raise", amount: raiseTo(0.85) };
  }

  // Main correcte face à des cotes raisonnables : on suit.
  if (strength >= potOdds + 0.12) {
    return { action: "call" };
  }

  // Main faible mais call peu coûteux : on paie pour voir.
  if (potOdds < 0.12 && strength > 0.28) {
    return { action: "call" };
  }

  // Call héroïque occasionnel, sauf si ça coûte tout le tapis.
  if (!allInToCall && rand < aggression * 0.1) {
    return { action: "call" };
  }

  return { action: "fold" };
}
