// Configuration - sera chargée depuis le serveur
let CLIENT_ID = '';
let REDIRECT_URI = '';
const SCOPES = 'playlist-read-private playlist-modify-public playlist-modify-private';

// Charger la configuration au démarrage
async function loadConfig() {
  try {
    const response = await fetch('http://127.0.0.1:8888/config');
    const config = await response.json();
    CLIENT_ID = config.clientId;
    REDIRECT_URI = config.redirectUri;
    console.log('✅ Configuration chargée');
  } catch (error) {
    console.error('❌ Erreur chargement config:', error);
    alert('Erreur: Impossible de charger la configuration. Assurez-vous que le fichier .env existe.');
  }
}

// State
let state = {
  view: 'auth',
  token: null,
  user: null,
  playlists: [],
  selectedPlaylist: null,
  tracks: [],
  selectedTracks: new Set(),
  searchQuery: '',
  loading: false,
  createdPlaylistUrl: null,
  newPlaylistName: '',
  isPublic: false,
  progress: { current: 0, total: 0 },
  isWaitingForAuth: false
};

// PKCE Helper Functions
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(buffer) {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig(); // Charger la config en premier
  loadSession();
  startPollingForAuthCode();
  render();
});

function startPollingForAuthCode() {
  setInterval(() => {
    const authCode = sessionStorage.getItem('spotify_auth_code');
    if (authCode && !state.token && state.isWaitingForAuth) {
      console.log('✅ Code trouvé dans sessionStorage');
      sessionStorage.removeItem('spotify_auth_code');
      state.isWaitingForAuth = false;
      exchangeCodeForToken(authCode);
    }
  }, 500);
  
  setInterval(async () => {
    if (state.isWaitingForAuth && !state.token) {
      try {
        const response = await fetch('http://127.0.0.1:8888/get-pending-code');
        const data = await response.json();
        if (data.code) {
          console.log('✅ Code trouvé via polling serveur');
          state.isWaitingForAuth = false;
          exchangeCodeForToken(data.code);
        }
      } catch (error) {
        // Serveur pas encore prêt
      }
    }
  }, 1000);
}

function loadSession() {
  const savedToken = localStorage.getItem('spotify_token');
  const savedUser = localStorage.getItem('spotify_user');
  const savedExpiry = localStorage.getItem('token_expiry');
  
  if (savedToken && savedUser && savedExpiry) {
    const expiryTime = parseInt(savedExpiry);
    if (Date.now() < expiryTime) {
      console.log('✅ Session existante trouvée');
      state.token = savedToken;
      state.user = JSON.parse(savedUser);
      state.view = 'playlists';
      render(); // Afficher immédiatement
      fetchPlaylists(); // Charger en arrière-plan
    }
  }
}

