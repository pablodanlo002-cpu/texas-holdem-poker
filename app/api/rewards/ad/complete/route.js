import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/session.js";
import { completeAd, rewardsState } from "../../../../../lib/rewards.js";

/** Encaisse une session de visionnage (le serveur vérifie le temps écoulé). */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const result = completeAd(user.id, body?.sessionId);
  if (result?.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    kind: result.kind,
    reward: result.reward ?? 0,
    chips: result.chips,
    rewards: rewardsState(user.id),
  });
}
