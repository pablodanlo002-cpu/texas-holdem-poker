import { randomInt, randomUUID } from "crypto";
import { getRewards, updateRewards } from "./db.js";

/**
 * Système de gains de pièces : abonnements réseaux, pubs récompensées et
 * roue quotidienne.
 *
 * Règle de base : TOUT est décidé et compté ici, côté serveur. Le client ne
 * fait qu'appeler des routes ; il ne dit jamais combien il a gagné, ni s'il a
 * bien regardé une vidéo. Sinon il suffirait d'ouvrir la console pour se
 * créditer à l'infini.
 */

// ---- Réglages -------------------------------------------------------------
// C'est ici que tu changes les montants et tes liens.

export const CONFIG = {
  // Liens de tes comptes.
  youtubeUrl: "https://www.youtube.com/@TechNova-d2o",
  tiktokUrl: "https://www.tiktok.com/@coucou0534",

  // Abonnements : une seule fois par compte.
  socialReward: 500,
  // Temps minimum passé sur la page avant de pouvoir réclamer (anti clic-clic).
  socialDwellMs: 15000,

  // Pub courte : 30 s regardées = 100 pièces.
  adDuration: 30,
  adReward: 100,
  // Garde-fou : sans plafond, 100 pièces toutes les 30 s = 12 000/heure.
  adMaxPerDay: 20,

  // Vidéo longue : 60 s regardées = 1 tour de roue en plus.
  spinAdDuration: 60,
  spinAdMaxPerDay: 5,

  // Roue : un tour gratuit toutes les 24 h.
  freeSpinCooldownMs: 24 * 60 * 60 * 1000,
};

/**
 * Secteurs de la roue. `weight` est une pondération, pas un pourcentage :
 * la chance d'un secteur = son poids / la somme des poids.
 * Les secteurs à 0 pièce sont les cases vides demandées.
 */
export const WHEEL = [
  { label: "100", coins: 100, weight: 20 },
  { label: "Rien", coins: 0, weight: 16 },
  { label: "250", coins: 250, weight: 14 },
  { label: "50", coins: 50, weight: 20 },
  { label: "Rien", coins: 0, weight: 16 },
  { label: "500", coins: 500, weight: 8 },
  { label: "150", coins: 150, weight: 14 },
  { label: "2000", coins: 2000, weight: 2 },
];

const WHEEL_TOTAL = WHEEL.reduce((sum, s) => sum + s.weight, 0);

/** Tire un secteur au hasard, pondéré, avec le RNG cryptographique. */
function drawSector() {
  let roll = randomInt(WHEEL_TOTAL);
  for (let i = 0; i < WHEEL.length; i++) {
    roll -= WHEEL[i].weight;
    if (roll < 0) return i;
  }
  return WHEEL.length - 1;
}

// ---- Jour courant ---------------------------------------------------------
// Les compteurs "par jour" suivent le fuseau de Paris, pas UTC : sinon la
// remise à zéro tomberait à 1 h ou 2 h du matin pour toi.

function dayKey(at = Date.now()) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

/** Remet les compteurs à zéro si on a changé de jour. */
function rollDay(r) {
  const today = dayKey();
  if (r.day !== today) {
    r.day = today;
    r.adCoinCount = 0;
    r.spinAdCount = 0;
    r.spinCredits = 0; // les tours gagnés hier ne se cumulent pas
  }
  r.social = r.social || {};
  r.adCoinCount = r.adCoinCount || 0;
  r.spinAdCount = r.spinAdCount || 0;
  r.spinCredits = r.spinCredits || 0;
  return r;
}

// ---- Sessions de pub ------------------------------------------------------
// Une session est ouverte au démarrage de la vidéo et ne peut être encaissée
// qu'une fois, et seulement si le temps réel écoulé côté serveur couvre la
// durée. Avancer la vidéo côté client ne sert donc à rien.

/** @type {Map<string, {userId:number, kind:string, startedAt:number}>} */
const adSessions = new Map();

function purgeSessions() {
  const now = Date.now();
  for (const [id, s] of adSessions) {
    if (now - s.startedAt > 15 * 60 * 1000) adSessions.delete(id);
  }
}

// ---- État exposé au client ------------------------------------------------

