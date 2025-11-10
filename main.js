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
const overlay = document.getElementById("overlay");
const playOverlay = document.getElementById("playOverlay");
const startButton = document.getElementById("startButton");
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

// === Inicialização do Player ===
function startStream() {
  if (Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 10 });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {
        playOverlay.style.display = "flex";
      });
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
    video.play().catch(() => {
      playOverlay.style.display = "flex";
    });
  } else {
    console.error("HLS não suportado neste navegador.");
  }
}

// === Eventos de reprodução ===
video.addEventListener("playing", () => {
  overlay.classList.add("fade-out");
  playOverlay.style.display = "none";
});
video.addEventListener("error", () => {
  playOverlay.style.display = "flex";
});
startButton.addEventListener("click", () => {
  playOverlay.style.display = "none";
  startStream();
});

// === Controles customizados ===
playPause.addEventListener("click", () => {
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
});
muteToggle.addEventListener("click", () => {
  video.muted = !video.muted;
});

// === Chromecast ===
window.__onGCastApiAvailable = function (isAvailable) {
  if (!isAvailable) return;
  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED,
  });

  const castButton = document.getElementById("castButton");
  castButton.addEventListener("click", async () => {
    const session = context.getCurrentSession() || await context.requestSession();
    if (session) {
      const mediaInfo = new chrome.cast.media.MediaInfo(streamUrl, "application/x-mpegURL");
      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(request);
    }
  });
};

// === AirPlay ===
if (window.WebKitPlaybackTargetAvailabilityEvent) {
  airplayButton.style.display = "flex";
  airplayButton.addEventListener("click", () => {
    if (video.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker();
    }
  });
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
  cover = await getCoverFromLastfmTrackInfo(artist, title) ||
          await getCoverFromMusicBrainz(artist, title) ||
          await getCoverFromSpotify(artist, title);
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
window.addEventListener("load", () => setTimeout(startStream, 500));
GetLastFMSong();
setInterval(GetLastFMSong, 15000);
