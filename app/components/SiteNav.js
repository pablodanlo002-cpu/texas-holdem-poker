import Link from "next/link";
import CoinBalance from "./CoinBalance.js";

/**
 * Barre de navigation commune au site connecté.
 * Le pseudo est cliquable et mène à la page profil (aucune donnée
 * personnelle n'est affichée ici, uniquement le pseudo et le solde).
 */
export default function SiteNav({ user, active }) {
  const initial = (user.username || "?").charAt(0).toUpperCase();
  const chips = typeof user.chips === "number" ? user.chips : 0;

  return (
    <header className="site-nav">
      <Link href="/dashboard" className="brand">
        <span className="brand-logo">♠</span>
        <span className="brand-name">
          Sit<span className="brand-accent">Test</span>
        </span>
      </Link>

      <nav className="nav-links">
        <Link href="/dashboard" className={active === "home" ? "nav-link on" : "nav-link"}>
          Accueil
        </Link>
        <Link href="/poker" className={active === "play" ? "nav-link on" : "nav-link"}>
          Jouer
        </Link>
      </nav>

      <div className="nav-right">
        <CoinBalance chips={chips} />

        <Link
          href="/profile"
          className={active === "profile" ? "user-pill on" : "user-pill"}
          title="Voir mon profil"
        >
          <span className="avatar">{initial}</span>
          <span className="user-pill-name">{user.username}</span>
          <span className="user-pill-caret">▾</span>
        </Link>
      </div>
    </header>
  );
}
