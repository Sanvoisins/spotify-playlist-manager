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
    state.isConfigured = config.isConfigured;

    if (!state.isConfigured) {
      console.log('⚠️ Configuration manquante');
      state.view = 'setup';
    }

    console.log('✅ Configuration chargée');
  } catch (error) {
    console.error('❌ Erreur chargement config:', error);
    state.view = 'setup';
    state.isConfigured = false;
  }
}

// Sauvegarder la configuration
async function saveConfig() {
  if (!state.setupClientId || state.setupClientId.trim() === '') {
    alert('⚠️ Veuillez entrer votre Client ID Spotify');
    return;
  }

  try {
    const response = await fetch('http://127.0.0.1:8888/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: state.setupClientId })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Configuration sauvegardée');
      // Recharger la config
      await loadConfig();
      state.view = 'auth';
      render();
    } else {
      alert(`❌ Erreur: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    alert('❌ Erreur lors de la sauvegarde de la configuration');
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
  isWaitingForAuth: false,
  playlistHistory: [],
  showHistory: false,
  pendingCheckpoint: null,
  isConfigured: false,
  setupClientId: ''
};

// Fonctions de gestion des checkpoints
function saveCheckpoint(checkpointData) {
  try {
    localStorage.setItem('playlist_checkpoint', JSON.stringify(checkpointData));
    console.log('✅ Checkpoint sauvegardé:', checkpointData);
  } catch (error) {
    console.error('❌ Erreur sauvegarde checkpoint:', error);
  }
}

function clearCheckpoint() {
  localStorage.removeItem('playlist_checkpoint');
  state.pendingCheckpoint = null;
}

function loadCheckpoint() {
  try {
    const saved = localStorage.getItem('playlist_checkpoint');
    if (saved) {
      const checkpoint = JSON.parse(saved);
      // Vérifier que le checkpoint n'est pas trop ancien (24h)
      if (Date.now() - checkpoint.timestamp < 24 * 60 * 60 * 1000) {
        state.pendingCheckpoint = checkpoint;
        return checkpoint;
      } else {
        clearCheckpoint();
      }
    }
  } catch (error) {
    console.error('❌ Erreur chargement checkpoint:', error);
  }
  return null;
}

function saveToHistory(playlistData) {
  try {
    const history = JSON.parse(localStorage.getItem('playlist_history') || '[]');
    const newEntry = {
      id: playlistData.id,
      name: playlistData.name,
      url: playlistData.url,
      trackCount: playlistData.trackCount,
      createdAt: Date.now(),
      sourcePlaylist: playlistData.sourcePlaylist,
      isPublic: playlistData.isPublic,
      lastTrack: playlistData.lastTrack || null
    };
    console.log('💾 Sauvegarde historique:', newEntry); // Debug
    history.unshift(newEntry);
    const limitedHistory = history.slice(0, 50);
    localStorage.setItem('playlist_history', JSON.stringify(limitedHistory));
    state.playlistHistory = limitedHistory;
    console.log('✅ Historique mis à jour');
  } catch (error) {
    console.error('❌ Erreur sauvegarde historique:', error);
  }
}

function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem('playlist_history') || '[]');
    state.playlistHistory = history;
  } catch (error) {
    console.error('❌ Erreur chargement historique:', error);
  }
}

function deleteFromHistory(playlistId) {
  try {
    const history = JSON.parse(localStorage.getItem('playlist_history') || '[]');
    const updatedHistory = history.filter(item => item.id !== playlistId);
    localStorage.setItem('playlist_history', JSON.stringify(updatedHistory));
    state.playlistHistory = updatedHistory;
    console.log('🗑️ Playlist supprimée de l\'historique');
    render();
  } catch (error) {
    console.error('❌ Erreur suppression historique:', error);
  }
}

// Détecter les playlists créées à partir d'autres playlists
function detectPlaylistOrigins() {
  const detected = [];
  // Regex pour matcher le pattern: "New - [nom source] - [date] SPM" ou l'ancien sans SPM
  const patternRegex = /^New - (.+) - (\d{4}-\d{2}-\d{2})( SPM)?$/;

  state.playlists.forEach(playlist => {
    const match = playlist.name.match(patternRegex);
    if (match) {
      const sourcePlaylistName = match[1];
      // Vérifier que la playlist source existe
      const sourcePlaylistExists = state.playlists.some(
        p => p.name === sourcePlaylistName && p.id !== playlist.id
      );

      if (sourcePlaylistExists) {
        detected.push({
          playlist: playlist,
          sourcePlaylistName: sourcePlaylistName,
          createdDate: match[2]
        });
      }
    }
  });

  return detected;
}

// Récupérer le dernier track d'une playlist
async function getLastTrackFromPlaylist(playlistId) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=1`,
      {
        headers: { 'Authorization': `Bearer ${state.token}` }
      }
    );
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      if (item.track) {
        return {
          id: item.track.id,
          name: item.track.name,
          artist: item.track.artists?.[0]?.name || 'Unknown',
          album: item.track.album?.name || 'Unknown',
          image: item.track.album?.images?.[0]?.url || null
        };
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Erreur récupération dernier track:', error);
    return null;
  }
}

// Wrapper pour débugger et appeler goToParentPlaylist
async function onParentPlaylistButtonClick(sourcePlaylistName, childLastTrackId) {
  console.log('\n========== 🔘 BOUTON CLIQUÉ - Voir playlist mère ==========');
  console.log(`   Source Playlist: "${sourcePlaylistName}"`);
  console.log(`   Child Last Track ID (avant): "${childLastTrackId}"`);

  // Chercher l'entry d'historique pour afficher le lastTrack
  const historyEntry = state.playlistHistory.find(h => h.sourcePlaylist === sourcePlaylistName);
  let finalTrackId = childLastTrackId;

  if (historyEntry) {
    console.log(`   Entry historique trouvée:`, historyEntry);
    console.log(`   LastTrack complet:`, historyEntry.lastTrack);
    console.log(`   ID présent dans historique: ${historyEntry.lastTrack?.id ? '✅ OUI' : '❌ NON'}`);

    // Si l'ID est undefined, le récupérer directement depuis Spotify
    if (!childLastTrackId || childLastTrackId === 'undefined') {
      console.log(`⚠️ ID undefined! Récupération depuis Spotify API...`);
      try {
        const lastTrackFromApi = await getLastTrackFromPlaylist(historyEntry.id);
        if (lastTrackFromApi && lastTrackFromApi.id) {
          finalTrackId = lastTrackFromApi.id;
          console.log(`✅ ID récupéré depuis API: ${finalTrackId}`);
          // Mettre à jour l'historique avec l'ID
          historyEntry.lastTrack = lastTrackFromApi;
          const history = JSON.parse(localStorage.getItem('playlist_history') || '[]');
          const index = history.findIndex(h => h.id === historyEntry.id);
          if (index !== -1) {
            history[index] = historyEntry;
            localStorage.setItem('playlist_history', JSON.stringify(history));
            state.playlistHistory = history;
            console.log(`✅ Historique mis à jour avec l'ID`);
          }
        }
      } catch (error) {
        console.error(`❌ Erreur récupération ID depuis API:`, error);
      }
    }
  }

  console.log(`   Child Last Track ID (final): "${finalTrackId}"`);
  goToParentPlaylist(sourcePlaylistName, finalTrackId);
}

// Naviguer vers la playlist mère et pré-sélectionner les tracks
async function goToParentPlaylist(sourcePlaylistName, childLastTrackId) {
  console.log('\n========== 🚀 DÉBUT goToParentPlaylist() ==========');
  console.log(`📥 Paramètres reçus:`);
  console.log(`   sourcePlaylistName: "${sourcePlaylistName}"`);
  console.log(`   childLastTrackId: "${childLastTrackId}"`);

  try {
    // Trouver la playlist mère par son nom
    console.log(`\n🔍 Recherche playlist mère: "${sourcePlaylistName}"`);
    console.log(`   Playlists disponibles: ${state.playlists.length}`);
    state.playlists.forEach((p, i) => {
      console.log(`   ${i}: "${p.name}"`);
    });

    const parentPlaylist = state.playlists.find(p => p.name === sourcePlaylistName);
    if (!parentPlaylist) {
      console.log(`❌ Playlist source NOT FOUND!`);
      alert(`❌ La playlist source "${sourcePlaylistName}" n'a pas été trouvée`);
      return;
    }

    console.log(`✅ Playlist mère trouvée: "${parentPlaylist.name}" (ID: ${parentPlaylist.id})`);

    // Fermer l'historique et sélectionner la playlist mère
    console.log(`\n📱 Mise à jour interface...`);
    state.showHistory = false;
    state.selectedPlaylist = parentPlaylist;
    state.loading = true;
    state.view = 'tracks';
    render();

    // Charger les tracks de la playlist mère
    try {
      console.log(`\n🎵 Chargement des tracks de: "${parentPlaylist.name}"`);
      let allTracks = [];
      let url = `https://api.spotify.com/v1/playlists/${parentPlaylist.id}/tracks`;
      let pageCount = 0;

      while (url) {
        pageCount++;
        console.log(`   📥 Chargement page ${pageCount}...`);
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await response.json();
        const newItems = data.items.filter(item => item.track && item.added_at);
        console.log(`       Page ${pageCount}: ${newItems.length} tracks`);
        allTracks = [...allTracks, ...newItems];
        url = data.next;
      }

      console.log(`✅ Total tracks chargées: ${allTracks.length}`);

      // Trier par date d'ajout (plus récent en premier)
      console.log(`\n📊 Tri par date d'ajout (plus récent en premier)...`);
      allTracks.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
      console.log(`✅ Tri effectué`);

      state.tracks = allTracks;
      state.selectedTracks = new Set();

      // Chercher l'index du dernier track de la playlist enfant par son ID unique
      console.log(`\n🔎 COMPARAISON DES IDs`);
      console.log(`🔍 Track enfant ID recherché: "${childLastTrackId}"`);
      console.log(`📊 Total tracks mère: ${allTracks.length}`);

      let childTrackIndex = -1;

      // Afficher tous les IDs des tracks pour le debug
      console.log(`\n📋 Liste des IDs des tracks mère:`);
      allTracks.forEach((t, i) => {
        console.log(`   ${i}: ID="${t.track.id}" | Nom="${t.track.name}"`);
      });

      // Chercher le track par ID
      console.log(`\n🔄 Boucle de recherche...`);
      for (let i = 0; i < allTracks.length; i++) {
        const currentTrackId = allTracks[i].track.id;
        const match = currentTrackId === childLastTrackId;

        console.log(`   Comparaison ${i}: "${currentTrackId}" === "${childLastTrackId}" ? ${match}`);

        if (match) {
          childTrackIndex = i;
          console.log(`\n✅ ✅ ✅ MATCH TROUVÉ! ✅ ✅ ✅`);
          console.log(`   Index: ${i}`);
          console.log(`   ID: "${currentTrackId}"`);
          console.log(`   Nom: "${allTracks[i].track.name}"`);
          console.log(`   URI: "${allTracks[i].track.uri}"`);
          break;
        }
      }

      if (childTrackIndex === -1) {
        console.log(`\n❌ ❌ ❌ AUCUN MATCH! ❌ ❌ ❌`);
        console.log(`Track enfant ID introuvable: "${childLastTrackId}"`);
        console.log(`⚠️ Aucune présélection effectuée`);
      } else {
        // Sélectionner tous les tracks du plus récent (index 0)
        // jusqu'au track AVANT le dernier track enfant (index = childTrackIndex - 1)
        // = Les tracks ajoutées APRÈS la création de la playlist enfant
        console.log(`\n✅ SÉLECTION DES TRACKS`);
        console.log(`📌 Du plus récent (index 0) jusqu'AVANT le track enfant (index ${childTrackIndex - 1})`);
        console.log(`📌 Total à sélectionner: ${childTrackIndex} track(s)`);

        for (let i = 0; i < childTrackIndex; i++) {
          const trackId = allTracks[i].track.id;
          state.selectedTracks.add(trackId);
          console.log(`   ✓ [${i}] Sélectionné: "${allTracks[i].track.name}" -> ID: "${trackId}"`);
        }

        console.log(`\n✅ SÉLECTION TERMINÉE`);
        console.log(`✅ Total dans state.selectedTracks: ${state.selectedTracks.size} track(s)`);
      }

      const today = new Date().toISOString().split('T')[0];
      state.newPlaylistName = `New - ${parentPlaylist.name} - ${today} SPM`;

      console.log(`\n📱 Mise à jour de l'interface...`);
      state.loading = false;
      render();

      console.log(`\n========== ✅ FIN goToParentPlaylist() ✅ ==========\n`);
    } catch (error) {
      console.error('❌ ❌ ❌ ERREUR chargement tracks mère:', error);
      console.error('Stack:', error.stack);
      state.loading = false;
      render();
    }
  } catch (error) {
    console.error('❌ ❌ ❌ ERREUR navigation playlist mère:', error);
    console.error('Stack:', error.stack);
    alert('❌ Erreur lors de l\'accès à la playlist source');
  }
}

// Ajouter les playlists détectées à l'historique
async function addDetectedPlaylistsToHistory(detectedPlaylists) {
  try {
    const history = JSON.parse(localStorage.getItem('playlist_history') || '[]');
    let updated = false;

    for (const detected of detectedPlaylists) {
      const { playlist, sourcePlaylistName } = detected;

      // Chercher si cette playlist existe déjà dans l'historique
      const existingIndex = history.findIndex(item => item.id === playlist.id);

      if (existingIndex !== -1) {
        // La playlist existe déjà dans l'historique
        const existingEntry = history[existingIndex];

        // Si elle n'a pas encore le dernier track, on le récupère
        if (!existingEntry.lastTrack) {
          console.log(`📥 Enrichissement du dernier track pour: ${playlist.name}`);
          const lastTrack = await getLastTrackFromPlaylist(playlist.id);
          existingEntry.lastTrack = lastTrack;
          updated = true;
        }
      } else {
        // La playlist n'existe pas dans l'historique, on la crée
        console.log(`📌 Playlist détectée ajoutée à l'historique: ${playlist.name}`);
        const lastTrack = await getLastTrackFromPlaylist(playlist.id);

        const newEntry = {
          id: playlist.id,
          name: playlist.name,
          url: playlist.external_urls?.spotify || '',
          trackCount: playlist.tracks?.total || 0,
          createdAt: Date.now(),
          sourcePlaylist: sourcePlaylistName,
          isPublic: playlist.public,
          lastTrack: lastTrack
        };

        history.unshift(newEntry);
        updated = true;
      }
    }

    if (updated) {
      // Limiter à 50 entrées
      const limitedHistory = history.slice(0, 50);
      localStorage.setItem('playlist_history', JSON.stringify(limitedHistory));
      state.playlistHistory = limitedHistory;
      console.log(`✅ Historique enrichi avec ${detectedPlaylists.length} détection(s)`);
      render();
    }
  } catch (error) {
    console.error('❌ Erreur ajout détections à historique:', error);
  }
}

async function deletePlaylist(playlistId, playlistName) {
  if (!confirm(`⚠️ ATTENTION ⚠️\n\nVoulez-vous vraiment SUPPRIMER définitivement la playlist :\n"${playlistName}" ?\n\nCette action est IRRÉVERSIBLE !\nLa playlist sera définitivement supprimée de votre compte Spotify.`)) {
    return;
  }

  try {
    console.log('🗑️ Suppression de la playlist:', playlistId);

    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 || response.status === 204) {
      console.log('✅ Playlist supprimée de Spotify');
      alert('✅ Playlist supprimée avec succès !');

      // Supprimer aussi de l'historique local si elle y est
      deleteFromHistory(playlistId);

      // Recharger la liste des playlists
      await fetchPlaylists();
    } else if (response.status === 403) {
      alert('❌ Erreur : Vous ne pouvez pas supprimer cette playlist.\n\nSeul le propriétaire d\'une playlist peut la supprimer.');
    } else {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Erreur suppression playlist:', error);
    alert('❌ Erreur lors de la suppression de la playlist.\n\nVérifiez que vous êtes bien le propriétaire de cette playlist.');
  }
}

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
  loadHistory();
  loadCheckpoint();
  setupAuthCodeListener(); // Écouter les codes via IPC
  startPollingForAuthCode(); // Garder le fallback polling
  render();
});

