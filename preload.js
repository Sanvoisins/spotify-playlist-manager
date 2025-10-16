const { contextBridge, ipcRenderer } = require('electron');

// Exposer une API sécurisée au renderer
contextBridge.exposeInMainWorld('electronAPI', {
  onSpotifyCallback: (callback) => {
    ipcRenderer.on('spotify-callback', (event, url) => {
      callback(url);
    });
  }
});