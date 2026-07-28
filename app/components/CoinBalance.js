"use client";

import { useState } from "react";
import RewardsModal from "./RewardsModal.js";

/**
 * Solde de jetons + bouton « + » qui ouvre le panneau de gains.
 * Le solde est repris du serveur à chaque récompense, jamais calculé ici.
 */
export default function CoinBalance({ chips: initial }) {
  const [chips, setChips] = useState(typeof initial === "number" ? initial : 0);
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);

  const onChips = (value) => {
    if (typeof value !== "number" || value === chips) return;
    setChips(value);
    setBump(true);
    setTimeout(() => setBump(false), 600);
  };

  return (
    <>
      <span className={`chip-pill ${bump ? "bump" : ""}`} title="Ton solde de jetons">
        <span className="chip-icon">🪙</span>
        {chips.toLocaleString("fr-FR")}
        <button
          className="chip-plus"
          onClick={() => setOpen(true)}
          title="Gagner des pièces"
          aria-label="Gagner des pièces"
        >
          +
        </button>
      </span>

      {open && <RewardsModal onClose={() => setOpen(false)} onChips={onChips} />}
    </>
  );
}