// Écouter le code d'autorisation via IPC (méthode principale)
function setupAuthCodeListener() {
  if (window.electronAPI && window.electronAPI.onSpotifyAuthCode) {
    window.electronAPI.onSpotifyAuthCode((code) => {
      console.log('✅ Code reçu via IPC');
      if (code && !state.token && state.isWaitingForAuth) {
        state.isWaitingForAuth = false;
        exchangeCodeForToken(code);
      }
    });
  }
}

// Fallback: polling pour assurer la compatibilité
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
      // Ne changer la vue que si la configuration est valide
      if (state.isConfigured) {
        state.view = 'playlists';
        render(); // Afficher immédiatement
        fetchPlaylists(); // Charger en arrière-plan
      }
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

function logout() {
  if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    // Nettoyer le localStorage
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_user');
    localStorage.removeItem('token_expiry');
    localStorage.removeItem('refresh_token');

    // Réinitialiser l'état
    state.token = null;
    state.user = null;
    state.playlists = [];
    state.selectedPlaylist = null;
    state.tracks = [];
    state.selectedTracks = new Set();
    state.searchQuery = '';
    state.view = 'auth';

    console.log('👋 Déconnexion réussie');
    render();
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

    // Filtrer pour ne garder que les playlists créées par l'utilisateur
    const userPlaylists = allPlaylists.filter(playlist =>
      playlist.owner.id === state.user.id
    );

    state.playlists = userPlaylists;
    console.log(`✅ ${userPlaylists.length} playlists personnelles chargées (${allPlaylists.length} au total)`);

    // Détecter et ajouter les playlists créées à partir d'autres playlists
    const detectedPlaylists = detectPlaylistOrigins();
    if (detectedPlaylists.length > 0) {
      await addDetectedPlaylistsToHistory(detectedPlaylists);
    }

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
    state.newPlaylistName = `New - ${playlist.name} - ${today} SPM`;
    
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
    const isSelected = state.selectedTracks.has(trackId);
    checkbox.innerHTML = `<i class="fa-${isSelected ? 'solid fa-square-check' : 'regular fa-square'}"></i>`;
    const trackItem = checkbox.closest('.track-item');
    if (trackItem) {
      if (isSelected) {
        trackItem.classList.add('selected');
      } else {
        trackItem.classList.remove('selected');
      }
    }
  }

  updateSelectionCounter();
}

