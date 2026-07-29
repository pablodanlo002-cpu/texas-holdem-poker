import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { findUserById, updateChips } from "../../../../lib/db.js";

const JWT_SECRET = process.env.JWT_SECRET;

console.log("[API /api/poker/chips] Route loaded ✓");

export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token manquant" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUserById(payload.id);

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({ chips: user.chips });
  } catch (error) {
    return NextResponse.json({ error: "Authentification échouée" }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token manquant" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUserById(payload.id);

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const newChips = body.chips;

    if (typeof newChips !== "number" || newChips < 0) {
      return NextResponse.json({ error: "Valeur invalide" }, { status: 400 });
    }

    updateChips(payload.id, newChips);

    return NextResponse.json({ success: true, chips: newChips });
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