async function connectSpotify() {
  try {
    console.log('🔐 Démarrage authentification OAuth...');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    sessionStorage.setItem('code_verifier', codeVerifier);
    state.isWaitingForAuth = true;
    
    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${codeChallenge}` +
      `&show_dialog=true`;
    
    console.log('🌐 Ouverture navigateur...');
    window.open(authUrl, '_blank');
  } catch (error) {
    console.error('❌ Erreur PKCE:', error);
    alert('Erreur lors de la préparation de la connexion');
    state.isWaitingForAuth = false;
  }
}

async function exchangeCodeForToken(code) {
  const codeVerifier = sessionStorage.getItem('code_verifier');
  if (!codeVerifier) {
    console.error('❌ Code verifier manquant');
    return;
  }
  
  console.log('🔄 Échange code contre token...');
  
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: codeVerifier
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Erreur Spotify:', data);
      alert(`Erreur: ${data.error_description || data.error}`);
      state.isWaitingForAuth = false;
      return;
    }
    
    if (data.access_token) {
      console.log('✅ Token reçu !');
      const expiryTime = Date.now() + (data.expires_in * 1000);
      state.token = data.access_token;
      localStorage.setItem('spotify_token', data.access_token);
      localStorage.setItem('token_expiry', expiryTime.toString());
      
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      
      sessionStorage.removeItem('code_verifier');
      fetchUser(data.access_token);
    }
  } catch (error) {
    console.error('❌ Erreur échange:', error);
    state.isWaitingForAuth = false;
  }
}

async function fetchUser(token) {
  try {
    console.log('👤 Récupération utilisateur...');
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    state.user = await response.json();
    localStorage.setItem('spotify_user', JSON.stringify(state.user));
    console.log('✅ Utilisateur:', state.user.display_name);
    state.view = 'playlists';
    render(); // Afficher immédiatement l'écran
    fetchPlaylists(); // Charger playlists
  } catch (error) {
    console.error('❌ Erreur utilisateur:', error);
  }
}

async function fetchPlaylists() {
  state.loading = true;
  render();
  
  try {
    console.log('📋 Chargement playlists...');
    let allPlaylists = [];
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50';
    
    while (url) {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const data = await response.json();
      allPlaylists = [...allPlaylists, ...data.items];
      url = data.next;
    }
    
    state.playlists = allPlaylists;
    console.log(`✅ ${allPlaylists.length} playlists chargées`);
    state.loading = false;
    render();
  } catch (error) {
    console.error('❌ Erreur playlists:', error);
    state.loading = false;
    render();
  }
}

async function selectPlaylist(playlist) {
  state.selectedPlaylist = playlist;
  state.loading = true;
  state.view = 'tracks';
  render();
  
  try {
    console.log('🎵 Chargement pistes:', playlist.name);
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`;
    
    while (url) {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const data = await response.json();
      allTracks = [...allTracks, ...data.items.filter(item => item.track && item.added_at)];
      url = data.next;
    }
    
    // Trier par date d'ajout (plus récent en premier)
    allTracks.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
    
    state.tracks = allTracks;
    state.selectedTracks = new Set();
    
    const today = new Date().toISOString().split('T')[0];
    state.newPlaylistName = `New - ${playlist.name} - ${today}`;
    
    console.log(`✅ ${allTracks.length} pistes chargées (triées)`);
    state.loading = false;
    render();
  } catch (error) {
    console.error('❌ Erreur pistes:', error);
    state.loading = false;
    render();
  }
}

