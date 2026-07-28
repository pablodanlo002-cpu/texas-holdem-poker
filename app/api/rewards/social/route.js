import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session.js";
import { claimSocial, markSocialOpened, rewardsState } from "../../../../lib/rewards.js";

/**
 * Abonnements réseaux.
 *  - action "open"  : le joueur a cliqué sur le lien, on démarre le délai.
 *  - action "claim" : il valide et reçoit ses pièces (une seule fois).
 */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { platform, action } = body || {};
  const result = action === "open" ? markSocialOpened(user.id, platform) : claimSocial(user.id, platform);

  if (result?.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    reward: result.reward ?? 0,
    chips: result.chips ?? user.chips,
    rewards: rewardsState(user.id),
  });
}
