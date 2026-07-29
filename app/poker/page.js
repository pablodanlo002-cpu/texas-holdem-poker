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

  // Le serveur poker tourne sur le même conteneur, port 4000, Next.js proxy via rewrites
  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";
  return <PokerClient serverUrl={serverUrl} />;
}