function toggleTrack(trackId) {
  if (state.selectedTracks.has(trackId)) {
    state.selectedTracks.delete(trackId);
  } else {
    state.selectedTracks.add(trackId);
  }
  
  // Mise à jour dynamique sans re-render complet
  const checkbox = document.querySelector(`[data-track-id="${trackId}"]`);
  if (checkbox) {
    checkbox.textContent = state.selectedTracks.has(trackId) ? '☑️' : '☐';
    checkbox.closest('div').style.background = state.selectedTracks.has(trackId) ? 
      'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)';
    checkbox.closest('div').style.border = state.selectedTracks.has(trackId) ? 
      '2px solid #10b981' : '2px solid transparent';
  }
  
  updateSelectionCounter();
  
  // Scroll smooth vers le haut
  setTimeout(() => {
    const tracksList = document.querySelector('[data-tracks-list]');
    if (tracksList) {
      tracksList.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 100);
}

function updateSelectionCounter() {
  const counter = document.querySelector('[data-selection-counter]');
  if (counter) {
    counter.textContent = `${state.selectedTracks.size} piste${state.selectedTracks.size > 1 ? 's' : ''} sélectionnée${state.selectedTracks.size > 1 ? 's' : ''}`;
  }
  const createBtn = document.querySelector('[data-create-btn]');
  if (createBtn) {
    createBtn.textContent = `Créer playlist (${state.selectedTracks.size})`;
    createBtn.disabled = state.selectedTracks.size === 0;
    createBtn.style.opacity = state.selectedTracks.size === 0 ? '0.5' : '1';
  }
  const toggleAllBtn = document.querySelector('[data-toggle-all]');
  if (toggleAllBtn) {
    toggleAllBtn.innerHTML = state.selectedTracks.size === state.tracks.length ? 
      '☑️ Tout désélectionner' : '☐ Tout sélectionner';
  }
}

function toggleAllTracks() {
  if (state.selectedTracks.size === state.tracks.length) {
    state.selectedTracks = new Set();
  } else {
    state.selectedTracks = new Set(state.tracks.map(t => t.track.id));
  }
  render();
}

function handleSearchInput(event) {
  state.searchQuery = event.target.value;
  const cursorPosition = event.target.selectionStart;
  
  const container = document.querySelector('[data-playlists-container]');
  if (!container) return;
  
  const filteredPlaylists = state.playlists.filter(p => 
    p.name.toLowerCase().includes(state.searchQuery.toLowerCase())
  );
  
  container.innerHTML = filteredPlaylists.map(playlist => `
    <button
      onclick='selectPlaylist(${JSON.stringify(playlist).replace(/'/g, "\\'")})'
      style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 16px;"
    >
      ${playlist.images && playlist.images[0] ?
        `<img src="${playlist.images[0].url}" style="width: 64px; height: 64px; border-radius: 8px;" />` :
        `<div style="width: 64px; height: 64px; background: rgba(16,185,129,0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 32px;">🎵</span></div>`
      }
      <div style="flex: 1;">
        <h3 style="color: white; font-weight: 600; margin-bottom: 4px;">${playlist.name}</h3>
        <p style="color: rgba(255,255,255,0.6); font-size: 14px;">${playlist.tracks.total} pistes</p>
      </div>
    </button>
  `).join('');
  
  setTimeout(() => {
    const input = document.querySelector('[data-search-input]');
    if (input) {
      input.focus();
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, 0);
}

async function createPlaylist() {
  if (state.selectedTracks.size === 0) return;
  
  state.view = 'creating';
  state.progress = { current: 0, total: state.selectedTracks.size };
  render();
  
  try {
    const createResponse = await fetch(`https://api.spotify.com/v1/users/${state.user.id}/playlists`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: state.newPlaylistName,
        description: `Créée depuis ${state.selectedPlaylist.name}`,
        public: state.isPublic
      })
    });
    
    const playlist = await createResponse.json();
    
    const selectedTrackObjects = state.tracks.filter(t => state.selectedTracks.has(t.track.id));
    const uris = selectedTrackObjects.map(t => t.track.uri);
    const batchSize = 100;
    
    for (let i = 0; i < uris.length; i += batchSize) {
      const batch = uris.slice(i, i + batchSize);
      await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: batch })
      });
      state.progress.current = Math.min(i + batchSize, uris.length);
      render();
    }
    
    state.createdPlaylistUrl = playlist.external_urls.spotify;
    render();
  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur lors de la création de la playlist');
    state.view = 'tracks';
    render();
  }
}

function copyToClipboard() {
  navigator.clipboard.writeText(state.createdPlaylistUrl);
  alert('Lien copié !');
}

