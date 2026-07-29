import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import "../globals.css";
import PokerClient from "./PokerClient";

export default async function PokerPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");
  if (!token) redirect("/");

  try {
    jwt.verify(token.value, process.env.JWT_SECRET);
  } catch {
    redirect("/");
  }

  // Le serveur poker est déployé séparément, on utilise la variable d'environnement
  const serverUrl = process.env.NEXT_PUBLIC_POKER_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return <PokerClient serverUrl={serverUrl} />;
}
