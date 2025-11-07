# Spotify Playlist Manager

Application de bureau moderne pour créer et gérer des playlists Spotify à partir de morceaux sélectionnés dans vos playlists existantes.

![Design minimaliste](https://img.shields.io/badge/Design-Minimaliste-bfa688?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-App-2c442c?style=flat-square)
![OAuth PKCE](https://img.shields.io/badge/Auth-OAuth%20PKCE-0d0908?style=flat-square)

## 📋 Table des matières

- [Vue d'ensemble](#-vue-densemble)
- [Fonctionnalités](#-fonctionnalités)
- [Architecture technique](#-architecture-technique)
- [Installation](#-installation)
- [Utilisation](#️-utilisation)
- [Build](#-build)
- [Dépannage](#-dépannage)

## 🎯 Vue d'ensemble

Spotify Playlist Manager est une application de bureau Electron qui vous permet de :
- Parcourir toutes vos playlists Spotify
- Sélectionner des morceaux de manière intuitive
- Créer de nouvelles playlists personnalisées
- Gérer l'historique de vos créations
- Récupérer automatiquement après un crash

### Design minimaliste moderne

L'application utilise une palette de couleurs épurée :
- **Khaki** (#bfa688) : Arrière-plans et éléments secondaires
- **Cal Poly Green** (#2c442c) : Actions primaires et accents
- **Smoky Black** (#0d0908) : Textes et bordures

Interface fluide avec Font Awesome pour les icônes et transitions douces pour une expérience utilisateur optimale.

## ✨ Fonctionnalités

### 🔐 Authentification sécurisée
- **OAuth 2.0 avec PKCE** : Authentification sans Client Secret
- **Configuration automatique** : Assistant intégré pour configurer le Client ID
- **Session persistante** : Reconnexion automatique (token valide 1h)
- **Déconnexion** : Bouton de déconnexion avec confirmation

### 📚 Gestion des playlists
- **Liste complète** : Affichage de toutes vos playlists Spotify
- **Recherche en temps réel** : Filtrage instantané par nom
- **Suppression** : Possibilité de supprimer des playlists directement
- **Prévisualisation** : Aperçu des pochettes et nombre de pistes

### 🎵 Sélection des morceaux
- **Interface intuitive** : Coches pour sélectionner/désélectionner
- **Sélection multiple** : Bouton "Tout sélectionner/désélectionner"
- **Tri intelligent** : Morceaux triés par date d'ajout (récent en premier)
- **Compteur dynamique** : Affichage du nombre de pistes sélectionnées
- **Scroll optimisé** : Pas de scroll automatique lors de la sélection

### 🎨 Création de playlist
- **Nommage personnalisé** : Nom suggéré avec date automatique
- **Visibilité** : Option publique/privée
- **Barre de progression** : Suivi en temps réel de l'ajout des morceaux
- **Système de checkpoint** : Sauvegarde automatique tous les 100 morceaux
- **Lien de partage** : URL directe vers la playlist créée

### 📜 Historique et récupération
- **Historique complet** : Jusqu'à 50 playlists créées mémorisées
- **Détails enrichis** : Nombre de pistes, playlist source, visibilité, dernier morceau
- **Actions rapides** : Ouvrir dans Spotify, copier le lien, supprimer de l'historique
- **Récupération automatique** : Notification au redémarrage si création interrompue
- **Reprise** : Possibilité de continuer une création incomplète

## 🏗️ Architecture technique

### Stack technologique

```
┌─────────────────────────────────────────────────┐
│              Application Electron                │
├─────────────────────────────────────────────────┤
│  Processus Principal (main.js)                  │
│  - Gestion des fenêtres                         │
│  - Serveur Express (port 8888)                  │
│  - Configuration .env                           │
│  - IPC pour communication                       │
├─────────────────────────────────────────────────┤
│  Processus Renderer (renderer.js)               │
│  - Interface utilisateur (Vanilla JS)           │
│  - Gestion d'état locale                        │
│  - API Spotify Web                              │
│  - LocalStorage (tokens, historique)            │
├─────────────────────────────────────────────────┤
│  Bridge sécurisé (preload.js)                   │
│  - contextBridge pour IPC                       │
│  - Isolation du contexte                        │
└─────────────────────────────────────────────────┘
```

### Technologies utilisées

- **Electron 33.2.1** : Framework pour application de bureau
- **Express 4.21.2** : Serveur HTTP pour OAuth callback
- **Spotify Web API** : Intégration avec Spotify
- **Font Awesome 6.5.1** : Bibliothèque d'icônes
- **dotenv 16.4.7** : Gestion des variables d'environnement
- **electron-builder 25.1.8** : Packaging et distribution

### Structure du projet

```
spotify-playlist-manager/
├── main.js                 # Processus principal Electron
│   ├── loadEnvConfig()     # Chargement configuration
│   ├── startCallbackServer() # Serveur Express (OAuth)
│   └── createWindow()      # Création fenêtre principale
│
├── renderer.js             # Logique frontend (1010 lignes)
│   ├── État global         # Gestion du state
│   ├── OAuth PKCE          # Authentification Spotify
│   ├── API Spotify         # Appels REST
│   ├── Gestion UI          # Render et événements
│   ├── Checkpoints         # Sauvegarde progression
│   └── Historique          # Persistance localStorage
│
├── preload.js              # Bridge IPC sécurisé
│   ├── onSpotifyAuthCode() # Réception code OAuth
│   └── contextBridge       # Isolation sécurisée
│
├── index.html              # Structure HTML
├── styles.css              # Design system complet
│   ├── Variables CSS       # Couleurs, espacements, transitions
│   ├── Composants          # Boutons, cartes, inputs, etc.
│   └── Responsive          # Adaptatif mobile/desktop
│
├── package.json            # Configuration npm + build
├── .env                    # Configuration (généré automatiquement)
└── assets/
    └── icon.png           # Icône de l'application
```

### Flux d'authentification OAuth

```
1. Utilisateur clique "Se connecter"
   ↓
2. Génération PKCE (code_verifier + code_challenge)
   ↓
3. Ouverture navigateur → accounts.spotify.com/authorize
   ↓
4. Utilisateur autorise l'application
   ↓
5. Redirection vers http://127.0.0.1:8888/callback?code=XXX
   ↓
6. Serveur Express reçoit le code
   ↓
7. Envoi via IPC (mainWindow.webContents.send)
   ↓
8. Renderer reçoit le code via electronAPI.onSpotifyAuthCode
   ↓
9. Échange code contre access_token (POST /api/token)
   ↓
10. Stockage token + expiry dans localStorage
    ↓
11. Récupération profil utilisateur (/v1/me)
    ↓
12. Affichage liste des playlists (/v1/me/playlists)
```

### Flux de création de playlist

```
1. Utilisateur sélectionne des morceaux
   ↓
2. Clique "Créer playlist"
   ↓
3. Définit nom + visibilité (public/privé)
   ↓
4. POST /v1/users/{user_id}/playlists
   ↓
5. Récupération playlist_id
   ↓
6. Découpage des tracks en batches de 100
   ↓
7. Pour chaque batch :
   │  - POST /v1/playlists/{playlist_id}/tracks
   │  - Sauvegarde checkpoint dans localStorage
   │  - Mise à jour barre de progression
   ↓
8. Récupération détails playlist (cover, URL)
   ↓
9. Ajout à l'historique (localStorage)
   ↓
10. Suppression checkpoint
    ↓
11. Affichage écran succès + lien de partage
```

### Gestion de la configuration

**En mode développement** :
- `.env` à la racine du projet
- Chargement via `dotenv.config()`

**En mode production (packagé)** :
- `.env` dans `app.getPath('userData')`
  - Windows : `C:\Users\{username}\AppData\Roaming\spotify-playlist-manager\`
  - macOS : `~/Library/Application Support/spotify-playlist-manager/`
  - Linux : `~/.config/spotify-playlist-manager/`
- Assistant de configuration intégré si fichier absent

### Système de sauvegarde

**localStorage** :
- `spotify_token` : Access token Spotify
- `spotify_user` : Profil utilisateur (JSON)
- `token_expiry` : Timestamp expiration (timestamp)
- `playlist_history` : Historique des créations (JSON array, max 50)
- `playlist_checkpoint` : Sauvegarde création en cours (JSON)

**Checkpoint structure** :
```json
{
  "playlistId": "7xyz...",
  "playlistName": "Ma playlist",
  "playlistUrl": "https://open.spotify.com/playlist/7xyz...",
  "sourcePlaylist": { "id": "abc...", "name": "Source" },
  "selectedTracks": ["trackId1", "trackId2", ...],
  "tracksAdded": 150,
  "totalTracks": 250,
  "status": "in_progress",
  "isPublic": false,
  "timestamp": 1234567890
}
```

### Communication IPC

**Main → Renderer** :
- `spotify-auth-code` : Envoi du code OAuth après callback

**Triple système de sécurité** :
1. IPC direct (méthode principale)
2. Polling sessionStorage (fallback)
3. Polling endpoint `/get-pending-code` (fallback 2)

## 🚀 Installation

### 1. Prérequis

- [Node.js](https://nodejs.org) (v16 ou supérieur)
- Un compte [Spotify Developer](https://developer.spotify.com/dashboard)

### 2. Configuration Spotify

1. Allez sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Cliquez sur **"Create app"**
3. Remplissez les informations :
   - **App name** : Spotify Playlist Manager
   - **App description** : Gestionnaire de playlists
   - **Redirect URI** : `http://127.0.0.1:8888/callback`
   - Cochez **Web API**
4. Cliquez sur **"Save"**
5. Dans **"Settings"**, copiez votre **Client ID**

### 3. Installation du projet

```bash
# Cloner ou télécharger le projet
cd spotify-playlist-manager

# Installer les dépendances
npm install
```

### 4. Configuration

**Option 1 : Configuration automatique (Recommandé)**

Lancez simplement l'application avec `npm start`. Si aucune configuration n'est détectée, un assistant de configuration s'affichera automatiquement pour vous guider à travers les étapes.

**Option 2 : Configuration manuelle**

Créez un fichier `.env` à la racine du projet :

```bash
SPOTIFY_CLIENT_ID=votre_client_id_ici
REDIRECT_URI=http://127.0.0.1:8888/callback
```

## ▶️ Utilisation

### Lancer l'application

```bash
npm start
```

### Mode développement avec DevTools

```bash
npm run dev
```

### Workflow complet

1. **Configuration initiale** (si première utilisation)
   - L'assistant vous guide pour entrer le Client ID
   - La configuration est sauvegardée automatiquement

2. **Connexion à Spotify**
   - Cliquez sur "Se connecter avec Spotify"
   - Autorisez l'application dans votre navigateur
   - La fenêtre se ferme automatiquement après autorisation

3. **Parcourir vos playlists**
   - Toutes vos playlists s'affichent
   - Utilisez la barre de recherche pour filtrer
   - Cliquez sur une playlist pour voir les morceaux

4. **Sélectionner des morceaux**
   - Cliquez sur les cases à cocher pour sélectionner
   - Utilisez "Tout sélectionner" pour gagner du temps
   - Le compteur affiche le nombre de pistes sélectionnées

5. **Créer votre playlist**
   - Cliquez sur "Créer playlist"
   - Personnalisez le nom (suggéré automatiquement)
   - Choisissez la visibilité (publique/privée)
   - Suivez la progression en temps réel

6. **Accéder à votre création**
   - Copiez le lien de partage
   - Ouvrez directement dans Spotify
   - Retrouvez-la dans l'historique

7. **Gérer l'historique**
   - Cliquez sur "Historique" pour voir toutes vos créations
   - Accédez rapidement à vos playlists précédentes
   - Supprimez les entrées de l'historique si besoin

8. **Déconnexion**
   - Cliquez sur "Déconnexion" en haut à droite
   - Confirmez votre choix
   - Toutes les données locales sont effacées

## 📦 Build

### Créer un exécutable

```bash
# Pour votre système actuel
npm run build

# Pour un système spécifique
npm run build:mac    # macOS (.dmg)
npm run build:win    # Windows (.exe, portable)
npm run build:linux  # Linux (.AppImage)
```

Les fichiers générés se trouvent dans le dossier `dist/`

### Configuration du build

Le fichier `package.json` contient la configuration electron-builder :

```json
{
  "build": {
    "appId": "com.spotify.playlist-manager",
    "productName": "Spotify Playlist Manager",
    "directories": {
      "output": "dist"
    },
    "files": [
      "**/*",
      "!**/*.md",
      "!.env",
      "!.env.example"
    ],
    "mac": {
      "target": "dmg",
      "icon": "assets/icon.png"
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "assets/icon.png"
    },
    "linux": {
      "target": "AppImage",
      "icon": "assets/icon.png"
    }
  }
}
```

## 🐛 Dépannage

### L'écran de configuration s'affiche en boucle

**Cause** : Le fichier `.env` n'est pas créé ou le Client ID est vide.

**Solution** :
1. Vérifiez que vous avez bien saisi le Client ID dans l'assistant
2. En mode développement, vérifiez que le fichier `.env` existe à la racine
3. En production, le fichier est dans `AppData/Roaming/spotify-playlist-manager/` (Windows)

### "Erreur lors de la sauvegarde de la configuration"

**Cause** : Permissions insuffisantes pour écrire dans le dossier.

**Solution** :
1. Relancez l'application avec les droits administrateur (Windows)
2. Vérifiez les permissions du dossier `AppData` (Windows) ou `~/Library/Application Support` (macOS)

### La connexion Spotify ne fonctionne pas

**Cause** : Le callback OAuth n'est pas reçu.

**Solution** :
1. Vérifiez que le Redirect URI est exactement `http://127.0.0.1:8888/callback`
2. Ouvrez les DevTools (`Ctrl+Shift+I` / `Cmd+Option+I`) et regardez la console
3. Vérifiez que le serveur Express est bien démarré (message dans la console)

### Les playlists ne se chargent pas

**Cause** : Token expiré ou erreur réseau.

**Solution** :
1. Déconnectez-vous et reconnectez-vous
2. Vérifiez votre connexion Internet
3. Ouvrez les DevTools et regardez les erreurs dans l'onglet Network

### "Invalid redirect URI"

**Cause** : Le Redirect URI n'est pas configuré correctement sur Spotify Developer Dashboard.

**Solution** :
1. Allez sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Sélectionnez votre application
3. Cliquez sur "Settings"
4. Vérifiez que `http://127.0.0.1:8888/callback` est dans la liste des Redirect URIs
5. Sauvegardez et réessayez

### L'application ne se lance pas après build

**Cause** : Fichiers manquants ou configuration incorrecte.

**Solution** :
1. Vérifiez que toutes les dépendances sont installées (`npm install`)
2. Supprimez le dossier `dist/` et rebuilder
3. Vérifiez les logs de build pour identifier les erreurs

### Le checkpoint ne se charge pas après un crash

**Cause** : localStorage corrompu ou effacé.

**Solution** :
1. Cliquez sur "Ignorer" pour supprimer le checkpoint
2. Recréez votre playlist
3. Si le problème persiste, ouvrez les DevTools → Application → Local Storage et vérifiez `playlist_checkpoint`

## 🔒 Sécurité

- ✅ Les credentials ne sont **jamais** stockés dans le code source
- ✅ Utilisation du flux OAuth 2.0 PKCE (sans Client Secret)
- ✅ Le fichier `.env` est dans `.gitignore`
- ✅ Isolation du contexte via `contextBridge`
- ✅ Tokens stockés localement uniquement (localStorage)
- ✅ Communication IPC sécurisée entre processus
- ✅ Pas d'exécution de code distant

## 📄 Licence

MIT License - Libre d'utilisation et de modification

## 👤 Auteur

Créé avec ❤️ pour simplifier la gestion de playlists Spotify

---

**Note** : Cette application n'est pas affiliée à Spotify AB. Spotify est une marque déposée de Spotify AB.
