import crypto from "crypto";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"]; // spades, hearts, diamonds, clubs

/**
 * Construit un paquet de 52 cartes au format pokersolver ("As", "Td", "2c"...).
 */
export function buildDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

/**
 * Mélange le paquet en place avec Fisher-Yates + entropie cryptographique.
 */
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function freshShuffledDeck() {
  return shuffle(buildDeck());
}