// Render
function render() {
  const app = document.getElementById('app');
  
  if (state.view === 'auth') {
    app.innerHTML = `
      <div style="min-height: 100vh; background: linear-gradient(to bottom right, #064e3b, #065f46, #0d9488); display: flex; align-items: center; justify-content: center; padding: 24px;">
        <div style="background: rgba(255,255,255,0.1); backdrop-filter: blur(16px); border-radius: 24px; padding: 48px; max-width: 448px; width: 100%; text-align: center;">
          <div style="width: 80px; height: 80px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
            <span style="font-size: 40px;">🎵</span>
          </div>
          <h1 style="font-size: 30px; font-weight: bold; color: white; margin-bottom: 12px;">Spotify Playlist Manager</h1>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 32px;">Créez de nouvelles playlists à partir de vos morceaux favoris</p>
          <button onclick="connectSpotify()" style="width: 100%; background: #10b981; color: white; font-weight: 600; padding: 16px 24px; border-radius: 12px; border: none; cursor: pointer; font-size: 16px;">
            Se connecter avec Spotify
          </button>
        </div>
      </div>
    `;
  } else if (state.view === 'playlists') {
    const filteredPlaylists = state.playlists.filter(p => 
      p.name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );
    
    app.innerHTML = `
      <div style="min-height: 100vh; background: linear-gradient(to bottom right, #064e3b, #065f46, #0d9488); padding: 24px;">
        <div style="max-width: 1152px; margin: 0 auto;">
          <div style="background: rgba(255,255,255,0.1); backdrop-filter: blur(16px); border-radius: 24px; padding: 32px;">
            <div style="display: flex; align-items: center; justify-between; margin-bottom: 32px;">
              <div>
                <h1 style="font-size: 30px; font-weight: bold; color: white; margin-bottom: 8px;">Mes Playlists</h1>
                <p style="color: rgba(255,255,255,0.7);">Connecté en tant que ${state.user?.display_name}</p>
              </div>
            </div>
            
            <div style="margin-bottom: 24px;">
              <input 
                type="text" 
                data-search-input
                placeholder="Rechercher une playlist..." 
                value="${state.searchQuery}"
                style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; padding: 12px 16px; color: white; font-size: 16px;"
              />
            </div>
            
            <div style="max-height: 600px; overflow-y: auto;" data-playlists-container>
              ${state.loading ? 
                '<div style="display: flex; align-items: center; justify-content: center; padding: 48px;"><div style="color: white; font-size: 18px;">⏳ Chargement des playlists...</div></div>' :
                filteredPlaylists.map(playlist => `
                  <button
                    onclick='selectPlaylist(${JSON.stringify(playlist).replace(/'/g, "\\'")})'
                    style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 16px;"
                  >
                    ${playlist.images && playlist.images[0] ?
                      `<img src="${playlist.images[0].url}" style="width: 64px; height: 64px; border-radius: 8px;" />` :
                      `<div style="width: 64px; height: 64px; background: rgba(16,185,129,0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 32px;">🎵</span></div>`
                    }
                    <div style="flex: 1;">
                      <h3 style="color: white; font-weight: 600; margin-bottom: 4px;">${playlist.name}</h3>
                      <p style="color: rgba(255,255,255,0.6); font-size: 14px;">${playlist.tracks.total} pistes</p>
                    </div>
                  </button>
                `).join('')
              }
            </div>
          </div>
        </div>
      </div>
    `;
    
    const searchInput = document.querySelector('[data-search-input]');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearchInput);
    }
  } else if (state.view === 'tracks') {
    app.innerHTML = `
      <div style="min-height: 100vh; background: linear-gradient(to bottom right, #064e3b, #065f46, #0d9488); padding: 24px;">
        <div style="max-width: 1152px; margin: 0 auto;">
          <div style="background: rgba(255,255,255,0.1); backdrop-filter: blur(16px); border-radius: 24px; padding: 32px;">
            <button onclick="state.view='playlists'; render();" style="color: rgba(255,255,255,0.7); background: none; border: none; cursor: pointer; margin-bottom: 8px; font-size: 14px;">← Retour aux playlists</button>
            <h1 style="font-size: 30px; font-weight: bold; color: white; margin-bottom: 8px;">${state.selectedPlaylist?.name}</h1>
            <p style="color: rgba(255,255,255,0.7); margin-bottom: 24px;">${state.tracks.length} pistes disponibles</p>
            
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 16px;">
                <button onclick="toggleAllTracks()" data-toggle-all style="color: white; background: none; border: none; cursor: pointer;">
                  ${state.selectedTracks.size === state.tracks.length ? '☑️' : '☐'} ${state.selectedTracks.size === state.tracks.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <span style="color: rgba(255,255,255,0.7);" data-selection-counter>${state.selectedTracks.size} piste(s) sélectionnée(s)</span>
              </div>
              <button 
                onclick="state.view='creating'; render();" 
                data-create-btn
                ${state.selectedTracks.size === 0 ? 'disabled' : ''}
                style="background: #10b981; color: white; font-weight: 600; padding: 8px 24px; border-radius: 8px; border: none; cursor: pointer; ${state.selectedTracks.size === 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
              >
                Créer playlist (${state.selectedTracks.size})
              </button>
            </div>
            
            <div style="max-height: 500px; overflow-y: auto;" data-tracks-list>
              ${state.tracks.map(item => `
                <div 
                  onclick="toggleTrack('${item.track.id}')"
                  style="padding: 16px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; ${state.selectedTracks.has(item.track.id) ? 'background: rgba(16,185,129,0.2); border: 2px solid #10b981;' : 'background: rgba(255,255,255,0.05); border: 2px solid transparent;'}"
                >
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <span data-track-id="${item.track.id}">${state.selectedTracks.has(item.track.id) ? '☑️' : '☐'}</span>
                    ${item.track.album?.images[0] ? `<img src="${item.track.album.images[0].url}" style="width: 48px; height: 48px; border-radius: 4px;" />` : ''}
                    <div style="flex: 1; min-width: 0;">
                      <div style="color: white; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.track.name}</div>
                      <div style="color: rgba(255,255,255,0.7); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.track.artists.map(a => a.name).join(', ')} • ${item.track.album?.name}</div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (state.view === 'creating') {
    if (!state.createdPlaylistUrl) {
      app.innerHTML = `
        <div style="min-height: 100vh; background: linear-gradient(to bottom right, #064e3b, #065f46, #0d9488); display: flex; align-items: center; justify-content: center; padding: 24px;">
          <div style="background: rgba(255,255,255,0.1); backdrop-filter: blur(16px); border-radius: 24px; padding: 48px; max-width: 448px; width: 100%;">
            <h2 style="font-size: 24px; font-weight: bold; color: white; margin-bottom: 24px; text-align: center;">Création de la playlist</h2>
            
            <div style="margin-bottom: 24px;">
              <label style="display: block; color: rgba(255,255,255,0.9); margin-bottom: 8px; font-size: 14px;">Nom de la playlist</label>
              <input 
                type="text" 
                value="${state.newPlaylistName}" 
                oninput="state.newPlaylistName = this.value;"
                style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 12px 16px; color: white; font-size: 16px;"
              />
            </div>
            
            <div style="margin-bottom: 32px;">
              <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; color: white;">
                <input type="checkbox" ${state.isPublic ? 'checked' : ''} onchange="state.isPublic = this.checked;" style="width: 20px; height: 20px;" />
                <span>Playlist publique</span>
              </label>
            </div>
            
            ${state.progress.total > 0 ? `
              <div style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 8px;">
                  <span>Ajout des pistes...</span>
                  <span>${state.progress.current} / ${state.progress.total}</span>
                </div>
                <div style="width: 100%; background: rgba(255,255,255,0.1); border-radius: 9999px; height: 8px;">
                  <div style="background: #10b981; height: 8px; border-radius: 9999px; width: ${(state.progress.current / state.progress.total) * 100}%;"></div>
                </div>
              </div>
            ` : ''}
            
            <div style="display: flex; gap: 12px;">
              <button onclick="state.view='tracks'; render();" style="flex: 1; background: rgba(255,255,255,0.1); color: white; font-weight: 600; padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px;">
                Annuler
              </button>
              <button onclick="createPlaylist()" ${state.progress.total > 0 ? 'disabled' : ''} style="flex: 1; background: #10b981; color: white; font-weight: 600; padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px; ${state.progress.total > 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                ${state.progress.total > 0 ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      app.innerHTML = `
        <div style="min-height: 100vh; background: linear-gradient(to bottom right, #064e3b, #065f46, #0d9488); display: flex; align-items: center; justify-content: center; padding: 24px;">
          <div style="background: rgba(255,255,255,0.1); backdrop-filter: blur(16px); border-radius: 24px; padding: 48px; max-width: 448px; width: 100%; text-align: center;">
            <div style="width: 80px; height: 80px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
              <span style="font-size: 40px;">🎵</span>
            </div>
            <h2 style="font-size: 30px; font-weight: bold; color: white; margin-bottom: 12px;">Playlist créée ! 🎉</h2>
            <p style="color: rgba(255,255,255,0.7); margin-bottom: 32px;">
              Votre playlist "${state.newPlaylistName}" contient ${state.selectedTracks.size} piste(s)
            </p>
            
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-bottom: 24px; word-break: break-all; color: rgba(255,255,255,0.9); font-size: 14px;">
              ${state.createdPlaylistUrl}
            </div>
            
            <div style="display: flex; gap: 12px; margin-bottom: 16px;">
              <button onclick="copyToClipboard()" style="flex: 1; background: rgba(255,255,255,0.1); color: white; font-weight: 600; padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px;">
                📋 Copier
              </button>
              <a href="${state.createdPlaylistUrl}" target="_blank" style="flex: 1; background: #10b981; color: white; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px;">
                🔗 Ouvrir
              </a>
            </div>
            
            <button onclick="state.view='playlists'; state.createdPlaylistUrl=null; state.selectedTracks=new Set(); render();" style="width: 100%; background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 16px;">
              Retour aux playlists
            </button>
          </div>
        </div>
      `;
    }
  }
}