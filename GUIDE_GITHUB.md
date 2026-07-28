# 📦 Mettre ton projet sur GitHub - Guide complet

## Méthode 1 : GitHub Desktop (LA PLUS SIMPLE)

### Étape 1 : Télécharger GitHub Desktop

1. Va sur **https://desktop.github.com**
2. Clique sur **"Download for Windows"**
3. Installe le logiciel (double-clique sur le fichier téléchargé)
4. Lance GitHub Desktop

### Étape 2 : Créer un compte GitHub (si tu n'en as pas)

1. Dans GitHub Desktop, clique sur **"Sign in to GitHub.com"**
2. Ou va sur **https://github.com/signup**
3. Crée ton compte (gratuit) :
   - Choisis un nom d'utilisateur
   - Entre ton email
   - Crée un mot de passe
   - Confirme ton email

### Étape 3 : Ajouter ton projet

1. Dans GitHub Desktop, clique sur **"File"** > **"Add Local Repository"**
2. Clique sur **"Choose..."**
3. Sélectionne le dossier : `C:\Users\deksa\OneDrive\Desktop\sittest`
4. Clique sur **"Add Repository"**

**⚠️ Si tu vois "This directory does not appear to be a Git repository"** :
- Clique sur **"Create a repository"**
- GitHub Desktop va initialiser Git automatiquement

### Étape 4 : Faire ton premier commit

1. Tu devrais voir tous tes fichiers listés à gauche
2. En bas à gauche, écris un message de commit : `Premier commit - Texas Hold'em`
3. Clique sur **"Commit to main"**

### Étape 5 : Publier sur GitHub

1. Clique sur **"Publish repository"** en haut
2. **Nom du repo** : `texas-holdem-poker` (ou ce que tu veux)
3. **Description** : `Jeu de poker Texas Hold'em avec récompenses`
4. ⚠️ **IMPORTANT** : Décoche **"Keep this code private"** (laisse-le public pour Railway gratuit)
5. Clique sur **"Publish Repository"**

### ✅ C'EST FINI !

Ton code est maintenant sur GitHub ! Tu peux voir ton repo sur :
`https://github.com/TON_USERNAME/texas-holdem-poker`

---

## Méthode 2 : Ligne de commande (Si tu préfères)

### Étape 1 : Installer Git

1. Télécharge Git : **https://git-scm.com/download/win**
2. Installe-le (laisse toutes les options par défaut)
3. Redémarre PowerShell après l'installation

### Étape 2 : Configurer Git

Ouvre PowerShell dans le dossier `sittest` et tape :

```powershell
git config --global user.name "Ton Nom"
git config --global user.email "ton@email.com"
```

### Étape 3 : Créer le repo sur GitHub.com

1. Va sur **https://github.com/new**
2. Nom du repo : `texas-holdem-poker`
3. Description : `Jeu de poker Texas Hold'em`
4. Choisis **Public**
5. **NE COCHE PAS** "Initialize with README" (on en a déjà un)
6. Clique sur **"Create repository"**

### Étape 4 : Pousser ton code

Dans PowerShell, dans le dossier `sittest`, tape ces commandes **une par une** :

```powershell
# Initialiser Git
git init

# Ajouter tous les fichiers
git add .

# Créer le premier commit
git commit -m "Premier commit - Texas Hold'em"

# Renommer la branche en main
git branch -M main

# Lier au repo GitHub (REMPLACE TON_USERNAME par ton vrai username GitHub)
git remote add origin https://github.com/TON_USERNAME/texas-holdem-poker.git

# Envoyer le code sur GitHub
git push -u origin main
```

**⚠️ Si ça demande login/password** :
- Utilise ton username GitHub
- Pour le mot de passe, utilise un **Personal Access Token** :
  1. Va sur https://github.com/settings/tokens
  2. Clique sur **"Generate new token (classic)"**
  3. Donne-lui tous les droits "repo"
  4. Copie le token et utilise-le comme mot de passe

### ✅ C'EST FINI !

Ton code est sur GitHub !

---

## 🔄 Comment mettre à jour ton code plus tard

### Avec GitHub Desktop :
1. Fais tes modifications sur ton PC
2. Ouvre GitHub Desktop
3. Écris un message de commit (ex: "Ajout de nouvelles fonctionnalités")
4. Clique sur **"Commit to main"**
5. Clique sur **"Push origin"**

### Avec ligne de commande :
```powershell
git add .
git commit -m "Description de tes modifications"
git push
```

---

## ⚠️ Fichiers sensibles

J'ai déjà créé un fichier `.gitignore` qui empêche d'envoyer :
- ✅ `.env.local` (tes secrets ne seront PAS sur GitHub)
- ✅ `node_modules/` (trop gros)
- ✅ `.next/` (cache)

Donc pas de risque d'exposer ton `JWT_SECRET` ou `DISCORD_TOKEN` !

---

## 📞 Problèmes courants

### "fatal: not a git repository"
Tu n'es pas dans le bon dossier. Fais :
```powershell
cd C:\Users\deksa\OneDrive\Desktop\sittest
```

### "Permission denied"
Tu n'as pas les droits. Utilise un Personal Access Token au lieu du mot de passe.

### "remote: Repository not found"
Vérifie que tu as bien remplacé `TON_USERNAME` par ton vrai username GitHub.

---

## ✅ Prochaine étape

Une fois ton code sur GitHub, retourne sur le guide **DEPLOIEMENT_RAILWAY.md** pour l'héberger gratuitement !
