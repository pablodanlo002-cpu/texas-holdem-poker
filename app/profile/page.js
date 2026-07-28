import Link from "next/link";
import { requireUser } from "../../lib/session.js";
import SiteNav from "../components/SiteNav.js";
import "../globals.css";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default async function ProfilePage() {
  const user = await requireUser();
  const initial = (user.username || "?").charAt(0).toUpperCase();
  const chips = typeof user.chips === "number" ? user.chips : 0;

  return (
    <div className="page">
      <SiteNav user={user} active="profile" />

      <main className="page-main narrow">
        <div className="crumbs">
          <Link href="/dashboard">Accueil</Link>
          <span>/</span>
          <span>Profil</span>
        </div>

        {/* ---- En-tête profil ---- */}
        <section className="profile-head">
          <span className="profile-avatar">{initial}</span>
          <div className="profile-id">
            <h1 className="profile-name">{user.username}</h1>
            <p className="profile-meta">Membre depuis le {formatDate(user.created_at)}</p>
          </div>
          <div className="profile-bank">
            <span className="pb-label">Solde</span>
            <span className="pb-value">{chips.toLocaleString("fr-FR")} 🪙</span>
          </div>
        </section>

        {/* ---- Informations du compte ---- */}
        <section className="panel">
          <h2 className="panel-title">Informations du compte</h2>
          <p className="panel-sub">
            Ces données ne sont visibles que par toi. Elles n'apparaissent nulle part
            ailleurs sur le site.
          </p>

          <dl className="info-list">
            <div className="info-row">
              <dt>Pseudo</dt>
              <dd>{user.username}</dd>
            </div>
            <div className="info-row">
              <dt>Email de connexion</dt>
              <dd className="mono">{user.email}</dd>
            </div>
            <div className="info-row">
              <dt>Identifiant Discord</dt>
              <dd className="mono">{user.discord_id || "—"}</dd>
            </div>
            <div className="info-row">
              <dt>Mot de passe</dt>
              <dd>
                <span className="mono">••••••••••••</span>
                <span className="hint">
                  Stocké haché (bcrypt) — il est illisible, même pour le serveur.
                </span>
              </dd>
            </div>
            <div className="info-row">
              <dt>Compte n°</dt>
              <dd className="mono">{user.id}</dd>
            </div>
          </dl>
        </section>

        {/* ---- Jetons ---- */}
        <section className="panel">
          <h2 className="panel-title">Jetons</h2>
          <p className="panel-sub">
            Ton solde total. Quand tu t'assieds à une table, une partie part en cave et
            revient à ton solde dès que tu quittes la table.
          </p>
          <div className="bank-box">
            <span className="bank-amount">{chips.toLocaleString("fr-FR")}</span>
            <span className="bank-unit">jetons</span>
          </div>
          <p className="panel-note">
            Sous 1 000 jetons, une recharge gratuite de 2 000 est disponible dans le lobby.
          </p>
        </section>

        {/* ---- Zone sensible ---- */}
        <section className="panel danger">
          <h2 className="panel-title">Session</h2>
          <p className="panel-sub">
            Tu peux te déconnecter d'ici. Pour retrouver tes identifiants, relance{" "}
            <code>/register</code> sur Discord.
          </p>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="btn-danger">
              Se déconnecter
            </button>
          </form>
        </section>
      </main>

      <footer className="site-footer">
        <div className="foot-brand">
          <span className="brand-logo sm">♠</span>
          <span>SitTest Poker</span>
        </div>
        <span className="foot-note">Jetons virtuels, aucune valeur marchande.</span>
      </footer>
    </div>
  );
}
