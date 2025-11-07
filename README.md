
# Spotify Playlist Manager

Application de bureau pour créer des playlists Spotify à partir de morceaux sélectionnés dans vos playlists existantes.

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

# Créer le fichier .env
cp .env.example .env
```

### 4. Configuration

Éditez le fichier `.env` et ajoutez votre Client ID :

```bash
SPOTIFY_CLIENT_ID=votre_client_id_ici
REDIRECT_URI=http://127.0.0.1:8888/callback
```

## ▶️ Utilisation

### Lancer l'application

```bash
npm start
```

### Utilisation

1. **Connexion** : Cliquez sur "Se connecter avec Spotify"
2. **Autorisez** l'application dans votre navigateur
3. **Sélectionnez** une playlist
4. **Choisissez** les morceaux à ajouter
5. **Créez** votre nouvelle playlist
6. **Partagez** le lien généré !

### Nouveauté : Système de checkpoint

L'application sauvegarde automatiquement votre progression lors de la création d'une playlist :

- **Sauvegarde automatique** : Chaque batch de 100 morceaux ajouté est sauvegardé
- **Récupération après crash** : Si l'application se ferme, vous verrez une notification au redémarrage
- **Historique** : Cliquez sur "Historique" pour retrouver toutes vos playlists créées (jusqu'à 50)
- **Lien direct** : Accédez rapidement à vos playlists depuis l'historique

## 📦 Build

### Créer un exécutable

```bash
# Pour votre système
npm run build

# Pour un système spécifique
npm run build:mac    # macOS (.dmg)
npm run build:win    # Windows (.exe)
npm run build:linux  # Linux (.AppImage)
```

Les fichiers se trouvent dans le dossier `dist/`

## ✨ Fonctionnalités

- ✅ Authentification OAuth sécurisée (PKCE)
- ✅ Liste de toutes vos playlists Spotify
- ✅ Recherche en temps réel
- ✅ Sélection multiple de morceaux
- ✅ Tri automatique par date d'ajout (récent en premier)
- ✅ Création de playlist Spotify
- ✅ Lien de partage instantané
- ✅ Interface moderne et fluide
- ✅ **Système de checkpoint automatique** - Sauvegarde la progression pendant la création
- ✅ **Historique des playlists** - Retrouvez toutes vos playlists créées
- ✅ **Récupération après crash** - Reprenez là où vous vous êtes arrêté

## 🔒 Sécurité

- Les credentials ne sont **jamais** stockés dans le code
- Utilisation du flux OAuth PKCE (plus sécurisé)
- Le fichier `.env` est dans `.gitignore`
- Le Client Secret n'est pas nécessaire (application publique)

## 🛠️ Technologies

- **Electron** : Application de bureau
- **Express** : Serveur local pour OAuth callback
- **Spotify Web API** : Intégration Spotify
- **dotenv** : Gestion des variables d'environnement

## 📝 Structure du projet

```
spotify-playlist-manager/
├── main.js              # Processus principal Electron
├── renderer.js          # Interface utilisateur
├── preload.js           # Bridge sécurisé
├── index.html           # Page HTML
├── package.json         # Configuration npm
├── .env                 # Variables d'environnement (à créer)
├── .env.example         # Template
└── .gitignore          # Fichiers ignorés par Git
```

## 🐛 Dépannage

### Erreur "Cannot read properties of undefined"

Vérifiez que votre fichier `.env` existe et contient le Client ID.

### Les playlists ne se chargent pas

1. Vérifiez votre connexion Internet
2. Ouvrez les DevTools (`Cmd+Option+I` / `Ctrl+Shift+I`)
3. Regardez les erreurs dans la console

### "Invalid redirect URI"

Assurez-vous que `http://127.0.0.1:8888/callback` est bien ajouté dans les paramètres de votre app Spotify.

## 📄 Licence

MIT

## 👤 Auteur

Votre nom