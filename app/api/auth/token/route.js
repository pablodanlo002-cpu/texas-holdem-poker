import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

/**
 * Renvoie le JWT au client authentifié (cookie httpOnly -> handshake Socket.IO).
 * Le token n'est jamais exposé à un utilisateur non connecté.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");

  if (!token) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const user = jwt.verify(token.value, process.env.JWT_SECRET);
    return NextResponse.json({ token: token.value, username: user.username });
  } catch {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }
}
