// === PWA Service Worker Registration ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(() => console.log('[PWA] Service worker registrado'))
    .catch(err => console.error('[PWA] Falha no registro', err));
}

// === Configurações globais ===
const streamUrl = "https://droptv.com.br/play.m3u8";
const video = document.getElementById("videoPlayer");
const dvMusic = document.getElementById("dv-musiqid");
let hideTimeout;

const currentTrackInfo = {
  title: '',
  artist: '',
  cover: '',
  url: streamUrl
};

// === Mostrar / esconder barra de música ===
function showMusicBar() {
  dvMusic.style.opacity = 1;
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => dvMusic.style.opacity = 0, 4000);
}

["mousemove", "touchstart", "scroll", "keydown"].forEach(e =>
  document.addEventListener(e, showMusicBar)
);

// === Overlay fade ===
setTimeout(() => {
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.style.display = "none";
}, 2500);

// === Inicializa player HLS ===
function initPlayer() {
  if (Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 10 });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
    video.addEventListener("loadedmetadata", () => video.play());
  } else {
    console.error("[Player] HLS não suportado neste navegador.");
  }
}

initPlayer();

// === Chromecast Sender Setup ===
window.__onGCastApiAvailable = function(isAvailable) {
  if (isAvailable) initializeCastApi();
};

function initializeCastApi() {
  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED
  });

  document.getElementById('castButton').addEventListener('click', async () => {
    const session = await context.requestSession();
    if (session && currentTrackInfo.url) {
      const mediaInfo = new chrome.cast.media.MediaInfo(currentTrackInfo.url, 'application/x-mpegURL');
      mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
      mediaInfo.metadata.title = currentTrackInfo.title || "DropTV";
      mediaInfo.metadata.artist = currentTrackInfo.artist || "Streaming Live";
      mediaInfo.metadata.images = [{ url: currentTrackInfo.cover || "musique.png" }];

      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(request).then(() => console.log('[Cast] Enviado com sucesso'));
    }
  });
}

// === Integração com LastFM / Spotify ===
const lastFmKey = "1423897f73010d0c35257f51be892a1c";
const username = "droptv";
const spotifyClientId = "61c0bd5f320646a3af8ef4c6f23d4855";
const spotifyClientSecret = "ef8630f80af44ea2b34561c0a565ecbe";
let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

// Atualiza informações de faixa a cada 15s
GetLastFMSong();
setInterval(GetLastFMSong, 15000);

async function GetLastFMSong() {
  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${lastFmKey}&limit=1&format=json`);
    const data = await res.json();

    if (data.recenttracks && data.recenttracks.track) {
      const track = Array.isArray(data.recenttracks.track)
        ? data.recenttracks.track[0]
        : data.recenttracks.track;

      if (track["@attr"] && track["@attr"].nowplaying === "true") {
        currentTrackInfo.title = track.name || "Unknown Track";
        currentTrackInfo.artist = track.artist["#text"] || "Unknown Artist";

        const coverUrl = await getCoverImageWithFallbacks(track);
        currentTrackInfo.cover = coverUrl || "musique.png";

        updateUI();
        updateMediaSession();
      }
    }
  } catch (err) {
    console.error("[LastFM] Erro ao buscar faixa:", err);
  }
}

function updateUI() {
  document.getElementById("title").textContent = currentTrackInfo.title;
  document.getElementById("artist").textContent = currentTrackInfo.artist + " / ";
  document.getElementById("cover").src = currentTrackInfo.cover;
  showMusicBar();
}

function updateMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrackInfo.title,
      artist: currentTrackInfo.artist,
      artwork: [
        { src: currentTrackInfo.cover, sizes: '512x512', type: 'image/png' }
      ]
    });
  }
}

// === Fallbacks de capa (Spotify / MusicBrainz) ===
async function getCoverImageWithFallbacks(track) {
  try {
    // 1️⃣ Tenta pegar a imagem do próprio LastFM
    if (track.image && track.image.length > 0) {
      const largeImg = track.image.pop()["#text"];
      if (largeImg) return largeImg;
    }

    // 2️⃣ Tenta Spotify
    const spotifyUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(track.artist["#text"] + " " + track.name)}&type=track&limit=1`;
    const token = await getSpotifyAccessToken();
    const res = await fetch(spotifyUrl, { headers: { Authorization: `Bearer ${token}` } });
    const spotifyData = await res.json();

    if (spotifyData.tracks?.items?.length > 0) {
      return spotifyData.tracks.items[0].album.images[0].url;
    }

    // 3️⃣ Fallback: MusicBrainz
    const mbRes = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(track.artist["#text"] + " " + track.name)}&fmt=json`);
    const mbData = await mbRes.json();
    const releaseId = mbData.recordings?.[0]?.releases?.[0]?.id;

    if (releaseId) {
      const coverRes = await fetch(`https://coverartarchive.org/release/${releaseId}`);
      const coverData = await coverRes.json();
      if (coverData.images?.length > 0) return coverData.images[0].image;
    }
  } catch (err) {
    console.warn("[Capa] Falha nos fallbacks", err);
  }
  return null;
}

// === Token Spotify ===
async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyAccessToken && now < spotifyTokenExpiry) return spotifyAccessToken;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${spotifyClientId}:${spotifyClientSecret}`)
    },
    body: "grant_type=client_credentials"
  });

  const data = await res.json();
  spotifyAccessToken = data.access_token;
  spotifyTokenExpiry = now + data.expires_in * 1000;
  return spotifyAccessToken;
}
