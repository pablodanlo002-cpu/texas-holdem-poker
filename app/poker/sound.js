"use client";

/**
 * Sons du poker, synthétisés à la volée avec la Web Audio API.
 *
 * Pas de fichiers audio : tout est généré (oscillateurs + bruit filtré), donc
 * aucun asset à charger, aucune licence à gérer, et un poids nul. Les
 * navigateurs bloquent l'audio tant que l'utilisateur n'a pas interagi ;
 * `unlock()` est appelé au premier clic pour réveiller le contexte.
 */

let ctx = null;
let master = null;
let muted = false;

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlock() {
  audio();
}

export function setMuted(value) {
  muted = Boolean(value);
}

export function getMuted() {
  return muted;
}

/** Note simple, avec enveloppe douce et glissando optionnel. */
function tone({ freq, dur = 0.16, type = "sine", gain = 0.2, at = 0, to = null }) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  // Attaque courte puis extinction exponentielle : évite les clics.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Bruit blanc filtré : sert pour les cartes qui glissent et les jetons. */
function noise({ dur = 0.12, gain = 0.15, at = 0, type = "bandpass", freq = 2200, q = 1, to = null }) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  filter.Q.value = q;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** Un jeton qui tombe sur le tapis : petit choc mat + résonance courte. */
function chipHit(at = 0, pitch = 1) {
  noise({ dur: 0.05, gain: 0.13, at, type: "bandpass", freq: 3400 * pitch, q: 1.6 });
  tone({ freq: 1250 * pitch, dur: 0.06, type: "triangle", gain: 0.06, at });
}

const SOUNDS = {
  // Une carte qui glisse sur le feutre - style Zynga (plus doux, feutré)
  deal() {
    noise({ dur: 0.18, gain: 0.09, type: "bandpass", freq: 800, to: 2200, q: 1.2 });
    tone({ freq: 220, dur: 0.08, type: "sine", gain: 0.04, at: 0.02 });
  },

  // Le paquet qu'on mélange - plus réaliste avec variations
  shuffle() {
    for (let i = 0; i < 7; i++) {
      const randomOffset = Math.random() * 0.02;
      noise({ 
        dur: 0.11, 
        gain: 0.06 + Math.random() * 0.03, 
        at: i * 0.065 + randomOffset, 
        type: "bandpass", 
        freq: 750 + i * 180, 
        q: 0.9 
      });
    }
  },

  // Check : son doux et subtil type Zynga
  check() {
    tone({ freq: 440, dur: 0.12, type: "sine", gain: 0.14, at: 0 });
    tone({ freq: 330, dur: 0.15, type: "sine", gain: 0.11, at: 0.08 });
    noise({ dur: 0.06, gain: 0.05, type: "lowpass", freq: 1200, at: 0.02 });
  },

  // Fold : cartes glissées vers le milieu - plus fluide
  fold() {
    noise({ dur: 0.28, gain: 0.08, type: "bandpass", freq: 1800, to: 450, q: 0.8 });
    tone({ freq: 180, dur: 0.15, type: "sine", gain: 0.06, at: 0.05, to: 140 });
  },

  // Suivre : jetons style Zynga - son métallique caractéristique
  chip() {
    // Son métallique principal
    tone({ freq: 2200, dur: 0.08, type: "sine", gain: 0.12 });
    tone({ freq: 1650, dur: 0.11, type: "sine", gain: 0.09, at: 0.02 });
    // Résonance
    tone({ freq: 880, dur: 0.18, type: "triangle", gain: 0.05, at: 0.01 });
    // Impact
    chipHit(0, 1);
    chipHit(0.06, 1.08);
  },

  // Relancer : pile de jetons plus dramatique
  raise() {
    // Son métallique de relance
    tone({ freq: 2400, dur: 0.1, type: "sine", gain: 0.15 });
    tone({ freq: 1800, dur: 0.13, type: "sine", gain: 0.11, at: 0.03 });
    tone({ freq: 1100, dur: 0.18, type: "triangle", gain: 0.08, at: 0.02, to: 950 });
    // Jetons qui tombent
    for (let i = 0; i < 4; i++) {
      chipHit(0.08 + i * 0.05, 0.98 + i * 0.04);
    }
  },

  // All-in : dramatique et mémorable style Zynga
  allin() {
    // Montée sonore dramatique
    tone({ freq: 220, dur: 0.5, type: "sawtooth", gain: 0.1, to: 880 });
    tone({ freq: 440, dur: 0.5, type: "sine", gain: 0.12, at: 0.05, to: 1320 });
    // Cascade de jetons
    for (let i = 0; i < 9; i++) {
      chipHit(0.22 + i * 0.04, 0.85 + i * 0.08);
      tone({ 
        freq: 1800 + i * 200, 
        dur: 0.06, 
        type: "sine", 
        gain: 0.08, 
        at: 0.22 + i * 0.04 
      });
    }
  },

  // À toi de jouer : son distinctif Zynga-style
  yourTurn() {
    // Double bip caractéristique
    tone({ freq: 784, dur: 0.12, type: "sine", gain: 0.22 });
    tone({ freq: 1047, dur: 0.16, type: "sine", gain: 0.19, at: 0.12 });
    // Légère résonance
    tone({ freq: 523, dur: 0.25, type: "triangle", gain: 0.06, at: 0.08 });
  },

  // Pot remporté par un adversaire : sobre et professionnel
  endHand() {
    // Jetons ramassés
    for (let i = 0; i < 5; i++) {
      chipHit(i * 0.055, 0.88 + i * 0.04);
    }
    // Son de conclusion
    tone({ freq: 440, dur: 0.22, type: "sine", gain: 0.08, at: 0.12, to: 330 });
    tone({ freq: 220, dur: 0.28, type: "triangle", gain: 0.06, at: 0.15, to: 165 });
  },

  // Pot remporté par le joueur : victoire joyeuse style Zynga
  win() {
    // Mélodie de victoire (do majeur ascendant)
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((f, i) => {
      tone({ freq: f, dur: 0.28, type: "sine", gain: 0.16, at: i * 0.08 });
      tone({ freq: f * 2, dur: 0.22, type: "sine", gain: 0.09, at: i * 0.08 + 0.02 });
    });
    // Pluie de jetons avec sons métalliques
    for (let i = 0; i < 10; i++) {
      chipHit(0.15 + i * 0.045, 0.88 + Math.random() * 0.35);
      tone({ 
        freq: 1600 + Math.random() * 800, 
        dur: 0.08, 
        type: "sine", 
        gain: 0.06, 
        at: 0.15 + i * 0.045 
      });
    }
    // Basse de célébration
    tone({ freq: 131, dur: 0.45, type: "triangle", gain: 0.11, at: 0.1 });
  },
};

/**
 * Joue un son. `delay` en millisecondes permet d'étaler plusieurs sons
 * (ex. trois cartes de flop) sans les empiler.
 */
export function play(name, delay = 0) {
  if (muted) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const run = () => {
    try {
      fn();
    } catch {
      /* audio indisponible : on ignore, le jeu doit rester jouable */
    }
  };
  if (delay > 0) setTimeout(run, delay);
  else run();
}
