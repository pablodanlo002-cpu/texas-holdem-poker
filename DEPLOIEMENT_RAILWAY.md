# 🚂 Déploiement sur Railway.app

## Pourquoi Railway ?
- ✅ **GRATUIT** : 5$ de crédit par mois (largement suffisant)
- ✅ **TOUT-EN-UN** : Site + Bot Discord + Serveur Poker sur le même service
- ✅ **HTTPS automatique** avec certificat SSL gratuit
- ✅ **Domaine gratuit** : `ton-projet.up.railway.app`
- ✅ **Pas de mise en veille** : ton site reste toujours actif
- ✅ **Logs en temps réel** pour débugger

---

## 📋 Étapes de déploiement

### 1. Créer un compte Railway

1. Va sur **https://railway.app**
2. Clique sur **"Start a New Project"**
3. Connecte-toi avec **GitHub** (crée un compte GitHub si tu n'en as pas)

---

### 2. Créer un dépôt GitHub

**Option A : Depuis GitHub Desktop (recommandé si tu as GitHub Desktop)**

1. Télécharge **GitHub Desktop** : https://desktop.github.com
2. Ouvre GitHub Desktop
3. Clique sur **File > Add Local Repository**
4. Sélectionne le dossier `sittest`
5. Clique sur **Publish repository**
6. Décoche **"Keep this code private"** si tu veux que ce soit public
7. Clique sur **Publish Repository**

**Option B : Depuis le site GitHub**

1. Va sur **https://github.com/new**
2. Nom du repo : `texas-holdem-poker`
3. Clique sur **Create repository**
4. Dans le dossier `sittest`, ouvre PowerShell et tape :

```powershell
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/texas-holdem-poker.git
git push -u origin main
```

---

### 3. Déployer sur Railway

1. Va sur **https://railway.app**
2. Clique sur **"New Project"**
3. Sélectionne **"Deploy from GitHub repo"**
4. Choisis ton repo `texas-holdem-poker`
5. Railway va automatiquement détecter Next.js et installer les dépendances

---

### 4. Configurer les variables d'environnement

1. Dans Railway, clique sur ton projet
2. Va dans l'onglet **"Variables"**
3. Ajoute ces variables :

```
JWT_SECRET=ton_secret_super_long_et_securise_change_moi_123456789
DISCORD_TOKEN=ton_token_discord_du_bot
NODE_ENV=production
PORT=3000
```

**⚠️ IMPORTANT pour JWT_SECRET** : Génère un secret aléatoire sécurisé. Tu peux utiliser cette commande PowerShell :

```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

**Pour DISCORD_TOKEN** : Va sur https://discord.com/developers/applications
- Sélectionne ton bot
- Va dans "Bot"
- Copie le token (clique sur "Reset Token" si besoin)

---

### 5. Générer un domaine

1. Dans Railway, clique sur ton projet
2. Va dans **"Settings"**
3. Clique sur **"Generate Domain"**
4. Tu auras un lien comme : `https://ton-projet.up.railway.app`

---

### 6. Tester le site

1. Ouvre ton domaine Railway dans le navigateur
2. Tu devrais voir la page d'accueil du Texas Hold'em
3. Le bot Discord devrait être en ligne
4. Teste `/register` sur Discord pour créer un compte

---

## 🔄 Mettre à jour le site

Quand tu fais des modifications sur ton PC :

**Avec GitHub Desktop :**
1. Ouvre GitHub Desktop
2. Écris un message de commit (ex: "Ajout de la roue de fortune")
3. Clique sur **Commit to main**
4. Clique sur **Push origin**
5. Railway va automatiquement redéployer en 2-3 minutes

**Avec PowerShell :**
```powershell
git add .
git commit -m "Description de tes modifications"
git push
```

---

## 📊 Surveiller ton site

### Logs en temps réel
1. Va sur Railway
2. Clique sur ton projet
3. Clique sur l'onglet **"Deployments"**
4. Clique sur le dernier déploiement
5. Tu verras les logs en direct (comme dans ta console locale)

### Consommation
1. Va sur **"Usage"** dans Railway
2. Tu verras combien de crédit tu as utilisé
3. Les 5$/mois gratuits suffisent largement pour ~100-200 joueurs actifs

---

## ⚠️ Points importants

### Bot Discord
Le bot Discord tournera sur Railway, donc :
- Il sera toujours en ligne (pas besoin de ton PC)
- Les commandes `/register` fonctionneront 24/7

### Base de données
Le fichier `data.json` est stocké sur Railway. **ATTENTION** :
- Si tu redéploies, les données sont conservées
- Si tu supprimes le projet Railway, tu perds les données
- Pour une vraie production, il faudrait une vraie base de données (PostgreSQL)

### Sauvegardes
Pour sauvegarder les comptes joueurs :
1. Va dans Railway > ton projet
2. Clique sur **"Deployments"**
3. Clique sur **"View Logs"**
4. Tu peux télécharger `data.json` depuis les fichiers du serveur

---

## 🆘 Problèmes courants

### Le site ne démarre pas
- Vérifie les logs dans Railway
- Assure-toi que `JWT_SECRET` et `DISCORD_TOKEN` sont bien configurés
- Vérifie que le build Next.js s'est bien terminé

### Le bot Discord n'apparaît pas en ligne
- Vérifie le token Discord dans les variables
- Va dans Discord Developer Portal > ton bot > OAuth2 > URL Generator
- Coche "bot" et "applications.commands"
- Utilise l'URL générée pour inviter le bot sur ton serveur

### "ChunkLoadError" ou erreurs de cache
- Vide le cache du navigateur (Ctrl+Shift+Delete)
- Fais un hard refresh (Ctrl+Shift+R)

### Épuisement du crédit gratuit
- Railway te prévient par email
- Tu peux ajouter une carte bancaire pour 5$/mois supplémentaires
- Ou optimiser (désactiver des features gourmandes)

---

## 🎉 C'est tout !

Ton site Texas Hold'em est maintenant hébergé gratuitement et accessible 24/7 !

Partage le lien `https://ton-projet.up.railway.app` à tes amis pour jouer ensemble.

---

## 📞 Support

Si tu as des problèmes :
1. Regarde les logs Railway
2. Vérifie la console F12 du navigateur
3. Teste localement avec `npm run dev:all` pour reproduire le bug
