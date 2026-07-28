"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as SFX from "../poker/sound.js";
import "./rewards.css";

/**
 * Panneau « Gagner des pièces ».
 *
 * Aucun montant n'est calculé ici : chaque gain vient d'une réponse du
 * serveur, qui renvoie aussi le nouveau solde. Le composant ne fait
 * qu'afficher et déclencher.
 */
export default function RewardsModal({ onClose, onChips }) {
  const [tab, setTab] = useState("earn");
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(null); // { text } gain qui vient de tomber
  const [ad, setAd] = useState(null); // session de pub en cours
  
  // VERSION 2.6 - CENTRAGE ABSOLU avec top:50% left:50% transform
  useEffect(() => {
    console.log("RewardsModal v2.6 - CENTRAGE ABSOLU PARFAIT");
  }, []);

  const showError = useCallback((msg) => {
    setError(msg);
    setTimeout(() => setError(""), 3500);
  }, []);

  const celebrate = useCallback((text) => {
    setFlash({ text });
    setTimeout(() => setFlash(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rewards/state");
      const data = await res.json();
      if (!res.ok) return showError(data.error || "Erreur de chargement");
      setState(data.rewards);
      onChips?.(data.chips);
    } catch {
      showError("Connexion au serveur impossible");
    }
  }, [onChips, showError]);

  useEffect(() => {
    load();
    SFX.unlock();
  }, [load]);

  // Fermeture au clavier.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !ad) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, ad]);

  const post = useCallback(
    async (url, body) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {}),
        });
        const data = await res.json();
        if (!res.ok) {
          showError(data.error || "Action refusée");
          return null;
        }
        if (data.rewards) setState(data.rewards);
        if (typeof data.chips === "number") onChips?.(data.chips);
        return data;
      } catch {
        showError("Connexion au serveur impossible");
        return null;
      }
    },
    [onChips, showError]
  );

  // ---- Réseaux sociaux ----------------------------------------------------

  const openSocial = async (platform, url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    await post("/api/rewards/social", { platform, action: "open" });
  };

  const claimSocial = async (platform) => {
    const data = await post("/api/rewards/social", { platform, action: "claim" });
    if (data) {
      SFX.play("win");
      celebrate(`+${data.reward} pièces`);
    }
  };

  // ---- Pubs récompensées --------------------------------------------------

  const startAd = async (kind) => {
    const data = await post("/api/rewards/ad/start", { kind });
    if (data) setAd({ ...data, kind });
  };

  const finishAd = async (sessionId) => {
    setAd(null);
    const data = await post("/api/rewards/ad/complete", { sessionId });
    if (!data) return;
    if (data.kind === "coins") {
      SFX.play("chip");
      celebrate(`+${data.reward} pièces`);
    } else {
      SFX.play("yourTurn");
      celebrate("+1 tour de roue");
      setTab("wheel");
    }
  };

  return (
    <div className="rw-overlay" onClick={() => !ad && onClose()}>
      <div className="rw-modal" onClick={(e) => e.stopPropagation()}>
        <header className="rw-head">
          <div>
            <h2 className="rw-title">Gagner des pièces</h2>
            <p className="rw-sub">Des jetons virtuels, gratuits, sans achat.</p>
          </div>
          <button className="rw-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="rw-tabs">
          <button className={tab === "earn" ? "rw-tab on" : "rw-tab"} onClick={() => setTab("earn")}>
            🎁 Missions
          </button>
          <button className={tab === "wheel" ? "rw-tab on" : "rw-tab"} onClick={() => setTab("wheel")}>
            🎡 Roue{" "}
            {state?.wheel?.spinsAvailable > 0 && (
              <span className="rw-badge">{state.wheel.spinsAvailable}</span>
            )}
          </button>
        </div>

        {error && <div className="rw-error">{error}</div>}

        <div className="rw-body">
          {!state && <p className="rw-loading">Chargement...</p>}

          {state && tab === "earn" && (
            <EarnTab state={state} onOpen={openSocial} onClaim={claimSocial} onAd={startAd} />
          )}

          {state && tab === "wheel" && (
            <WheelTab
              state={state}
              onSpin={post}
              onVideo={() => startAd("spin")}
              onWin={(label, coins) => {
                SFX.play(coins > 0 ? "win" : "fold");
                celebrate(coins > 0 ? `+${coins} pièces` : "Perdu, retente !");
              }}
            />
          )}
        </div>
      </div>

      {flash && <div className="rw-flash">{flash.text}</div>}
      {ad && <AdPlayer session={ad} onDone={finishAd} onCancel={() => setAd(null)} />}
    </div>
  );
}

