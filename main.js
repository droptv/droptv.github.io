// === PWA Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(() => console.log("[PWA] Service worker registrado"))
    .catch(err => console.error("[PWA] Falha no registro", err));
}

// === Elementos globais ===
const streamUrl = "https://droptv.com.br/play.m3u8";
const video = document.getElementById("videoPlayer");
const dvMusic = document.getElementById("dv-musiqid");
const artistEl = document.getElementById("artist");
const titleEl = document.getElementById("title");
const coverEl = document.getElementById("cover");
const controls = document.getElementById("controls");
const playPause = document.getElementById("playPause");
const muteToggle = document.getElementById("muteToggle");
const playIcon = document.getElementById("playIcon");
const volumeIcon = document.getElementById("volumeIcon");
const overlay = document.getElementById("overlay");
const playOverlay = document.getElementById("playOverlay");
const startButton = document.getElementById("startButton");
const castButton = document.getElementById("castButton");
const airplayButton = document.getElementById("airplayButton");

let hideTimeout, hls;

// === Mostrar/ocultar UI ===
function showUI() {
  controls.classList.add("visible");
  dvMusic.classList.add("show");
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    controls.classList.remove("visible");
    dvMusic.classList.remove("show");
  }, 3000);
}
["mousemove", "touchstart"].forEach(e => document.addEventListener(e, showUI));

// === Detectar Safari ===
function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// === Inicialização do Player ===
function startStream() {
  if (!isSafari() && window.Hls && Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 10 });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => playOverlay.style.display = "flex");
    });
  } else {
    // Safari e iOS usam HLS nativo (necessário para AirPlay)
    video.src = streamUrl;
    video.addEventListener("loadedmetadata", () => {
      video.play().catch(() => playOverlay.style.display = "flex");
    });
  }
}

// === Overlay desaparece após 2s ===
window.addEventListener("load", () => {
  setTimeout(startStream, 500);
  setTimeout(() => {
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.style.display = "none", 1000);
  }, 2000);
});

// === Eventos do player ===
video.addEventListener("playing", () => {
  playOverlay.style.display = "none";
  updatePlayIcon();
});
video.addEventListener("pause", updatePlayIcon);
video.addEventListener("volumechange", updateMuteIcon);

// === Controles customizados ===
playPause.addEventListener("click", () => {
  if (video.paused) video.play();
  else video.pause();
});

muteToggle.addEventListener("click", () => video.muted = !video.muted);

// === Toggle ícones ===
function updatePlayIcon() {
  playIcon.innerHTML = video.paused
    ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M14.752 11.168l-5.197-3.01A1 1 0 008 9.01v5.98a1 1 0 001.555.832l5.197-3.01a1 1 0 000-1.664z"/>`
    : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M10 9v6m4-6v6"/>`;
}

function updateMuteIcon() {
  volumeIcon.innerHTML = video.muted
    ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M11 5L6 9H3v6h3l5 4V5z M19 9l-4 4m0-4l4 4"/>`
    : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M11 5L6 9H3v6h3l5 4V5z"/>`;
}
updateMuteIcon(); // Ícone inicial correto (muted on)

// === Chromecast + AirPlay (detecção inteligente) ===
function initChromecast() {
  if (!window.cast || !window.cast.framework) {
    setTimeout(initChromecast, 500);
    return;
  }

  const ctx = cast.framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED,
  });

  castButton.addEventListener("click", async () => {
    const session = ctx.getCurrentSession() || await ctx.requestSession();
    if (session) {
      const mediaInfo = new chrome.cast.media.MediaInfo(streamUrl, "application/x-mpegURL");
      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(request);
    }
  });
}

// Safari → apenas AirPlay / Chrome → apenas Chromecast
if (window.WebKitPlaybackTargetAvailabilityEvent) {
  castButton.style.display = "none";
  airplayButton.style.display = "flex";
  airplayButton.addEventListener("click", () => {
    if (video.webkitShowPlaybackTargetPicker)
      video.webkitShowPlaybackTargetPicker();
  });
} else {
  airplayButton.style.display = "none";
  initChromecast();
}

