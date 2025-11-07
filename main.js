const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const fs = require('fs');
const dotenv = require('dotenv');

let mainWindow;
let server;
let pendingCode = null;

// Fonction pour charger la configuration depuis le bon emplacement
function loadEnvConfig() {
  const configDir = app.isPackaged ? app.getPath('userData') : __dirname;
  const envPath = path.join(configDir, '.env');

  if (fs.existsSync(envPath)) {
    console.log('📄 Chargement config depuis:', envPath);
    dotenv.config({ path: envPath });
  } else {
    console.log('⚠️ Aucun fichier .env trouvé dans:', envPath);
  }
}

function startCallbackServer() {
  const expressApp = express();
  
  expressApp.get('/callback', (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    
    if (error) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Erreur de connexion</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(to bottom right, #7f1d1d, #991b1b, #b91c1c);
              color: white;
            }
            .container {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 40px;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
            <h1 style="font-size: 24px; margin-bottom: 10px;">Erreur de connexion</h1>
            <p style="color: rgba(255,255,255,0.8);">Erreur: ${error}</p>
          </div>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
        </html>
      `);
      return;
    }
    
    if (code) {
      console.log('✅ Code d\'autorisation reçu sur le serveur');

      pendingCode = code;

      // Envoyer le code directement à la fenêtre principale via IPC
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('📤 Envoi du code à la fenêtre principale');
        mainWindow.webContents.send('spotify-auth-code', code);
      }

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connexion réussie</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(to bottom right, #064e3b, #065f46, #0d9488);
              color: white;
            }
            .container {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 40px;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
            <h1 style="font-size: 24px; margin-bottom: 10px;">Connexion réussie !</h1>
            <p style="color: rgba(255,255,255,0.8);">Retournez à l'application Spotify Playlist Manager.</p>
            <p style="font-size: 12px; margin-top: 20px; color: rgba(255,255,255,0.6);">Cette fenêtre va se fermer automatiquement...</p>
          </div>
          <script>setTimeout(() => window.close(), 2000);</script>
        </body>
        </html>
      `);
    }
  });
  
  expressApp.get('/get-pending-code', (req, res) => {
    if (pendingCode) {
      res.json({ code: pendingCode });
      pendingCode = null;
    } else {
      res.json({ code: null });
    }
  });
  
  // Endpoint pour récupérer les variables d'environnement
  expressApp.get('/config', (req, res) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.REDIRECT_URI || 'http://127.0.0.1:8888/callback';

    res.json({
      clientId: clientId || '',
      redirectUri: redirectUri,
      isConfigured: !!(clientId && clientId.trim() !== '')
    });
  });

  // Endpoint pour sauvegarder la configuration
  expressApp.use(express.json());
  expressApp.post('/save-config', (req, res) => {
    const { clientId } = req.body;

    if (!clientId || clientId.trim() === '') {
      return res.status(400).json({ error: 'Client ID est requis' });
    }

    // Utiliser app.getPath('userData') pour un chemin accessible en mode production
    const configDir = app.isPackaged ? app.getPath('userData') : __dirname;
    const envPath = path.join(configDir, '.env');
    const envContent = `SPOTIFY_CLIENT_ID=${clientId}\nREDIRECT_URI=http://127.0.0.1:8888/callback\n`;

    try {
      // Créer le dossier si nécessaire
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(envPath, envContent, 'utf8');

      // Recharger les variables d'environnement
      process.env.SPOTIFY_CLIENT_ID = clientId;
      process.env.REDIRECT_URI = 'http://127.0.0.1:8888/callback';

      console.log('✅ Configuration sauvegardée dans:', envPath);
      res.json({ success: true, message: 'Configuration sauvegardée avec succès' });
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      res.status(500).json({ error: `Erreur lors de la sauvegarde: ${error.message}` });
    }
  });
  
  server = expressApp.listen(8888, '127.0.0.1', () => {
    console.log('✅ Serveur callback démarré sur http://127.0.0.1:8888');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    backgroundColor: '#064e3b'
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  loadEnvConfig(); // Charger la config en premier
  startCallbackServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});