/* ===== Onglet missions ===================================================== */

function EarnTab({ state, onOpen, onClaim, onAd }) {
  return (
    <div className="rw-list">
      <SocialCard
        icon="▶"
        brand="youtube"
        name="Abonne-toi sur YouTube"
        desc="Ouvre la chaîne, abonne-toi, puis reviens valider."
        data={state.social.youtube}
        dwellMs={state.social.dwellMs}
        onOpen={() => onOpen("youtube", state.social.youtube.url)}
        onClaim={() => onClaim("youtube")}
      />

      <SocialCard
        icon="♪"
        brand="tiktok"
        name="Suis-moi sur TikTok"
        desc="Ouvre le profil, suis le compte, puis reviens valider."
        data={state.social.tiktok}
        dwellMs={state.social.dwellMs}
        onOpen={() => onOpen("tiktok", state.social.tiktok.url)}
        onClaim={() => onClaim("tiktok")}
      />

      <div className="rw-card">
        <span className="rw-ico ad">▶</span>
        <div className="rw-card-txt">
          <h3 className="rw-card-name">Regarder une pub</h3>
          <p className="rw-card-desc">
            {state.ad.duration} secondes de vidéo = {state.ad.reward} pièces.
          </p>
          <div className="rw-meter">
            <div className="rw-meter-bar">
              <span style={{ width: `${(state.ad.used / state.ad.max) * 100}%` }} />
            </div>
            <span className="rw-meter-txt">
              {state.ad.used} / {state.ad.max} aujourd'hui
            </span>
          </div>
        </div>
        <div className="rw-card-right">
          <span className="rw-gain">+{state.ad.reward}</span>
          <button className="rw-btn" disabled={state.ad.left <= 0} onClick={() => onAd("coins")}>
            {state.ad.left <= 0 ? "Demain" : "Regarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SocialCard({ icon, brand, name, desc, data, dwellMs, onOpen, onClaim }) {
  // Compte à rebours local, purement indicatif : c'est le serveur qui décide
  // si le délai est écoulé quand on valide.
  const [opened, setOpened] = useState(false);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!opened) return;
    setLeft(Math.ceil(dwellMs / 1000));
    const iv = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(iv);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [opened, dwellMs]);

  const handleOpen = () => {
    setOpened(true);
    onOpen();
  };

  return (
    <div className={`rw-card ${data.claimed ? "done" : ""}`}>
      <span className={`rw-ico ${brand}`}>{icon}</span>
      <div className="rw-card-txt">
        <h3 className="rw-card-name">{name}</h3>
        <p className="rw-card-desc">{desc}</p>
      </div>
      <div className="rw-card-right">
        <span className="rw-gain">+{data.reward}</span>
        {data.claimed ? (
          <span className="rw-done">✓ Réclamé</span>
        ) : !opened ? (
          <button className="rw-btn" onClick={handleOpen}>
            Ouvrir
          </button>
        ) : (
          <button className="rw-btn go" disabled={left > 0} onClick={onClaim}>
            {left > 0 ? `${left} s` : "Valider"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ===== Onglet roue ======================================================== */

function WheelTab({ state, onSpin, onVideo, onWin }) {
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const sectors = state.wheel.sectors;
  const step = 360 / sectors.length;

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const data = await onSpin("/api/rewards/wheel");
    if (!data) {
      setSpinning(false);
      return;
    }

    // Le secteur gagnant est déjà décidé par le serveur : on aligne son
    // milieu sous le repère du haut, après plusieurs tours complets.
    const target = (360 - (data.index * step + step / 2)) % 360;
    const delta = ((target - (rot % 360)) + 360) % 360;
    setRot(rot + 360 * 6 + delta);

    setTimeout(() => {
      setSpinning(false);
      setResult({ label: data.label, won: data.won });
      onWin(data.label, data.won);
    }, 4200);
  };

  const gradient = sectors
    .map((s, i) => {
      const color = s.coins === 0 ? "#252a33" : i % 2 === 0 ? "#1c6b45" : "#14563a";
      return `${color} ${i * step}deg ${(i + 1) * step}deg`;
    })
    .join(", ");

  return (
    <div className="rw-wheel-tab">
      <div className="rw-wheel-zone">
        <span className="rw-pointer" />
        <div
          className="rw-wheel"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${rot}deg)`,
            transition: spinning ? "transform 4s cubic-bezier(0.15, 0.9, 0.1, 1)" : "none",
          }}
        >
          {sectors.map((s, i) => (
            <span
              key={i}
              className={`rw-sector-label ${s.coins === 0 ? "empty" : ""}`}
              style={{ transform: `rotate(${i * step + step / 2}deg) translateY(-72px)` }}
            >
              {s.coins === 0 ? "✕" : s.label}
            </span>
          ))}
          <span className="rw-hub">🎡</span>
        </div>
      </div>

      <div className="rw-wheel-side">
        {result && (
          <div className={`rw-result ${result.won > 0 ? "win" : "lose"}`}>
            {result.won > 0 ? `Gagné : +${result.won} pièces !` : "Case vide — retente ta chance"}
          </div>
        )}

        <div className="rw-spin-count">
          <span className="rw-spin-num">{state.wheel.spinsAvailable}</span>
          <span className="rw-spin-lbl">
            tour{state.wheel.spinsAvailable > 1 ? "s" : ""} disponible
            {state.wheel.spinsAvailable > 1 ? "s" : ""}
          </span>
        </div>

        <button
          className="rw-spin-btn"
          disabled={spinning || state.wheel.spinsAvailable <= 0}
          onClick={spin}
        >
          {spinning ? "La roue tourne..." : "Tourner la roue"}
        </button>

        <div className="rw-wheel-info">
          {state.wheel.freeSpinReady ? (
            <p className="rw-free ok">🎁 Ton tour gratuit du jour est dispo</p>
          ) : (
            <Countdown at={state.wheel.freeSpinAt} />
          )}
          <p className="rw-note">
            Un tour gratuit toutes les 24 h. Une vidéo de {state.wheel.video.duration} s
            donne un tour de plus.
          </p>
        </div>

        <div className="rw-video-row">
          <div className="rw-meter">
            <div className="rw-meter-bar">
              <span style={{ width: `${(state.wheel.video.used / state.wheel.video.max) * 100}%` }} />
            </div>
            <span className="rw-meter-txt">
              {state.wheel.video.used} / {state.wheel.video.max} vidéos aujourd'hui
            </span>
          </div>
          <button className="rw-btn" disabled={state.wheel.video.left <= 0} onClick={onVideo}>
            {state.wheel.video.left <= 0 ? "Limite atteinte" : `▶ ${state.wheel.video.duration} s = +1 tour`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Countdown({ at }) {
  const [left, setLeft] = useState(Math.max(0, at - Date.now()));

  useEffect(() => {
    const iv = setInterval(() => setLeft(Math.max(0, at - Date.now())), 1000);
    return () => clearInterval(iv);
  }, [at]);

  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);

  return (
    <p className="rw-free">
      ⏳ Tour gratuit dans {h}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </p>
  );
}

/* ===== Lecteur de pub ===================================================== */

/**
 * Emplacement publicitaire récompensé.
 *
 * Il n'y a AUCUNE régie branchée : ce lecteur affiche un compte à rebours
 * (et la vidéo posée dans /public/ads si tu en mets une). Le crédit dépend
 * uniquement du temps réellement écoulé côté serveur, donc brancher une vraie
 * régie plus tard ne change que ce composant.
 *
 * Le décompte se met en pause si l'onglet passe en arrière-plan : impossible
 * de lancer la vidéo et d'aller faire autre chose.
 */
function AdPlayer({ session, onDone, onCancel }) {
  const [left, setLeft] = useState(session.duration);
  const [hidden, setHidden] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (hidden) return;
    const iv = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(iv);
          if (!doneRef.current) {
            doneRef.current = true;
            // Petite marge : le serveur compare au temps réel écoulé.
            setTimeout(() => onDone(session.sessionId), 400);
          }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [hidden, onDone, session.sessionId]);

  const pct = ((session.duration - left) / session.duration) * 100;

  return (
    <div className="rw-ad-overlay">
      <div className="rw-ad">
        <div className="rw-ad-head">
          <span className="rw-ad-tag">Publicité</span>
          <span className="rw-ad-left">{left} s</span>
        </div>

        <div className="rw-ad-screen">
          <div className="rw-ad-anim">
            <span className="rw-ad-coin">🪙</span>
          </div>
          <p className="rw-ad-msg">
            {hidden
              ? "Reviens sur l'onglet pour continuer"
              : session.kind === "coins"
                ? "Ta récompense arrive à la fin"
                : "Un tour de roue à la fin"}
          </p>
        </div>

        <div className="rw-ad-progress">
          <span style={{ width: `${pct}%` }} />
        </div>

        <button className="rw-ad-cancel" onClick={onCancel}>
          Annuler (aucune récompense)
        </button>
      </div>
    </div>
  );
}