// === Last.fm + Spotify + MusicBrainz ===
const lastFmKey = "1423897f73010d0c35257f51be892a1c";
const username = "droptv";
let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;
const spotifyClientId = "61c0bd5f320646a3af8ef4c6f23d4855";
const spotifyClientSecret = "ef8630f80af44ea2b34561c0a565ecbe";

let currentTrackInfo = { title: "", artist: "", cover: "" };

// === Token Spotify ===
async function getSpotifyToken() {
  if (spotifyAccessToken && spotifyTokenExpiry > Date.now()) return spotifyAccessToken;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${spotifyClientId}&client_secret=${spotifyClientSecret}`,
    });
    const data = await res.json();
    spotifyAccessToken = data.access_token;
    spotifyTokenExpiry = Date.now() + data.expires_in * 1000;
    return spotifyAccessToken;
  } catch (err) {
    console.error("Erro ao obter token Spotify:", err);
    return null;
  }
}

// === Fallbacks de capa ===
async function getCoverFromSpotify(artist, trackName) {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;
    const query = encodeURIComponent(`${artist} ${trackName}`);
    const res = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const item = data.tracks?.items?.[0];
    return item?.album?.images?.[0]?.url || null;
  } catch {
    return null;
  }
}
async function getCoverFromMusicBrainz(artist, trackName) {
  try {
    const query = encodeURIComponent(`${artist} AND ${trackName}`);
    const res = await fetch(`https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json`);
    const data = await res.json();
    const rec = data.recordings?.[0];
    const rel = rec?.releases?.[0]?.id;
    if (!rel) return null;
    const coverUrl = `https://coverartarchive.org/release/${rel}/front`;
    const check = await fetch(coverUrl, { method: "HEAD" });
    return check.ok ? coverUrl : null;
  } catch {
    return null;
  }
}
async function getCoverFromLastfmTrackInfo(artist, trackName) {
  try {
    const a = encodeURIComponent(artist);
    const t = encodeURIComponent(trackName);
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=track.getinfo&artist=${a}&track=${t}&api_key=${lastFmKey}&format=json`);
    const data = await res.json();
    const img = data.track?.album?.image;
    if (Array.isArray(img)) {
      const large = img.reverse().find(i => i["#text"]);
      return large?.["#text"] || null;
    }
    return null;
  } catch {
    return null;
  }
}
async function getCoverImageWithFallbacks(track) {
  const artist = track.artist?.["#text"] || "Unknown";
  const title = track.name || "Unknown";
  let cover = null;
  if (track.image?.length) {
    const lastfmImage = track.image.reverse().find(i => i["#text"]);
    if (lastfmImage?.["#text"]) return lastfmImage["#text"];
  }
  cover = await getCoverFromLastfmTrackInfo(artist, title)
    || await getCoverFromMusicBrainz(artist, title)
    || await getCoverFromSpotify(artist, title);
  return cover || "musique.png";
}

// === Atualização periódica da faixa ===
async function GetLastFMSong() {
  try {
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${lastFmKey}&limit=1&format=json`
    );
    const data = await res.json();
    const track = Array.isArray(data.recenttracks.track)
      ? data.recenttracks.track[0]
      : data.recenttracks.track;
    if (track?.["@attr"]?.nowplaying === "true") {
      const title = track.name || "Faixa Desconhecida";
      const artist = track.artist?.["#text"] || "Artista Desconhecido";
      currentTrackInfo = { title, artist };
      const cover = await getCoverImageWithFallbacks(track);
      currentTrackInfo.cover = cover || "musique.png";
      updateUI();
      updateMediaSession();
    }
  } catch (err) {
    console.error("Erro ao consultar Last.fm:", err);
  }
}
function updateUI() {
  titleEl.textContent = currentTrackInfo.title;
  artistEl.textContent = currentTrackInfo.artist;
  coverEl.src = currentTrackInfo.cover;
}
function updateMediaSession() {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrackInfo.title,
      artist: currentTrackInfo.artist,
      artwork: [{ src: currentTrackInfo.cover, sizes: "512x512", type: "image/png" }],
    });
  }
}

// === Inicialização ===
GetLastFMSong();
setInterval(GetLastFMSong, 15000);
