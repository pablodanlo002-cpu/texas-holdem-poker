import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data.json");

const STARTING_CHIPS = 5000;
// Version du barème de jetons. Sert à n'appliquer la migration qu'une fois.
const CHIPS_VERSION = 4;

function load() {
  if (fs.existsSync(DB_PATH)) {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    let changed = false;
    for (const u of data.users) {
      // Backfill : comptes créés avant l'ajout des jetons.
      if (typeof u.chips !== "number") {
        u.chips = STARTING_CHIPS;
        changed = true;
      }
      // Migration unique vers le nouveau départ à 5000 : tout compte encore
      // en dessous est remonté au stack de départ (personne n'est pénalisé
      // d'avoir joué avant le changement).
      if (u.chipsVersion !== CHIPS_VERSION) {
        if (u.chips < STARTING_CHIPS) u.chips = STARTING_CHIPS;
        u.chipsVersion = CHIPS_VERSION;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return data;
  }
  const data = { users: [], nextId: 1 };
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function norm(value) {
  return String(value).toLowerCase().trim();
}

export function findUserByEmail(email) {
  const e = norm(email);
  return load().users.find((u) => u.email === e) || null;
}

export function findUserByUsername(username) {
  const u = norm(username);
  return load().users.find((x) => x.username === u) || null;
}

export function findUserById(id) {
  return load().users.find((u) => u.id === id) || null;
}

/**
 * Crée un utilisateur en garantissant l'unicité du username ET de l'email.
 * Lève une Error avec code "DUPLICATE_USERNAME" ou "DUPLICATE_EMAIL".
 */
export function createUser(username, email, hashedPassword, discordId) {
  const data = load();
  const u = norm(username);
  const e = norm(email);

  if (data.users.some((x) => x.username === u)) {
    const err = new Error("Username déjà pris");
    err.code = "DUPLICATE_USERNAME";
    throw err;
  }
  if (data.users.some((x) => x.email === e)) {
    const err = new Error("Email déjà utilisé");
    err.code = "DUPLICATE_EMAIL";
    throw err;
  }

  const user = {
    id: data.nextId++,
    username: u,
    email: e,
    password: hashedPassword,
    discord_id: discordId,
    chips: STARTING_CHIPS,
    chipsVersion: CHIPS_VERSION,
    created_at: new Date().toISOString(),
  };
  data.users.push(user);
  save(data);
  return user;
}

/**
 * Met à jour le solde de jetons d'un utilisateur (jetons persistants).
 */
export function updateChips(id, chips) {
  const data = load();
  const user = data.users.find((u) => u.id === id);
  if (!user) return null;
  user.chips = Math.max(0, Math.round(chips));
  save(data);
  return user.chips;
}

/**
 * Crédite (ou débite) des jetons en une seule lecture/écriture.
 * À préférer à un findUserById + updateChips : ça évite qu'un calcul soit
 * fait sur un solde périmé entre les deux appels.
 */
export function addChips(id, delta) {
  const data = load();
  const user = data.users.find((u) => u.id === id);
  if (!user) return null;
  user.chips = Math.max(0, Math.round(user.chips + delta));
  save(data);
  return user.chips;
}

/**
 * Lit l'état des récompenses d'un utilisateur (objet libre, jamais null).
 */
export function getRewards(id) {
  const user = load().users.find((u) => u.id === id);
  if (!user) return null;
  return user.rewards ? structuredClone(user.rewards) : {};
}

/**
 * Applique une transformation sur l'état des récompenses ET le solde en même
 * temps, sous une seule lecture/écriture du fichier.
 *
 * `mutate(rewards, user)` reçoit l'état courant et doit renvoyer
 * `{ rewards, coins? , ...reste }`. `coins` est le delta de jetons à créditer.
 * Le reste de l'objet renvoyé est transmis tel quel à l'appelant, ce qui
 * permet à la logique métier de remonter un résultat (lot gagné, erreur…).
 */
export function updateRewards(id, mutate) {
  const data = load();
  const user = data.users.find((u) => u.id === id);
  if (!user) return { error: "Utilisateur introuvable" };

  const current = user.rewards ? structuredClone(user.rewards) : {};
  const result = mutate(current, user) || {};
  if (result.error) return result;

  user.rewards = result.rewards ?? current;
  if (typeof result.coins === "number" && result.coins !== 0) {
    user.chips = Math.max(0, Math.round(user.chips + result.coins));
  }
  save(data);
  return { ...result, chips: user.chips };
}