function updateSelectionCounter() {
  const counter = document.querySelector('[data-selection-counter]');
  if (counter) {
    counter.textContent = `${state.selectedTracks.size} piste${state.selectedTracks.size > 1 ? 's' : ''} sélectionnée${state.selectedTracks.size > 1 ? 's' : ''}`;
  }
  const createBtn = document.querySelector('[data-create-btn]');
  if (createBtn) {
    createBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Créer playlist (${state.selectedTracks.size})`;
    createBtn.disabled = state.selectedTracks.size === 0;
  }
  const toggleAllBtn = document.querySelector('[data-toggle-all]');
  if (toggleAllBtn) {
    const allSelected = state.selectedTracks.size === state.tracks.length;
    toggleAllBtn.innerHTML = `<i class="fa-${allSelected ? 'solid' : 'regular'} fa-square-check"></i> ${allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}`;
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
    <div class="playlist-card">
      <button
        onclick='selectPlaylist(${JSON.stringify(playlist).replace(/'/g, "\\'")})'
        style="flex: 1; background: none; border: none; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 16px; padding: 0;"
      >
        ${playlist.images && playlist.images[0] ?
          `<img src="${playlist.images[0].url}" class="playlist-cover" />` :
          `<div class="playlist-cover-placeholder"><i class="fa-solid fa-music"></i></div>`
        }
        <div class="playlist-info">
          <div class="playlist-name">${playlist.name}</div>
          <div class="playlist-meta">${playlist.tracks.total} pistes</div>
        </div>
      </button>
      <button
        onclick="event.stopPropagation(); deletePlaylist('${playlist.id}', '${playlist.name.replace(/'/g, "\\'")}');"
        class="btn btn-icon"
        style="background: rgba(239,68,68,0.1); color: #dc2626;"
        title="Supprimer cette playlist de Spotify"
      >
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
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
    // Créer le checkpoint initial
    const checkpointData = {
      timestamp: Date.now(),
      playlistName: state.newPlaylistName,
      isPublic: state.isPublic,
      sourcePlaylist: {
        id: state.selectedPlaylist.id,
        name: state.selectedPlaylist.name
      },
      totalTracks: state.selectedTracks.size,
      tracksAdded: 0,
      status: 'creating'
    };
    saveCheckpoint(checkpointData);

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

    // Mettre à jour le checkpoint avec l'ID de la playlist
    checkpointData.playlistId = playlist.id;
    checkpointData.playlistUrl = playlist.external_urls.spotify;
    saveCheckpoint(checkpointData);

    const selectedTrackObjects = state.tracks.filter(t => state.selectedTracks.has(t.track.id));
    // Inverser pour retrouver l'ordre d'ajout original (state.tracks est trié du plus récent au plus vieux)
    const reversedTrackObjects = [...selectedTrackObjects].reverse();
    const uris = reversedTrackObjects.map(t => t.track.uri);
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

      const tracksAdded = Math.min(i + batchSize, uris.length);
      state.progress.current = tracksAdded;

      // Sauvegarder le checkpoint après chaque batch
      checkpointData.tracksAdded = tracksAdded;
      checkpointData.status = tracksAdded === uris.length ? 'completed' : 'in_progress';
      saveCheckpoint(checkpointData);

      console.log(`✅ Checkpoint: ${tracksAdded}/${uris.length} morceaux ajoutés`);
      render();
    }

    // Marquer comme terminé et sauvegarder dans l'historique
    checkpointData.status = 'completed';
    saveCheckpoint(checkpointData);

    // Récupérer le dernier morceau ajouté (le premier du tableau inversé = le dernier dans l'ordre chronologique)
    const lastTrackItem = reversedTrackObjects[reversedTrackObjects.length - 1];
    const lastTrack = lastTrackItem?.track;

    console.log('🎵 Dernier morceau (plus récent):', lastTrack); // Debug
    console.log(`   ID: ${lastTrack?.id}`);
    console.log(`   Nom: ${lastTrack?.name}`);

    saveToHistory({
      id: playlist.id,
      name: state.newPlaylistName,
      url: playlist.external_urls.spotify,
      trackCount: state.selectedTracks.size,
      sourcePlaylist: state.selectedPlaylist.name,
      isPublic: state.isPublic,
      lastTrack: lastTrack ? {
        id: lastTrack.id,
        name: lastTrack.name || 'Titre inconnu',
        artist: lastTrack.artists?.[0]?.name || 'Artiste inconnu',
        album: lastTrack.album?.name || '',
        image: lastTrack.album?.images?.[0]?.url || null
      } : null
    });

    state.createdPlaylistUrl = playlist.external_urls.spotify;
    state.progress = { current: 0, total: 0 };

    // Nettoyer le checkpoint après succès complet
    setTimeout(() => clearCheckpoint(), 2000);

    render();
  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur lors de la création de la playlist. Le checkpoint a été sauvegardé.');
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

  if (state.view === 'setup') {
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card" style="text-align: left;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div class="auth-icon" style="background: var(--warning); margin: 0 auto 16px;">
              <i class="fa-solid fa-gear"></i>
            </div>
            <h1>Configuration requise</h1>
            <p class="text-secondary">Configurez votre application Spotify pour continuer</p>
          </div>

          <div class="alert alert-warning mb-lg">
            <p style="font-weight: 600; margin-bottom: 8px;"><i class="fa-solid fa-circle-info"></i> Informations requises</p>
            <p class="text-small">Pour utiliser cette application, vous devez créer une application Spotify et obtenir un <strong>Client ID</strong>.</p>
          </div>

          <div class="mb-lg">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">
              <i class="fa-solid fa-key"></i> Spotify Client ID
            </label>
            <input
              type="text"
              placeholder="Exemple: 1a2b3c4d5e6f7g8h9i0j"
              value="${state.setupClientId}"
              oninput="state.setupClientId = this.value;"
              style="font-family: monospace;"
            />
            <p class="text-small mt-sm" style="color: var(--text-tertiary);">
              Votre identifiant unique d'application Spotify
            </p>
          </div>

          <div class="mb-xl" style="background: var(--khaki-light); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--cal-poly-green);">
            <p style="font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">
              <i class="fa-solid fa-circle-info"></i> Comment obtenir votre Client ID ?
            </p>
            <ol style="margin-left: 20px; font-size: 14px; color: var(--text-secondary); line-height: 1.8;">
              <li>Rendez-vous sur <a href="https://developer.spotify.com/dashboard" target="_blank" style="color: var(--cal-poly-green); font-weight: 500;">Spotify Developer Dashboard</a></li>
              <li>Connectez-vous avec votre compte Spotify</li>
              <li>Cliquez sur <strong>"Create app"</strong></li>
              <li>Remplissez les informations :
                <ul style="margin-left: 20px; margin-top: 4px;">
                  <li><strong>App name</strong> : Spotify Playlist Manager</li>
                  <li><strong>App description</strong> : Gestionnaire de playlists</li>
                  <li><strong>Redirect URI</strong> : <code style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 4px; font-size: 13px;">http://127.0.0.1:8888/callback</code></li>
                  <li><strong>API</strong> : Cochez "Web API"</li>
                </ul>
              </li>
              <li>Acceptez les conditions et cliquez sur <strong>"Save"</strong></li>
              <li>Cliquez sur <strong>"Settings"</strong></li>
              <li>Copiez le <strong>Client ID</strong> et collez-le ci-dessus</li>
            </ol>
          </div>

          <div style="text-align: center;">
            <button onclick="saveConfig()" class="btn btn-primary" style="width: 100%; max-width: 400px;">
              <i class="fa-solid fa-floppy-disk"></i> Sauvegarder et continuer
            </button>

            <div class="mt-md">
              <a href="https://developer.spotify.com/documentation/web-api" target="_blank" class="text-small" style="color: var(--cal-poly-green);">
                <i class="fa-solid fa-book"></i> Documentation complète
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (state.view === 'auth') {
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-icon">
            <i class="fa-solid fa-music"></i>
          </div>
          <h1>Spotify Playlist Manager</h1>
          <p class="text-secondary mb-xl">Créez de nouvelles playlists à partir de vos morceaux favoris</p>
          <button onclick="connectSpotify()" class="btn btn-primary" style="width: 100%;">
            <i class="fa-brands fa-spotify"></i> Se connecter avec Spotify
          </button>
        </div>
      </div>
    `;
  } else if (state.view === 'playlists') {
    const filteredPlaylists = state.playlists.filter(p =>
      p.name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );

    app.innerHTML = `
      <div class="page-wrapper">
        <div class="container">
          <div class="card">
            <div class="flex items-center justify-between mb-xl">
              <div>
                <h1>Mes Playlists</h1>
                <p class="text-secondary">Connecté en tant que ${state.user?.display_name}</p>
              </div>
              <div class="flex gap-sm">
                <button
                  onclick="state.showHistory = !state.showHistory; render();"
                  class="btn btn-secondary"
                >
                  <i class="fa-solid fa-clock-rotate-left"></i> Historique (${state.playlistHistory.length})
                </button>
                <button
                  onclick="logout();"
                  class="btn btn-secondary"
                  title="Se déconnecter"
                >
                  <i class="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
                </button>
              </div>
            </div>

            ${state.pendingCheckpoint && state.pendingCheckpoint.status !== 'completed' ? `
              <div class="alert alert-warning">
                <div class="flex justify-between mb-sm">
                  <div>
                    <p style="font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> Création interrompue</p>
                    <p class="text-small mb-sm">La playlist "${state.pendingCheckpoint.playlistName}" n'a pas été terminée</p>
                    <div class="flex gap-sm text-small">
                      <span class="badge badge-warning">
                        ${state.pendingCheckpoint.tracksAdded}/${state.pendingCheckpoint.totalTracks} morceaux ajoutés
                      </span>
                      <span style="opacity: 0.7;">
                        ${new Date(state.pendingCheckpoint.timestamp).toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </div>
                  <button onclick="clearCheckpoint(); render();" class="btn btn-icon" style="background: none; color: inherit;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                ${state.pendingCheckpoint.playlistUrl ? `
                  <div class="flex gap-sm mt-md" style="padding-top: 12px; border-top: 1px solid rgba(245,158,11,0.3);">
                    <a href="${state.pendingCheckpoint.playlistUrl}" target="_blank" class="btn btn-primary" style="flex: 1;">
                      <i class="fa-solid fa-link"></i> Voir la playlist
                    </a>
                    <button
                      onclick="saveToHistory({id: state.pendingCheckpoint.playlistId, name: state.pendingCheckpoint.playlistName, url: state.pendingCheckpoint.playlistUrl, trackCount: state.pendingCheckpoint.tracksAdded, sourcePlaylist: state.pendingCheckpoint.sourcePlaylist.name, isPublic: state.pendingCheckpoint.isPublic}); clearCheckpoint(); render();"
                      class="btn btn-ghost"
                    >
                      <i class="fa-solid fa-floppy-disk"></i> Sauvegarder et ignorer
                    </button>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <div class="mb-lg">
              <input
                type="search"
                data-search-input
                placeholder="Rechercher une playlist..."
                value="${state.searchQuery}"
              />
            </div>

            ${state.showHistory ? `
              <div class="mb-lg">
                <div class="flex justify-between items-center mb-md">
                  <h2><i class="fa-solid fa-clock-rotate-left"></i> Historique des playlists créées</h2>
                  <button onclick="state.showHistory = false; render();" class="btn btn-ghost"><i class="fa-solid fa-xmark"></i> Fermer</button>
                </div>

                ${state.playlistHistory.length === 0 ? `
                  <div class="text-center" style="padding: 48px;">
                    <i class="fa-solid fa-clock-rotate-left" style="font-size: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p class="text-secondary">Aucune playlist créée pour le moment</p>
                  </div>
                ` : `
                  <div class="max-h-600 overflow-auto">
                    ${state.playlistHistory.map((item) => `
                      <div class="history-item">
                        <div class="flex gap-md">
                          ${item.lastTrack && item.lastTrack.image ? `
                            <img src="${item.lastTrack.image}" class="history-cover" alt="Cover" />
                          ` : `
                            <div class="playlist-cover-placeholder" style="width: 80px; height: 80px;">
                              <i class="fa-solid fa-music" style="font-size: 32px;"></i>
                            </div>
                          `}
                          <div style="flex: 1;">
                            <h3>${item.name}</h3>
                            <p class="text-secondary text-small mb-sm">
                              ${item.trackCount} pistes • Depuis "${item.sourcePlaylist}"
                            </p>
                            ${item.lastTrack ? `
                              <p class="text-small" style="color: var(--text-tertiary); margin-bottom: 4px;">
                                <span style="opacity: 0.7;">Dernier morceau :</span> ${item.lastTrack.name}
                              </p>
                              <p class="text-small mb-sm" style="color: var(--text-tertiary); opacity: 0.7;">
                                ${item.lastTrack.artist}${item.lastTrack.album ? ' • ' + item.lastTrack.album : ''}
                              </p>
                            ` : ''}
                            <p class="text-small" style="color: var(--text-tertiary);">
                              ${new Date(item.createdAt).toLocaleString('fr-FR')} • ${item.isPublic ? 'Publique' : 'Privée'}
                            </p>
                          </div>
                          <div class="flex gap-sm" style="align-items: flex-start;">
                            ${item.lastTrack ? `
                              <button
                                onclick="onParentPlaylistButtonClick('${item.sourcePlaylist.replace(/'/g, "\\'")}', '${item.lastTrack.id}')"
                                class="btn btn-primary btn-icon"
                                title="Voir la playlist source et pré-sélectionner les nouveaux morceaux"
                              >
                                <i class="fa-solid fa-arrow-up"></i>
                              </button>
                            ` : ''}
                            <a href="${item.url}" target="_blank" class="btn btn-primary btn-icon" title="Ouvrir dans Spotify">
                              <i class="fa-solid fa-link"></i>
                            </a>
                            <button onclick="navigator.clipboard.writeText('${item.url}'); alert('Lien copié !');" class="btn btn-ghost btn-icon" title="Copier le lien">
                              <i class="fa-solid fa-copy"></i>
                            </button>
                            <button
                              onclick="if(confirm('Supprimer cette playlist de l\\'historique ?\\n\\nCela ne supprimera PAS la playlist de Spotify, seulement de l\\'historique local.')) { deleteFromHistory('${item.id}'); }"
                              class="btn btn-icon" style="background: rgba(239,68,68,0.1); color: #dc2626;"
                              title="Supprimer de l'historique"
                            >
                              <i class="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            ` : ''}

            <div class="max-h-600 overflow-auto" data-playlists-container>
              ${state.loading ?
                '<div class="loading-container"><p class="text-secondary"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des playlists...</p></div>' :
                filteredPlaylists.map(playlist => `
                  <div class="playlist-card">
                    <button
                      onclick='selectPlaylist(${JSON.stringify(playlist).replace(/'/g, "\\'")})'
                      style="flex: 1; background: none; border: none; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 16px; padding: 0;"
                    >
                      ${playlist.images && playlist.images[0] ?
                        `<img src="${playlist.images[0].url}" class="playlist-cover" />` :
                        `<div class="playlist-cover-placeholder"><i class="fa-solid fa-music"></i></div>`
                      }
                      <div class="playlist-info">
                        <div class="playlist-name">${playlist.name}</div>
                        <div class="playlist-meta">${playlist.tracks.total} pistes</div>
                      </div>
                    </button>
                    <button
                      onclick="event.stopPropagation(); deletePlaylist('${playlist.id}', '${playlist.name.replace(/'/g, "\\'")}');"
                      class="btn btn-icon"
                      style="background: rgba(239,68,68,0.1); color: #dc2626;"
                      title="Supprimer cette playlist de Spotify"
                    >
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
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
      <div class="page-wrapper">
        <div class="container">
          <div class="card">
            <button onclick="state.view='playlists'; render();" class="btn btn-ghost mb-sm"><i class="fa-solid fa-arrow-left"></i> Retour aux playlists</button>
            <h1>${state.selectedPlaylist?.name}</h1>
            <p class="text-secondary mb-lg">${state.tracks.length} pistes disponibles</p>

            <div class="card mb-lg" style="padding: 16px;">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-md">
                  <button onclick="toggleAllTracks()" data-toggle-all class="btn btn-ghost">
                    <i class="fa-${state.selectedTracks.size === state.tracks.length ? 'solid' : 'regular'} fa-square-check"></i> ${state.selectedTracks.size === state.tracks.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                  <span class="text-secondary" data-selection-counter>${state.selectedTracks.size} piste(s) sélectionnée(s)</span>
                </div>
                <button
                  onclick="state.view='creating'; render();"
                  data-create-btn
                  ${state.selectedTracks.size === 0 ? 'disabled' : ''}
                  class="btn btn-primary"
                >
                  <i class="fa-solid fa-plus"></i> Créer playlist (${state.selectedTracks.size})
                </button>
              </div>
            </div>

            <div style="max-height: 500px; overflow-y: auto;" data-tracks-list>
              ${state.tracks.map(item => `
                <div
                  onclick="toggleTrack('${item.track.id}')"
                  class="track-item ${state.selectedTracks.has(item.track.id) ? 'selected' : ''}"
                >
                  <span class="track-checkbox" data-track-id="${item.track.id}"><i class="fa-${state.selectedTracks.has(item.track.id) ? 'solid fa-square-check' : 'regular fa-square'}"></i></span>
                  ${item.track.album?.images[0] ? `<img src="${item.track.album.images[0].url}" class="track-cover" />` : ''}
                  <div class="track-info">
                    <div class="track-name">${item.track.name}</div>
                    <div class="track-artist">${item.track.artists.map(a => a.name).join(', ')} • ${item.track.album?.name}</div>
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
        <div class="auth-container">
          <div class="auth-card">
            <h2 class="text-center">Création de la playlist</h2>

            <div class="mb-lg">
              <label style="display: block; margin-bottom: 8px;" class="text-small">Nom de la playlist</label>
              <input
                type="text"
                value="${state.newPlaylistName}"
                oninput="state.newPlaylistName = this.value;"
              />
            </div>

            <div class="mb-xl">
              <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                <input type="checkbox" ${state.isPublic ? 'checked' : ''} onchange="state.isPublic = this.checked;" />
                <span>Playlist publique</span>
              </label>
            </div>

            ${state.progress.total > 0 ? `
              <div class="mb-lg">
                <div class="flex justify-between text-secondary text-small mb-sm">
                  <span><i class="fa-solid fa-spinner fa-spin"></i> Ajout des pistes... (checkpoint automatique)</span>
                  <span>${state.progress.current} / ${state.progress.total}</span>
                </div>
                <div class="progress-bar mb-sm">
                  <div class="progress-fill" style="width: ${(state.progress.current / state.progress.total) * 100}%;"></div>
                </div>
                <p class="text-small" style="color: var(--text-tertiary);">
                  <i class="fa-solid fa-circle-info"></i> Votre progression est sauvegardée automatiquement
                </p>
              </div>
            ` : ''}

            <div class="flex gap-sm">
              <button onclick="state.view='tracks'; render();" class="btn btn-secondary" style="flex: 1;">
                <i class="fa-solid fa-xmark"></i> Annuler
              </button>
              <button onclick="createPlaylist()" ${state.progress.total > 0 ? 'disabled' : ''} class="btn btn-primary" style="flex: 1;">
                ${state.progress.total > 0 ? '<i class="fa-solid fa-spinner fa-spin"></i> Création...' : '<i class="fa-solid fa-plus"></i> Créer'}
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      app.innerHTML = `
        <div class="auth-container">
          <div class="auth-card">
            <div class="auth-icon">
              <i class="fa-solid fa-circle-check"></i>
            </div>
            <h2 class="text-center">Playlist créée !</h2>
            <p class="text-secondary mb-xl">
              Votre playlist "${state.newPlaylistName}" contient ${state.selectedTracks.size} piste(s)
            </p>

            <div class="card mb-lg" style="padding: 16px; word-break: break-all; font-size: 14px;">
              ${state.createdPlaylistUrl}
            </div>

            <div class="flex gap-sm mb-md">
              <button onclick="copyToClipboard()" class="btn btn-secondary" style="flex: 1;">
                <i class="fa-solid fa-copy"></i> Copier
              </button>
              <a href="${state.createdPlaylistUrl}" target="_blank" class="btn btn-primary" style="flex: 1;">
                <i class="fa-solid fa-link"></i> Ouvrir
              </a>
            </div>

            <button onclick="state.view='playlists'; state.createdPlaylistUrl=null; state.selectedTracks=new Set(); render();" class="btn btn-ghost" style="width: 100%;">
              <i class="fa-solid fa-arrow-left"></i> Retour aux playlists
            </button>
          </div>
        </div>
      `;
    }
  }
}