export function rewardsState(userId) {
  const raw = getRewards(userId);
  if (!raw) {
    // Initialiser un objet vide si l'utilisateur n'a pas encore de récompenses
    return {
      social: {
        youtube: {
          url: CONFIG.youtubeUrl,
          reward: CONFIG.socialReward,
          claimed: false,
        },
        tiktok: {
          url: CONFIG.tiktokUrl,
          reward: CONFIG.socialReward,
          claimed: false,
        },
        dwellMs: CONFIG.socialDwellMs,
      },
      ad: {
        duration: CONFIG.adDuration,
        reward: CONFIG.adReward,
        used: 0,
        max: CONFIG.adMaxPerDay,
        left: CONFIG.adMaxPerDay,
      },
      wheel: {
        sectors: WHEEL.map((s) => ({ label: s.label, coins: s.coins })),
        freeSpinReady: true,
        freeSpinAt: null,
        credits: 0,
        spinsAvailable: 1,
        video: {
          duration: CONFIG.spinAdDuration,
          used: 0,
          max: CONFIG.spinAdMaxPerDay,
          left: CONFIG.spinAdMaxPerDay,
        },
      },
    };
  }
  
  const r = rollDay(raw);
  const now = Date.now();

  const freeSpinAt = (r.lastFreeSpin || 0) + CONFIG.freeSpinCooldownMs;
  const freeSpinReady = now >= freeSpinAt;

  return {
    social: {
      youtube: {
        url: CONFIG.youtubeUrl,
        reward: CONFIG.socialReward,
        claimed: Boolean(r.social?.youtube),
      },
      tiktok: {
        url: CONFIG.tiktokUrl,
        reward: CONFIG.socialReward,
        claimed: Boolean(r.social?.tiktok),
      },
      dwellMs: CONFIG.socialDwellMs,
    },
    ad: {
      duration: CONFIG.adDuration,
      reward: CONFIG.adReward,
      used: r.adCoinCount,
      max: CONFIG.adMaxPerDay,
      left: Math.max(0, CONFIG.adMaxPerDay - r.adCoinCount),
    },
    wheel: {
      sectors: WHEEL.map((s) => ({ label: s.label, coins: s.coins })),
      freeSpinReady,
      // null quand le tour gratuit est déjà dispo
      freeSpinAt: freeSpinReady ? null : freeSpinAt,
      credits: r.spinCredits,
      spinsAvailable: (freeSpinReady ? 1 : 0) + r.spinCredits,
      video: {
        duration: CONFIG.spinAdDuration,
        used: r.spinAdCount,
        max: CONFIG.spinAdMaxPerDay,
        left: Math.max(0, CONFIG.spinAdMaxPerDay - r.spinAdCount),
      },
    },
  };
}

// ---- Abonnements réseaux --------------------------------------------------

/**
 * Réclame la récompense d'abonnement.
 *
 * Important : on ne PEUT PAS vérifier techniquement qu'un abonnement a eu
 * lieu (TikTok n'expose aucune API pour ça, et YouTube demanderait que le
 * joueur se connecte à Google et t'autorise à lire ses abonnements). C'est
 * donc déclaratif : une seule fois par compte, après un temps d'attente
 * minimum sur la page du lien.
 */
export function claimSocial(userId, platform) {
  if (platform !== "youtube" && platform !== "tiktok") {
    return { error: "Plateforme inconnue" };
  }
  return updateRewards(userId, (raw) => {
    const r = rollDay(raw);
    if (r.social[platform]) return { error: "Récompense déjà réclamée" };

    const openedAt = r.socialOpened?.[platform];
    if (!openedAt) return { error: "Ouvre d'abord la chaîne avec le bouton" };
    if (Date.now() - openedAt < CONFIG.socialDwellMs) {
      const wait = Math.ceil((CONFIG.socialDwellMs - (Date.now() - openedAt)) / 1000);
      return { error: `Encore ${wait} s avant de pouvoir valider` };
    }

    r.social[platform] = new Date().toISOString();
    return { rewards: r, coins: CONFIG.socialReward, reward: CONFIG.socialReward };
  });
}

