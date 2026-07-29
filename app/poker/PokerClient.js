"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import * as SFX from "./sound";
import "./poker.css";

// Positions visuelles autour de l'ovale (en % du feutre) pour chaque taille de
// table. L'index 0 = bas-centre : on y place TOUJOURS le joueur local.
const LAYOUTS = {
  2: [
    { left: 50, top: 90 },
    { left: 50, top: 10 },
  ],
  4: [
    { left: 50, top: 90 },
    { left: 8, top: 45 },
    { left: 50, top: 8 },
    { left: 92, top: 45 },
  ],
  6: [
    { left: 50, top: 92 },
    { left: 10, top: 72 },
    { left: 8, top: 30 },
    { left: 50, top: 8 },
    { left: 92, top: 30 },
    { left: 90, top: 72 },
  ],
  9: [
    { left: 50, top: 93 },
    { left: 20, top: 86 },
    { left: 5, top: 55 },
    { left: 10, top: 22 },
    { left: 34, top: 7 },
    { left: 66, top: 7 },
    { left: 90, top: 22 },
    { left: 95, top: 55 },
    { left: 80, top: 86 },
  ],
};

function layoutFor(maxSeats) {
  if (LAYOUTS[maxSeats]) return LAYOUTS[maxSeats];
  // Sinon, répartition ovale générique.
  const arr = [];
  for (let i = 0; i < maxSeats; i++) {
    const angle = Math.PI / 2 + (i / maxSeats) * 2 * Math.PI;
    arr.push({
      left: 50 + 46 * Math.cos(angle),
      top: 50 + 44 * Math.sin(angle),
    });
  }
  return arr;
}

