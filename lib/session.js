import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import { findUserById } from "./db.js";

/**
 * Lit le cookie httpOnly, vérifie le JWT et renvoie l'utilisateur en base.
 * Redirige vers l'accueil publique si la session est absente ou invalide.
 * À utiliser dans les pages serveur protégées.
 */
export async function requireUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");
  if (!token) redirect("/");

  let payload;
  try {
    payload = jwt.verify(token.value, process.env.JWT_SECRET);
  } catch {
    redirect("/");
  }

  const user = findUserById(payload.id);
  if (!user) redirect("/");
  return user;
}

/**
 * Même vérification, mais sans redirection : renvoie l'utilisateur ou null.
 * À utiliser dans les routes d'API, où il faut répondre 401 plutôt que
 * rediriger vers une page HTML.
 */
export async function currentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");
  if (!token) return null;
  try {
    const payload = jwt.verify(token.value, process.env.JWT_SECRET);
    return findUserById(payload.id);
  } catch {
    return null;
  }
}