/** Enregistre le moment où le joueur a ouvert le lien (démarre le compte à rebours). */
export function markSocialOpened(userId, platform) {
  if (platform !== "youtube" && platform !== "tiktok") {
    return { error: "Plateforme inconnue" };
  }
  return updateRewards(userId, (raw) => {
    const r = rollDay(raw);
    if (r.social[platform]) return { error: "Récompense déjà réclamée" };
    r.socialOpened = r.socialOpened || {};
    // On ne réarme pas le chrono s'il tourne déjà : rouvrir le lien ne doit
    // pas repartir de zéro et frustrer le joueur.
    if (!r.socialOpened[platform]) r.socialOpened[platform] = Date.now();
    return { rewards: r, dwellMs: CONFIG.socialDwellMs, openedAt: r.socialOpened[platform] };
  });
}

// ---- Pubs récompensées ----------------------------------------------------

/** Ouvre une session de visionnage. `kind` vaut "coins" (30 s) ou "spin" (60 s). */
export function startAd(userId, kind) {
  if (kind !== "coins" && kind !== "spin") return { error: "Type de pub inconnu" };
  purgeSessions();

  const state = rewardsState(userId);
  if (!state) return { error: "Utilisateur introuvable" };

  if (kind === "coins" && state.ad.left <= 0) {
    return { error: `Limite atteinte : ${CONFIG.adMaxPerDay} pubs par jour` };
  }
  if (kind === "spin" && state.wheel.video.left <= 0) {
    return { error: `Limite atteinte : ${CONFIG.spinAdMaxPerDay} vidéos par jour` };
  }

  const id = randomUUID();
  adSessions.set(id, { userId, kind, startedAt: Date.now() });
  return {
    sessionId: id,
    duration: kind === "coins" ? CONFIG.adDuration : CONFIG.spinAdDuration,
  };
}

/**
 * Encaisse une session. Vérifie côté serveur que le temps est réellement
 * passé — le client ne peut ni accélérer ni rejouer une session.
 */
export function completeAd(userId, sessionId) {
  purgeSessions();
  const session = adSessions.get(sessionId);
  if (!session) return { error: "Session inconnue ou expirée, relance la vidéo" };
  if (session.userId !== userId) return { error: "Session invalide" };

  const duration = session.kind === "coins" ? CONFIG.adDuration : CONFIG.spinAdDuration;
  const elapsed = (Date.now() - session.startedAt) / 1000;
  // 1 s de tolérance pour la latence réseau.
  if (elapsed < duration - 1) {
    return { error: "Il faut regarder la vidéo en entier" };
  }

  // Consommée : impossible de la rejouer.
  adSessions.delete(sessionId);

  return updateRewards(userId, (raw) => {
    const r = rollDay(raw);
    if (session.kind === "coins") {
      if (r.adCoinCount >= CONFIG.adMaxPerDay) return { error: "Limite du jour atteinte" };
      r.adCoinCount++;
      return { rewards: r, coins: CONFIG.adReward, reward: CONFIG.adReward, kind: "coins" };
    }
    if (r.spinAdCount >= CONFIG.spinAdMaxPerDay) return { error: "Limite du jour atteinte" };
    r.spinAdCount++;
    r.spinCredits++;
    return { rewards: r, kind: "spin", credits: r.spinCredits };
  });
}

// ---- Roue -----------------------------------------------------------------

/**
 * Fait tourner la roue. Le secteur est tiré ICI : le client reçoit un index
 * et se contente d'animer la roue jusqu'à lui.
 * Consomme d'abord le tour gratuit, puis les tours gagnés en vidéo.
 */
export function spinWheel(userId) {
  return updateRewards(userId, (raw) => {
    const r = rollDay(raw);
    const now = Date.now();
    const freeReady = now >= (r.lastFreeSpin || 0) + CONFIG.freeSpinCooldownMs;

    let source;
    if (freeReady) {
      r.lastFreeSpin = now;
      source = "free";
    } else if (r.spinCredits > 0) {
      r.spinCredits--;
      source = "video";
    } else {
      return { error: "Aucun tour disponible. Regarde une vidéo ou reviens demain." };
    }

    const index = drawSector();
    const sector = WHEEL[index];
    return {
      rewards: r,
      coins: sector.coins,
      index,
      label: sector.label,
      won: sector.coins,
      source,
    };
  });
}