export default function PokerClient({ serverUrl }) {
  const [status, setStatus] = useState("connexion...");
  const [me, setMe] = useState(null);
  const [tables, setTables] = useState([]);
  const [stakes, setStakes] = useState([]);
  const [table, setTable] = useState(null);
  const [error, setError] = useState("");
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [buyInFor, setBuyInFor] = useState(null); // table summary en attente de buy-in
  const [pendingCode, setPendingCode] = useState(null); // code à joindre au table:join
  const [createdCode, setCreatedCode] = useState(null); // code d'une partie privée créée
  const [codeInput, setCodeInput] = useState("");
  const [filter, setFilter] = useState("all");
  const [showRebuy, setShowRebuy] = useState(false);
  const [muted, setMuted] = useState(false);
  const socketRef = useRef(null);
  const sfxRef = useRef(null); // dernier état sonorisé, pour jouer les diffs

  // Préférence de son, conservée entre les sessions.
  useEffect(() => {
    const saved = localStorage.getItem("poker:muted") === "1";
    setMuted(saved);
    SFX.setMuted(saved);
    const wake = () => SFX.unlock();
    window.addEventListener("pointerdown", wake, { once: true });
    return () => window.removeEventListener("pointerdown", wake);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    SFX.setMuted(next);
    localStorage.setItem("poker:muted", next ? "1" : "0");
    if (!next) SFX.play("chip");
  };

  useEffect(() => {
    let socket;
    (async () => {
      let token;
      try {
        const res = await fetch("/api/auth/token");
        if (!res.ok) throw new Error();
        token = (await res.json()).token;
      } catch {
        setStatus("non authentifié — reconnecte-toi");
        return;
      }

      socket = io(serverUrl, { 
        auth: { token },
        transports: ["websocket", "polling"]
      });
      socketRef.current = socket;

      socket.on("connect", () => setStatus("connecté"));
      socket.on("connect_error", (e) => setStatus("erreur : " + e.message));
      socket.on("disconnect", () => setStatus("déconnecté"));
      socket.on("me", (data) => setMe(data));
      socket.on("lobby:stakes", (list) => setStakes(list));
      socket.on("lobby:tables", (list) => setTables(list));
      socket.on("table:state", (state) => setTable(state));
      socket.on("table:joined", () => {
        setBuyInFor(null);
        setPendingCode(null);
      });
      socket.on("lobby:created", ({ code, isPrivate, summary }) => {
        // La table privée affiche d'abord son code, la publique va au buy-in.
        setPendingCode(code || null);
        if (isPrivate) setCreatedCode({ code, summary });
        else setBuyInFor(summary);
      });
      socket.on("lobby:codeResult", ({ error: err, summary, code }) => {
        if (err) {
          setError(err);
          setTimeout(() => setError(""), 3500);
          return;
        }
        setPendingCode(code);
        setBuyInFor(summary);
        setCodeInput("");
      });
      socket.on("error:msg", (msg) => {
        setError(msg);
        setTimeout(() => setError(""), 3500);
      });
      socket.on("poker:wheelResult", ({ won }) => {
        setError(`🎰 Tu as gagné ${won} coins !`);
        setTimeout(() => setError(""), 3500);
      });
    })();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [serverUrl]);

  const emit = (event, payload) => socketRef.current?.emit(event, payload);

  // ---- Sons : on compare l'état reçu au précédent et on sonorise les diffs.
  // Le serveur envoie `actionSeq`, un compteur monotone : il dit exactement
  // combien de lignes du journal sont nouvelles (le journal, lui, est tronqué).
  useEffect(() => {
    if (!table) {
      sfxRef.current = null;
      return;
    }
    const myIndex = table.seats.findIndex((s) => s && s.isMe);
    const snap = {
      seq: table.actionSeq || 0,
      community: table.community.length,
      handActive: table.handActive,
      myTurn: table.handActive && !table.paused && table.currentTurn === myIndex,
    };
    const prev = sfxRef.current;
    sfxRef.current = snap;
    if (!prev) return; // premier état reçu : on ne rejoue pas le passé

    // Nouvelle main : le paquet est mélangé et distribué.
    if (snap.handActive && !prev.handActive) SFX.play("shuffle");

    // Cartes communes : une par une, pour entendre le flop tomber.
    if (snap.community > prev.community) {
      const n = snap.community - prev.community;
      for (let i = 0; i < n; i++) SFX.play("deal", i * 180);
    }

    // Actions des joueurs, lues dans le journal.
    const fresh = snap.seq - prev.seq;
    if (fresh > 0) {
      const lines = table.actionLog.slice(-Math.min(fresh, table.actionLog.length));
      lines.slice(-3).forEach((line, i) => {
        const at = i * 140;
        if (/se couche/.test(line)) SFX.play("fold", at);
        else if (/check/.test(line)) SFX.play("check", at);
        else if (/tapis/.test(line)) SFX.play("allin", at);
        else if (/relance/.test(line)) SFX.play("raise", at);
        else if (/suit/.test(line)) SFX.play("chip", at);
      });
    }

    // Fin de main : fanfare si c'est moi qui rafle le pot.
    if (!snap.handActive && prev.handActive && table.lastWinners?.length) {
      const iWon = table.lastWinners.some((w) => String(w.userId) === String(me?.id));
      SFX.play(iWon ? "win" : "endHand", 300);
    }

    // C'est à moi : signal sonore clair.
    if (snap.myTurn && !prev.myTurn) SFX.play("yourTurn");
  }, [table, me]);

  // ---- Vue lobby ----------------------------------------------------------
  if (!table) {
    const stakeOf = (t) => stakes.find((s) => s.bigBlind === t.bigBlind);
    const visible =
      filter === "all" ? tables : tables.filter((t) => stakeOf(t)?.key === filter);
    const affordable = tables.filter((t) => !me || me.chips >= t.minBuyIn).length;
    const livePlayers = tables.reduce((n, t) => n + t.humans, 0);

    return (
      <div className="poker-lobby">
        <header className="lobby-top">
          <a href="/dashboard" className="lobby-back">←</a>
          <div className="lobby-brand">
            <span className="lobby-brand-logo">♠</span>
            <div>
              <h1>Salles de poker</h1>
              <p>Texas Hold&apos;em No-Limit · cash game</p>
            </div>
          </div>
          <div className="lobby-top-right">
            {me && (
              <span className="lobby-bank">
                <em>Bankroll</em>
                <strong>{me.chips.toLocaleString()} 🪙</strong>
              </span>
            )}
            <span className={`conn-dot ${status === "connecté" ? "on" : "off"}`} title={status} />
          </div>
        </header>

        {error && <div className="poker-error">{error}</div>}

        <section className="lobby-hero">
          <button className="hero-card create" onClick={() => setShowCreate(true)}>
            <span className="hero-ico">🎴</span>
            <span className="hero-txt">
              <strong>Créer une table</strong>
              <em>Publique ou privée entre amis</em>
            </span>
            <span className="hero-go">+</span>
          </button>

          <form
            className="hero-card join-code"
            onSubmit={(e) => {
              e.preventDefault();
              if (codeInput.trim().length >= 4) emit("lobby:findCode", { code: codeInput });
            }}
          >
            <span className="hero-ico">🔑</span>
            <span className="hero-txt">
              <strong>Partie privée</strong>
              <em>Entre le code reçu par un ami</em>
            </span>
            <input
              className="code-input"
              placeholder="ABC123"
              maxLength={6}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button className="code-go" type="submit" disabled={codeInput.trim().length < 4}>
              Go
            </button>
          </form>
        </section>

        <section className="lobby-bar">
          <div className="stake-filters">
            <button
              className={`filter-pill ${filter === "all" ? "sel" : ""}`}
              onClick={() => setFilter("all")}
            >
              Toutes
            </button>
            {stakes.map((s) => (
              <button
                key={s.key}
                className={`filter-pill ${filter === s.key ? "sel" : ""}`}
                onClick={() => setFilter(s.key)}
              >
                {s.label} <em>{s.smallBlind}/{s.bigBlind}</em>
              </button>
            ))}
          </div>
          <div className="lobby-stats">
            <span>{tables.length} table{tables.length > 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{livePlayers} joueur{livePlayers > 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{affordable} accessible{affordable > 1 ? "s" : ""}</span>
            
            {/* Boutons rewards */}
            <button 
              className="reward-btn youtube" 
              onClick={() => {
                window.open("https://www.youtube.com/@TechNova-d2o", "_blank");
                emit("poker:reward", { type: "youtube" });
              }}
              title="S'abonner sur YouTube (+500 coins)"
            >
              ▶️ YouTube
            </button>
            <button 
              className="reward-btn tiktok" 
              onClick={() => {
                window.open("https://www.tiktok.com/@coucou0534", "_blank");
                emit("poker:reward", { type: "tiktok" });
              }}
              title="Suivre sur TikTok (+500 coins)"
            >
              🎵 TikTok
            </button>
            <button 
              className="reward-btn wheel" 
              onClick={() => emit("poker:spinWheel")}
              title="Tourner la roue (gratuit 1x par jour)"
            >
              🎰 Roue
            </button>
            
            <button 
              className="recharge-btn sm" 
              onClick={() => emit("me:refresh")}
              title="Rafraîchir le solde"
            >
              🔄
            </button>
            {me && me.chips < 1000 && (
              <button className="recharge-btn sm" onClick={() => emit("me:recharge")}>
                🎁 +2000
              </button>
            )}
          </div>
        </section>

        <section className="table-grid">
          {visible.length === 0 && (
            <div className="lobby-empty">
              <span className="empty-ico">🃏</span>
              <strong>
                {tables.length === 0
                  ? "Aucune table ouverte"
                  : "Aucune table à ce niveau de blinds"}
              </strong>
              <p>
                Crée la tienne : des bots viennent s&apos;asseoir tant que tu es seul,
                et ils laissent leur place dès qu&apos;un ami arrive.
              </p>
              <button className="btn-lobby-primary" onClick={() => setShowCreate(true)}>
                Créer une table
              </button>
            </div>
          )}

          {visible.map((t) => {
            const full = t.players >= t.maxSeats && t.bots === 0;
            const tooRich = me ? me.chips < t.minBuyIn : false;
            const stake = stakeOf(t);
            return (
              <article key={t.id} className={`table-card ${tooRich ? "locked" : ""}`}>
                <div className="tc-head">
                  <div>
                    <h3>{t.name}</h3>
                    <span className="tc-blinds">
                      {stake ? `${stake.label} · ` : ""}blinds {t.smallBlind}/{t.bigBlind}
                    </span>
                  </div>
                  {t.handActive ? (
                    <span className="tc-live">● EN JEU</span>
                  ) : (
                    <span className="tc-idle">en attente</span>
                  )}
                </div>

                <div className="tc-seats">
                  {Array.from({ length: t.maxSeats }).map((_, i) => {
                    const kind = i < t.humans ? "human" : i < t.humans + t.bots ? "bot" : "free";
                    return <span key={i} className={`seat-dot ${kind}`} />;
                  })}
                  <span className="tc-seat-count">
                    {t.players}/{t.maxSeats}
                  </span>
                </div>

                <div className="tc-rows">
                  <div className="tc-row">
                    <em>Buy-in</em>
                    <strong className={tooRich ? "warn" : ""}>
                      {t.minBuyIn.toLocaleString()} – {t.maxBuyIn.toLocaleString()} 🪙
                    </strong>
                  </div>
                  <div className="tc-row">
                    <em>Table</em>
                    <strong>
                      {t.humans} humain{t.humans > 1 ? "s" : ""}
                      {t.bots > 0 ? ` · ${t.bots} 🤖` : ""}
                    </strong>
                  </div>
                  {t.handActive && t.pot > 0 && (
                    <div className="tc-row">
                      <em>Pot en cours</em>
                      <strong className="gold">{t.pot.toLocaleString()} 🪙</strong>
                    </div>
                  )}
                </div>

                {tooRich && (
                  <div className="tc-lock">
                    🔒 il te manque {(t.minBuyIn - me.chips).toLocaleString()} 🪙
                  </div>
                )}

                <button
                  className="tc-join"
                  disabled={full || tooRich}
                  onClick={() => {
                    setPendingCode(null);
                    setBuyInFor(t);
                  }}
                >
                  {full ? "Table pleine" : tooRich ? "Trop cher" : "Rejoindre"}
                </button>
              </article>
            );
          })}
        </section>

        {showCreate && (
          <CreateTableModal
            stakes={stakes}
            onClose={() => setShowCreate(false)}
            onCreate={(cfg) => {
              emit("lobby:create", cfg);
              setShowCreate(false);
            }}
          />
        )}

        {createdCode && (
          <CodeModal
            code={createdCode.code}
            table={createdCode.summary}
            onClose={() => setCreatedCode(null)}
            onContinue={() => {
              setBuyInFor(createdCode.summary);
              setCreatedCode(null);
            }}
          />
        )}

        {buyInFor && me && (
          <BuyInModal
            table={buyInFor}
            bankroll={me.chips}
            code={pendingCode}
            onClose={() => setBuyInFor(null)}
            onConfirm={(amount) =>
              emit("table:join", { tableId: buyInFor.id, buyIn: amount, code: pendingCode })
            }
          />
        )}
      </div>
    );
  }

  // ---- Vue table ----------------------------------------------------------
  const mySeat = table.seats.find((s) => s && s.isMe);
  const myIndex = table.seats.findIndex((s) => s && s.isMe);
  // Pendant une pause (cartes qui tombent, abattage) le serveur refuse les
  // actions : on masque les contrôles pour ne pas proposer un clic mort.
  const isMyTurn = table.currentTurn === myIndex && table.handActive && !table.paused;
  const toCall = mySeat ? table.currentBet - mySeat.bet : 0;
  const minRaise = table.currentBet + table.bigBlind;
  const maxRaise = mySeat ? mySeat.bet + mySeat.chips : 0;
  const positions = layoutFor(table.maxSeats);

  // Rotation : le joueur local est au bas de la table (position 0).
  const rotate = (i) => {
    const base = myIndex >= 0 ? myIndex : 0;
    return (i - base + table.maxSeats) % table.maxSeats;
  };

  const clampRaise = (v) => Math.min(Math.max(v, minRaise), maxRaise);
  const potRaise = (frac) => clampRaise(table.currentBet + Math.round((table.pot + toCall) * frac));

  return (
    <div className="poker-room">
      <div className="room-topbar">
        <button className="leave-btn" onClick={() => { emit("table:leave"); setTable(null); }}>
          ← Quitter
        </button>
        <span className="room-title">
          {table.name} · blinds {table.smallBlind}/{table.bigBlind}
          {table.isPrivate && table.code && (
            <button
              className="room-code"
              title="Copier le code pour inviter un ami"
              onClick={() => navigator.clipboard?.writeText(table.code)}
            >
              🔑 {table.code}
            </button>
          )}
        </span>
        <div className="topbar-right">
          <button
            className={`sound-btn ${muted ? "off" : ""}`}
            onClick={toggleMute}
            title={muted ? "Activer le son" : "Couper le son"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {mySeat && me && (
            <button
              className="rebuy-btn"
              disabled={me.chips <= 0 || mySeat.chips >= table.maxBuyIn}
              onClick={() => setShowRebuy(true)}
              title={
                mySeat.chips >= table.maxBuyIn
                  ? "Stack déjà au maximum de la table"
                  : "Ajouter des jetons depuis ta bankroll"
              }
            >
              ➕ Recharger
            </button>
          )}
          {me && <span className="bankroll sm">💰 {me.chips.toLocaleString()}</span>}
          <span className="conn-status">{status}</span>
        </div>
      </div>

      {error && <div className="poker-error floating">{error}</div>}

      <div className="felt-wrap">
        <div className="felt-oval">
          <div className="felt-logo">♠</div>

          {/* Centre : pot + cartes communes */}
          <div className="board-center">
            {table.pot > 0 && <div className="pot-badge">Pot : {table.pot.toLocaleString()}</div>}
            <div className="community">
              {table.community.map((c, i) => <Card key={i} code={c} />)}
            </div>
            {table.phase && table.phase !== "waiting" && (
              <div className="phase-label">{phaseLabel(table.phase)}</div>
            )}
            {!table.handActive && table.lastWinners && (
              <div className="winners">
                {table.lastWinners.map((w, i) => (
                  <div key={i}>🏆 {w.username} +{w.amount}{w.hand ? ` · ${w.hand}` : ""}</div>
                ))}
              </div>
            )}
            {!table.handActive && !table.lastWinners && (
              <div className="phase-label">{table.message}</div>
            )}
          </div>

          {/* Sièges positionnés autour de l'ovale */}
          {table.seats.map((s, i) => {
            const pos = positions[rotate(i)] || positions[0];
            return (
              <div
                key={i}
                className="seat-anchor"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              >
                <Seat
                  seat={s}
                  index={i}
                  isDealer={i === table.dealerIndex && table.handActive}
                  isTurn={i === table.currentTurn && table.handActive}
                  turnDeadline={i === table.currentTurn ? table.turnDeadline : null}
                />
              </div>
            );
          })}

          {/* Mises engagées, poussées vers le centre */}
          {table.seats.map((s, i) => {
            if (!s || !s.bet) return null;
            const pos = positions[rotate(i)] || positions[0];
            const left = pos.left + (50 - pos.left) * 0.32;
            const top = pos.top + (50 - pos.top) * 0.32;
            return (
              <div key={`bet-${i}`} className="bet-chip" style={{ left: `${left}%`, top: `${top}%` }}>
                🪙 {s.bet}
              </div>
            );
          })}
        </div>

        {/* Journal des actions */}
        {table.actionLog && table.actionLog.length > 0 && (
          <div className="action-log">
            {table.actionLog.slice(-6).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>

      {/* Hauteur figée : les contrôles apparaissent SANS pousser le feutre. */}
      <div className="action-bar">
        <div className={`action-slot ${isMyTurn ? "live" : ""}`}>
          {mySeat && (
            <button 
              className="btn-leave-table" 
              onClick={() => {
                emit("table:leave");
                emit("me:refresh"); // Rafraîchir le solde après avoir quitté
              }}
              title="Quitter la table"
            >
              ← Lobby
            </button>
          )}
          {!mySeat && <span className="waiting">👀 Tu regardes la partie.</span>}
          {mySeat && table.paused && (
            <span className="waiting">
              {table.handActive ? "Distribution..." : "Fin de la main..."}
            </span>
          )}
          {mySeat && !table.paused && !table.handActive && (
            <span className="waiting">En attente de la prochaine main...</span>
          )}
          {mySeat && !table.paused && table.handActive && !isMyTurn && (
            <span className="waiting">En attente des autres joueurs...</span>
          )}
          {mySeat && isMyTurn && (
            <div className="controls">
              <div className="control-row">
                <button className="act fold" onClick={() => emit("table:action", { action: "fold" })}>
                  Se coucher
                </button>
                {toCall === 0 ? (
                  <button className="act check" onClick={() => emit("table:action", { action: "check" })}>
                    Check
                  </button>
                ) : (
                  <button className="act call" onClick={() => emit("table:action", { action: "call" })}>
                    Suivre {toCall > mySeat.chips ? mySeat.chips : toCall}
                  </button>
                )}
                {maxRaise > table.currentBet && (
                  <button
                    className="act raise"
                    onClick={() => emit("table:action", { action: "raise", amount: clampRaise(raiseAmount || minRaise) })}
                  >
                    {clampRaise(raiseAmount || minRaise) >= maxRaise ? "All-in" : "Relancer"} à {clampRaise(raiseAmount || minRaise)}
                  </button>
                )}
              </div>

              {/* Espace réservé même sans sizer, pour garder la hauteur stable. */}
              <div className="bet-sizer">
                {maxRaise > table.currentBet && (
                  <>
                    <div className="quick-bets">
                      <button onClick={() => setRaiseAmount(minRaise)}>Min</button>
                      <button onClick={() => setRaiseAmount(potRaise(0.5))}>½ Pot</button>
                      <button onClick={() => setRaiseAmount(potRaise(0.75))}>¾ Pot</button>
                      <button onClick={() => setRaiseAmount(potRaise(1))}>Pot</button>
                      <button onClick={() => setRaiseAmount(maxRaise)}>All-in</button>
                    </div>
                    <div className="slider-row">
                      <input
                        type="range"
                        min={minRaise}
                        max={maxRaise}
                        step={table.smallBlind}
                        value={clampRaise(raiseAmount || minRaise)}
                        onChange={(e) => setRaiseAmount(Number(e.target.value))}
                      />
                      <span className="raise-value">{clampRaise(raiseAmount || minRaise)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showRebuy && mySeat && me && (
        <RebuyModal
          table={table}
          stack={mySeat.chips}
          bankroll={me.chips}
          onClose={() => setShowRebuy(false)}
          onConfirm={(amount) => {
            emit("table:addChips", { amount });
            setShowRebuy(false);
          }}
        />
      )}
    </div>
  );
}

function phaseLabel(phase) {
  return {
    preflop: "Pré-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Abattage",
  }[phase] || phase;
}

// ---- Modales ---------------------------------------------------------------

function CreateTableModal({ stakes, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [stakeKey, setStakeKey] = useState(stakes[1]?.key || stakes[0]?.key);
  const [seats, setSeats] = useState(6);
  const [isPrivate, setIsPrivate] = useState(false);
  const [withBots, setWithBots] = useState(true);
  const stake = stakes.find((s) => s.key === stakeKey) || stakes[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Créer une table</h2>
        <p className="modal-sub">
          Buy-in automatique : 10 à 100 big blinds
          {stake ? ` (${(stake.bigBlind * 10).toLocaleString()} – ${(stake.bigBlind * 100).toLocaleString()} 🪙)` : ""}
        </p>

        <label className="field-label">Visibilité</label>
        <div className="visi-grid">
          <button
            className={`visi-opt ${!isPrivate ? "sel" : ""}`}
            onClick={() => setIsPrivate(false)}
          >
            <span className="visi-ico">🌍</span>
            <strong>Publique</strong>
            <em>Visible par tous dans le lobby</em>
          </button>
          <button
            className={`visi-opt ${isPrivate ? "sel" : ""}`}
            onClick={() => setIsPrivate(true)}
          >
            <span className="visi-ico">🔒</span>
            <strong>Privée</strong>
            <em>Accessible seulement avec un code</em>
          </button>
        </div>

        <label className="field-label">Nom de la table</label>
        <input
          className="modal-input"
          placeholder={isPrivate ? "Partie entre amis" : "Ma table"}
          value={name}
          maxLength={28}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="field-label">Niveau de blinds</label>
        <div className="stake-grid">
          {stakes.map((s) => (
            <button
              key={s.key}
              className={`stake-opt ${s.key === stakeKey ? "sel" : ""}`}
              onClick={() => setStakeKey(s.key)}
            >
              <strong>{s.label}</strong>
              <span>{s.smallBlind}/{s.bigBlind}</span>
            </button>
          ))}
        </div>

        <label className="field-label">Nombre de sièges</label>
        <div className="seat-grid">
          {[2, 4, 6, 9].map((n) => (
            <button
              key={n}
              className={`seat-opt ${n === seats ? "sel" : ""}`}
              onClick={() => setSeats(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          className={`toggle-row ${withBots ? "on" : ""}`}
          onClick={() => setWithBots((v) => !v)}
        >
          <span className="toggle-switch" />
          <span className="toggle-txt">
            <strong>🤖 Adversaires bots</strong>
            <em>
              Ils s&apos;assoient quand tu es seul et cèdent leur place dès qu&apos;un
              vrai joueur arrive.
            </em>
          </span>
        </button>

        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>Annuler</button>
          <button
            className="modal-confirm"
            onClick={() =>
              onCreate({
                name: name.trim() || undefined,
                smallBlind: stake.smallBlind,
                bigBlind: stake.bigBlind,
                maxSeats: seats,
                isPrivate,
                withBots,
              })
            }
          >
            {isPrivate ? "Créer la partie privée" : "Créer la table"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Affiche le code d'une partie privée fraîchement créée. */
function CodeModal({ code, table, onClose, onContinue }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🔒 Partie privée créée</h2>
        <p className="modal-sub">
          {table?.name} · blinds {table?.smallBlind}/{table?.bigBlind} · {table?.maxSeats} sièges
        </p>

        <label className="field-label">Code à partager avec tes amis</label>
        <button className="code-display" onClick={copy}>
          {code}
          <span className="code-copy">{copied ? "✓ copié" : "copier"}</span>
        </button>
        <p className="modal-sub">
          Cette table n&apos;apparaît pas dans le lobby public. Tes amis la rejoignent
          en entrant ce code sur la page Jouer.
        </p>

        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>Plus tard</button>
          <button className="modal-confirm" onClick={onContinue}>S&apos;asseoir</button>
        </div>
      </div>
    </div>
  );
}

function BuyInModal({ table, bankroll, code, onClose, onConfirm }) {
  const bb = table.bigBlind;
  const min = table.minBuyIn;                       // 10 BB, imposé par la table
  const max = Math.min(table.maxBuyIn, bankroll);   // 100 BB, plafonné par le solde
  const affordable = bankroll >= min;
  const fixed = affordable && max <= min;           // solde pile au minimum

  const [amount, setAmount] = useState(() =>
    affordable ? Math.min(Math.max(min, bb * 50), max) : min
  );
  const clamp = (v) => Math.min(Math.max(v, min), max);
  const value = clamp(amount);

  // Paliers rapides en big blinds, filtrés selon ce que la table et le solde
  // permettent réellement (donc différents d'une table à l'autre).
  const presets = [10, 20, 30, 50, 75, 100]
    .map((m) => ({ m, v: bb * m }))
    .filter((p) => p.v > min && p.v < max);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          Rejoindre {table.name}
          {table.isPrivate && <span className="priv-badge">🔒 privée</span>}
        </h2>
        <p className="modal-sub">
          Blinds {table.smallBlind}/{table.bigBlind} · Ton solde : {bankroll.toLocaleString()} 🪙
          {code ? ` · code ${code}` : ""}
        </p>

        {!affordable ? (
          <>
            <p className="poker-error">
              Table trop chère : il faut <strong>{min.toLocaleString()}</strong> jetons minimum
              (10 big blinds). Il te manque {(min - bankroll).toLocaleString()} 🪙.
            </p>
            <p className="modal-sub">
              Choisis une table avec des blinds plus basses, ou récupère une recharge gratuite
              dans le lobby.
            </p>
          </>
        ) : (
          <>
            <label className="field-label">
              Montant du buy-in · {min.toLocaleString()} – {max.toLocaleString()} jetons
            </label>

            {fixed ? (
              <p className="modal-sub">
                Ton solde couvre exactement le minimum : tu entres avec{" "}
                <strong>{min.toLocaleString()}</strong> 🪙 ({Math.round(min / bb)} BB).
              </p>
            ) : (
              <>
                <div className="slider-row big">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={bb}
                    value={value}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                  <span className="raise-value">{value.toLocaleString()}</span>
                </div>
                <div className="buyin-bb">{Math.round(value / bb)} big blinds</div>
                <div className="quick-bets">
                  <button onClick={() => setAmount(min)}>
                    Min · {Math.round(min / bb)} BB
                  </button>
                  {presets.map((p) => (
                    <button key={p.m} onClick={() => setAmount(p.v)}>
                      {p.m} BB
                    </button>
                  ))}
                  <button onClick={() => setAmount(max)}>
                    Max · {Math.round(max / bb)} BB
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>Annuler</button>
          <button
            className="modal-confirm"
            disabled={!affordable}
            onClick={() => onConfirm(value)}
          >
            {affordable ? `S'asseoir avec ${value.toLocaleString()} 🪙` : "Solde insuffisant"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Sous-composants -------------------------------------------------------

function RebuyModal({ table, stack, bankroll, onClose, onConfirm }) {
  const bb = table.bigBlind;
  // On ne peut pas dépasser le plafond de la table, ni sa propre bankroll.
  const max = Math.max(0, Math.min(bankroll, table.maxBuyIn - stack));
  const min = Math.min(bb * 10, max);
  const [amount, setAmount] = useState(max);
  const value = Math.min(Math.max(amount, min), max);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Recharger à la table</h2>
        <p className="modal-sub">
          Stack actuel : {stack.toLocaleString()} 🪙 · Bankroll : {bankroll.toLocaleString()} 🪙
        </p>

        {max <= 0 ? (
          <p className="poker-error">
            Rien à ajouter : ton stack est au plafond de la table ou ta bankroll est vide.
          </p>
        ) : (
          <>
            <label className="field-label">
              Jetons à ajouter · max {max.toLocaleString()}
            </label>
            <div className="slider-row big">
              <input
                type="range"
                min={min}
                max={max}
                step={bb}
                value={value}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <span className="raise-value">{value.toLocaleString()}</span>
            </div>
            <div className="buyin-bb">
              nouveau stack : {(stack + value).toLocaleString()} 🪙 ·{" "}
              {Math.round((stack + value) / bb)} BB
            </div>
            <div className="quick-bets">
              <button onClick={() => setAmount(min)}>Min</button>
              <button onClick={() => setAmount(Math.round(max / 2))}>Moitié</button>
              <button onClick={() => setAmount(max)}>Max</button>
            </div>
            <p className="modal-sub" style={{ marginTop: 14 }}>
              La recharge s'applique entre deux mains (ou si tu es déjà couché).
            </p>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>Annuler</button>
          <button
            className="modal-confirm"
            disabled={max <= 0}
            onClick={() => onConfirm(value)}
          >
            Ajouter {max > 0 ? `${value.toLocaleString()} 🪙` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ code, small }) {
  if (!code || code === "back") {
    return <div className={`card back ${small ? "sm" : ""}`} />;
  }
  const rank = code.slice(0, -1).replace("T", "10");
  const suit = code.slice(-1);
  const symbols = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const red = suit === "h" || suit === "d";
  return (
    <div className={`card ${red ? "red" : "black"} ${small ? "sm" : ""}`}>
      <span className="rank">{rank}</span>
      <span className="suit">{symbols[suit]}</span>
    </div>
  );
}

function Seat({ seat, index, isDealer, isTurn, turnDeadline }) {
  if (!seat) {
    return (
      <div className="seat empty">
        <span className="seat-empty-num">Siège {index + 1}</span>
        <span className="seat-sub">libre</span>
      </div>
    );
  }
  const initial = (seat.username || "?").charAt(0).toUpperCase();
  return (
    <div
      className={`seat ${seat.folded ? "folded" : ""} ${isTurn ? "active" : ""} ${seat.isMe ? "me" : ""} ${seat.isBot ? "bot" : ""}`}
    >
      {isTurn && turnDeadline && <TurnTimer deadline={turnDeadline} />}
      <div className="seat-cards">
        {seat.cards.map((c, i) => <Card key={i} code={c} small />)}
      </div>
      <div className="seat-body">
        <span className="seat-avatar">{seat.isBot ? "🤖" : initial}</span>
        <div className="seat-txt">
          <span className="seat-name">{seat.username}{seat.isMe ? " (toi)" : ""}</span>
          <span className="chips">{seat.chips.toLocaleString()} 🪙</span>
        </div>
        {isDealer && <span className="dealer-chip">D</span>}
      </div>
      {seat.isBot && <span className="tag bot-tag">BOT</span>}
      {seat.allIn && <span className="tag allin-tag">ALL-IN</span>}
      {seat.waitingForHand && <span className="tag fold-tag">prochaine main</span>}
      {seat.folded && !seat.waitingForHand && <span className="tag fold-tag">couché</span>}
      {seat.sittingOut && !seat.folded && <span className="tag fold-tag">absent</span>}
    </div>
  );
}

function TurnTimer({ deadline }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    // Le total n'est pas fixe : 25 s pour un humain, ~1-2 s pour un bot.
    // On le déduit du temps restant au premier tick.
    const total = Math.max(500, deadline - Date.now());
    const tick = () => {
      const remaining = deadline - Date.now();
      setPct(Math.max(0, Math.min(100, (remaining / total) * 100)));
    };
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [deadline]);
  return (
    <div className="turn-timer">
      <div
        className="turn-timer-bar"
        style={{ width: `${pct}%`, background: pct < 30 ? "#f85149" : "#ffd966" }}
      />
    </div>
  );
}
