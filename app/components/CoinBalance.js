"use client";

import { useState } from "react";

/**
 * Solde de jetons simple sans bouton de rewards.
 * Les rewards sont maintenant dans le poker.
 */
export default function CoinBalance({ chips: initial }) {
  const [chips] = useState(typeof initial === "number" ? initial : 0);

  return (
    <span className="chip-pill" title="Ton solde de jetons">
      <span className="chip-icon">🪙</span>
      {chips.toLocaleString("fr-FR")}
    </span>
  );
}
