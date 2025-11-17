# Spotify Playlist Manager

Une application de bureau Electron pour créer et gérer des playlists Spotify en sélectionnant des morceaux depuis vos playlists existantes.

![Electron](https://img.shields.io/badge/Electron-33.2.1-2c442c?style=flat-square)
![Node](https://img.shields.io/badge/Node-16%2B-0d0908?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-bfa688?style=flat-square)

## ✨ Fonctionnalités

- 🔐 **Authentification OAuth 2.0 PKCE** - Connexion sécurisée à Spotify
- 📋 **Parcourir vos playlists** - Accédez à toutes vos playlists Spotify
- 🎵 **Sélectionner des morceaux** - Interface intuitive avec cases à cocher
- ✅ **Créer des playlists** - Générées automatiquement à partir de votre sélection
- 📜 **Historique complet** - Retrouvez vos 50 dernières créations
- 🔄 **Système de checkpoint** - Récupération automatique après un crash
- 🌐 **Accès rapide** - Lien de partage direct vers vos nouvelles playlists
- 🔙 **Retour à la source** - Naviguer vers la playlist mère et pré-sélectionner les nouveaux morceaux
- 🔄 **Hot reload** - Changements en temps réel pendant le développement

## 🚀 Installation rapide

### 1. Prérequis
- [Node.js](https://nodejs.org) v16+
- Compte [Spotify Developer](https://developer.spotify.com/dashboard)

### 2. Configuration Spotify
1. Créez une app sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Copiez votre **Client ID**
3. Ajoutez le Redirect URI : `http://127.0.0.1:8888/callback`

### 3. Installation
```bash
git clone <repository-url>
cd spotify-playlist-manager
npm install
npm start
```

L'app lancera un assistant de configuration pour entrer votre Client ID.

## 📖 Guide d'utilisation

### Workflow complet

1. **Connexion** - Cliquez sur "Se connecter avec Spotify"
2. **Sélection de playlist** - Choisissez une playlist source
3. **Sélection des morceaux** - Cochez les morceaux à inclure
4. **Création** - Cliquez "Créer playlist"
5. **Personnalisation** - Nommez votre playlist (nom suggéré)
6. **Partage** - Copiez le lien ou ouvrez dans Spotify

### Fonctionnalités spéciales

- **Historique** - Cliquez sur "Historique" pour voir toutes vos créations
- **Retour à la source** - Bouton ↑ pour retourner à la playlist mère avec présélection automatique
- **Recherche** - Filtrez vos playlists en temps réel
- **Tout sélectionner** - Bouton pour cocher/décocher tous les morceaux

## 🛠️ Développement

### Démarrer en dev
```bash
npm start
```
L'app relance automatiquement à chaque modification (electron-reloader activé).

### Build pour la production
```bash
# Build pour votre système
npm run build

# Build spécifique
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

Les fichiers générés sont dans `dist/`

## 🏗️ Architecture

```
├── main.js        - Processus principal (Electron + Express)
├── renderer.js    - Logique métier (UI + API Spotify)
├── preload.js     - Bridge IPC sécurisé
├── index.html     - Structure HTML
└── styles.css     - Design system
```

**Stack** : Electron 33 + Express + Vanilla JS + Font Awesome

## 📊 Système de persistance

Tout est stocké dans `localStorage` :
- ✅ Tokens Spotify
- ✅ Historique des créations (50 max)
- ✅ Checkpoint en cas de crash
- ✅ Configuration utilisateur

## 🔒 Sécurité

- ✅ OAuth 2.0 PKCE (sans Client Secret)
- ✅ Tokens stockés localement uniquement
- ✅ Isolation du contexte (contextBridge)
- ✅ Pas de credentials en dur
- ✅ `.env` ignoré du contrôle de version

## ❓ Dépannage

**La connexion ne fonctionne pas ?**
- Vérifiez que le Redirect URI est exactement `http://127.0.0.1:8888/callback`
- Ouvrez les DevTools (`Ctrl+Shift+I`) et regardez la console

**Les playlists ne se chargent pas ?**
- Reconnectez-vous en cliquant "Déconnexion" puis "Se connecter"
- Vérifiez votre connexion Internet

**Le checkpoint ne se charge pas après un crash ?**
- Cliquez "Ignorer" pour effacer et recommencer

## 📄 Licence

MIT - Libre d'utilisation et de modification

## 👤 Auteur

Créé avec ❤️ par Antoine Sanvoisin

---

**Note** : Cette application n'est pas affiliée à Spotify AB. Spotify® est une marque déposée de Spotify AB.
