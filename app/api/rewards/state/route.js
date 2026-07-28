import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session.js";
import { rewardsState } from "../../../../lib/rewards.js";

/** État complet des gains disponibles pour le joueur connecté. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  return NextResponse.json({
    chips: user.chips,
    rewards: rewardsState(user.id),
  });
}
