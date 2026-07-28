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

  const serverUrl = process.env.NEXT_PUBLIC_POKER_URL || "http://localhost:4000";
  return <PokerClient serverUrl={serverUrl} />;
}
