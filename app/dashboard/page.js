import Link from "next/link";
import { requireUser } from "../../lib/session.js";
import SiteNav from "../components/SiteNav.js";
import "../globals.css";

const MODES = [
  {
    key: "micro",
    tag: "Débutant",
    name: "Micro",
    blinds: "5 / 10",
    buyIn: "100 – 1 000",
    desc: "Idéal pour apprendre sans pression. Les mains durent longtemps.",
    accent: "emerald",
  },
  {
    key: "low",
    tag: "Populaire",
    name: "Low",
    blinds: "10 / 20",
    buyIn: "200 – 2 000",
    desc: "Le niveau le plus joué. Bon rythme, vraies décisions.",
    accent: "blue",
  },
  {
    key: "medium",
    tag: "Confirmé",
    name: "Medium",
    blinds: "25 / 50",
    buyIn: "500 – 5 000",
    desc: "Les pots grossissent vite. Il faut savoir lâcher une main.",
    accent: "violet",
  },
  {
    key: "high",
    tag: "Expert",
    name: "High / VIP",
    blinds: "50 / 100 · 100 / 200",
    buyIn: "1 000 – 20 000",
    desc: "Tapis profonds et bluffs assumés. Réservé aux gros stacks.",
    accent: "gold",
  },
];

const FEATURES = [
  {
    icon: "⚡",
    title: "Temps réel",
    text: "Chaque mise, carte et tapis arrive instantanément par WebSocket. Aucun rafraîchissement.",
  },
  {
    icon: "🔒",
    title: "Serveur autoritaire",
    text: "Le serveur distribue et valide tout. Les cartes adverses ne quittent jamais le serveur avant l'abattage.",
  },
  {
    icon: "🎲",
    title: "Mélange cryptographique",
    text: "Le paquet est mélangé avec un Fisher-Yates alimenté par crypto. Pas de hasard prévisible.",
  },
  {
    icon: "🏆",
    title: "Règles complètes",
    text: "No-Limit Hold'em intégral : blinds, relances minimums, side pots, heads-up, split.",
  },
];

export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="page">
      <SiteNav user={user} active="home" />

      <main className="page-main">
        {/* ---- Hero ---- */}
        <section className="hero">
          <div className="hero-copy">
            <span className="badge">
              <span className="badge-dot" /> Tables ouvertes
            </span>
            <h1 className="hero-title">
              Le Texas Hold'em,
              <br />
              <span className="grad">entre amis.</span>
            </h1>
            <p className="hero-sub">
              Crée une table, envoie le lien à tes potes, et joue. Pas d'installation,
              pas d'argent réel — juste du poker sérieux avec des jetons virtuels.
            </p>
            <div className="hero-actions">
              <Link href="/poker" className="btn-primary">
                🃏 Entrer dans le lobby
              </Link>
              <a href="#modes" className="btn-ghost">
                Voir les niveaux
              </a>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="fan">
              <div className="fan-card c1">
                <span className="fc-rank">A</span>
                <span className="fc-suit red">♥</span>
              </div>
              <div className="fan-card c2">
                <span className="fc-rank">K</span>
                <span className="fc-suit">♠</span>
              </div>
              <div className="fan-card c3">
                <span className="fc-rank">Q</span>
                <span className="fc-suit red">♦</span>
              </div>
            </div>
            <div className="chip-stack">
              <span className="stack-chip s1" />
              <span className="stack-chip s2" />
              <span className="stack-chip s3" />
            </div>
          </div>
        </section>

        {/* ---- Niveaux de blinds ---- */}
        <section id="modes" className="section">
          <div className="section-head">
            <h2 className="section-title">Choisis ton niveau</h2>
            <p className="section-sub">
              Cinq paliers de blinds. Le buy-in va de 10 à 100 big blinds selon la table.
            </p>
          </div>
          <div className="mode-grid">
            {MODES.map((m) => (
              <div key={m.key} className={`mode-card ${m.accent}`}>
                <span className="mode-tag">{m.tag}</span>
                <h3 className="mode-name">{m.name}</h3>
                <div className="mode-row">
                  <span className="mode-label">Blinds</span>
                  <span className="mode-val">{m.blinds}</span>
                </div>
                <div className="mode-row">
                  <span className="mode-label">Buy-in</span>
                  <span className="mode-val">{m.buyIn}</span>
                </div>
                <p className="mode-desc">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Comment ça marche ---- */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Comment ça marche</h2>
          </div>
          <div className="steps">
            <div className="step">
              <span className="step-num">1</span>
              <h3>Crée ou rejoins</h3>
              <p>
                Dans le lobby, monte une table (blinds, nombre de sièges) ou assieds-toi
                à une table existante.
              </p>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <h3>Choisis ta cave</h3>
              <p>
                Décide combien de jetons tu emmènes à la table. Le reste de ton solde
                reste en sécurité.
              </p>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <h3>Joue</h3>
              <p>
                La main démarre dès que vous êtes deux. 25 secondes par décision, puis
                action automatique.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Points techniques ---- */}
        <section className="section">
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-text">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- CTA final ---- */}
        <section className="cta-band">
          <div>
            <h2 className="cta-title">Une table t'attend.</h2>
            <p className="cta-sub">Les mains se lancent dès qu'il y a deux joueurs assis.</p>
          </div>
          <Link href="/poker" className="btn-primary lg">
            Jouer maintenant
          </Link>
        </section>
      </main>

      <footer className="site-footer">
        <div className="foot-brand">
          <span className="brand-logo sm">♠</span>
          <span>SitTest Poker</span>
        </div>
        <span className="foot-note">
          Jetons virtuels, aucune valeur marchande. Comptes créés via Discord.
        </span>
      </footer>
    </div>
  );
}
