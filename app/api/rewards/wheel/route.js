import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session.js";
import { spinWheel, rewardsState } from "../../../../lib/rewards.js";

/**
 * Fait tourner la roue. Le secteur gagnant est tiré côté serveur ; la réponse
 * contient son index pour que le client anime la roue jusqu'à lui.
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const result = spinWheel(user.id);
  if (result?.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    index: result.index,
    label: result.label,
    won: result.won,
    source: result.source,
    chips: result.chips,
    rewards: rewardsState(user.id),
  });
}
