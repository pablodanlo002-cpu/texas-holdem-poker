# 🃏 Texas Hold'em Poker - Entre amis

Jeu de poker Texas Hold'em en ligne avec jetons virtuels gratuits, système de récompenses et bot Discord.

## 🎮 Fonctionnalités

### Poker
- ✅ Texas Hold'em complet avec bots IA
- ✅ 4 niveaux de difficulté (Micro, Low, Medium, High/VIP)
- ✅ Mise minimum : 10 à 200 jetons selon la table
- ✅ Timer de 25 secondes par tour
- ✅ Sons style Zynga Poker

### Système de récompenses
- 🎁 **YouTube** : 500 pièces pour un abonnement
- 🎁 **TikTok** : 500 pièces pour un follow
- 📺 **Pubs** : 100 pièces par vidéo de 30s (max 20/jour)
- 🎡 **Roue de fortune** : 
  - 1 tour gratuit toutes les 24h
  - +1 tour par vidéo de 60s (max 5/jour)
  - Gains : 50 à 2000 pièces (+ cases vides)

### Bot Discord
- `/register` - Créer un compte pour jouer
- Pseudo unique (pas de doublons)
- Mot de passe généré automatiquement

## 🚀 Démarrage local

### Prérequis
- Node.js 18+
- Un bot Discord (voir guide ci-dessous)

### Installation

1. Clone le projet
```bash
git clone <ton-repo>
cd sittest
```

2. Installe les dépendances
```bash
npm install
```

3. Configure les variables d'environnement

Crée un fichier `.env.local` :
```env
JWT_SECRET=ton_secret_super_long_change_moi
DISCORD_TOKEN=ton_token_discord
```

4. Lance le serveur
```bash
npm run dev:all
```

Le site sera accessible sur **http://localhost:3000**

## 📦 Déploiement

Pour héberger gratuitement ton site 24/7, suis le guide complet : **[DEPLOIEMENT_RAILWAY.md](./DEPLOIEMENT_RAILWAY.md)**

## 🎨 Personnalisation

### Changer les liens sociaux

Édite `lib/rewards.js` :
```javascript
export const CONFIG = {
  youtubeUrl: "https://www.youtube.com/@ta-chaine",
  tiktokUrl: "https://www.tiktok.com/@ton-compte",
  // ...
};
```

### Modifier les récompenses

Dans `lib/rewards.js` :
```javascript
socialReward: 500,        // Récompense YouTube/TikTok
adReward: 100,            // Récompense pub 30s
adMaxPerDay: 20,          // Max de pubs par jour
spinAdMaxPerDay: 5,       // Max de vidéos roue par jour
```

### Modifier la roue de fortune

Dans `lib/rewards.js`, édite le tableau `WHEEL` :
```javascript
export const WHEEL = [
  { label: "100", coins: 100, weight: 20 },  // 20% de chance
  { label: "Rien", coins: 0, weight: 16 },   // 16% de chance (case vide)
  // ...
];
```

## 🔧 Scripts disponibles

```bash
npm run dev          # Démarre Next.js en mode dev
npm run build        # Build Next.js pour production
npm run start        # Démarre Next.js en mode production
npm run bot          # Lance le bot Discord
npm run poker        # Lance le serveur poker WebSocket
npm run dev:all      # Lance TOUT en développement
npm run start:all    # Lance TOUT en production
```

## 📁 Structure du projet

```
sittest/
├── app/                    # Pages Next.js et composants
│   ├── api/               # Routes API (auth, rewards)
│   ├── components/        # Composants React
│   ├── dashboard/         # Page d'accueil
│   ├── poker/            # Jeu de poker
│   └── profile/          # Profil joueur
├── bot/                   # Bot Discord
├── lib/                   # Logique serveur
│   ├── db.js             # Base de données JSON
│   ├── rewards.js        # Système de récompenses
│   └── session.js        # Gestion des sessions JWT
├── server/               # Serveur poker WebSocket
└── data.json            # Base de données (créée auto)
```

## 🐛 Dépannage

### Le modal de récompenses est coupé
Fais **Ctrl + Shift + R** pour vider le cache du navigateur.

### Le bot Discord n'est pas en ligne
Vérifie que `DISCORD_TOKEN` est bien configuré dans `.env.local`.

### ChunkLoadError
Arrête le serveur, supprime `.next/`, et relance avec :
```bash
npm run dev:all
```

## 📝 License

Projet personnel - Utilisation libre

## 🎯 Crédits

- Poker : Next.js + Socket.io
- Bot Discord : discord.js
- Sons : Style Zynga Poker
