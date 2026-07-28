import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/session.js";
import { startAd } from "../../../../../lib/rewards.js";

/** Ouvre une session de visionnage (le chrono part côté serveur). */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const result = startAd(user.id, body?.kind);
  if (result?.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
