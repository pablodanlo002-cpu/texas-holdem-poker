import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Épingle la racine du projet : sans ça, Next détecte le package-lock.json
  // parent (C:\) et choisit la mauvaise racine de workspace.
  turbopack: { root: __dirname },

  // Permet de lancer un build de vérification dans un dossier séparé
  // (NEXT_DIST_DIR=.next-check next build) sans corrompre le cache du
  // serveur de dev qui tourne en parallèle sur .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Autorise ngrok et autres tunnels en développement
  allowedDevOrigins: [
    'desolate-gloating-related.ngrok-free.dev',
    '.ngrok-free.dev',
    '.ngrok.io',
  ],

  // Rewrites pour rediriger Socket.IO vers l'API proxy
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: '/api/socket',
      },
    ];
  },
};

export default nextConfig;
