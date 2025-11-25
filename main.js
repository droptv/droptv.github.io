// === PWA Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/service-worker.js")
    .then(() => console.log("[PWA] Service worker registrado"))
    .catch(err => console.error("[PWA] Falha no registro", err));
}

// === Elementos globais ===
const streamUrl     = "https://droptv.com.br/play.m3u8";
const video         = document.getElementById("videoPlayer");
const dvMusic       = document.getElementById("dv-musiqid");
const artistEl      = document.getElementById("artist");
const titleEl       = document.getElementById("title");
const coverEl       = document.getElementById("cover");
const overlay       = document.getElementById("overlay");
const castControls  = document.getElementById("castControls");
const castButton    = document.getElementById("castButton");
const airplayButton = document.getElementById("airplayButton");

let hideTimeout = null;

/* =======================================================================
   LOGO INICIAL: sempre some após ~3s, independente do vídeo
   ======================================================================= */

setTimeout(() => {
  if (!overlay) return;
  overlay.classList.add("fade-out");
  // dá 1s para o fade-out completar
  setTimeout(() => {
    overlay.style.display = "none";
  }, 1000);
}, 3000);

/* =======================================================================
   UI: painel de música + botões de cast (despertar por 3s)
   ======================================================================= */

function showUI() {
  if (dvMusic)       dvMusic.classList.add("show");
  if (castControls)  castControls.classList.add("visible");

  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (dvMusic)      dvMusic.classList.remove("show");
    if (castControls) castControls.classList.remove("visible");
  }, 3000);
}

// Movimento / toque / clique em QUALQUER parte da página (inclui o vídeo)
["mousemove", "touchstart"].forEach(ev => {
  document.addEventListener(ev, showUI, { passive: true });
});
document.addEventListener("click", showUI);

// também acordar ao interagir direto com o vídeo (play/pause/seek)
if (video) {
  ["play", "pause", "seeking", "click"].forEach(ev => {
    video.addEventListener(ev, showUI);
  });
}

/* =======================================================================
   Chromecast + AirPlay
   ======================================================================= */

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
    try {
      const session = ctx.getCurrentSession() || await ctx.requestSession();
      if (!session) return;

      const mediaInfo = new chrome.cast.media.MediaInfo(
        streamUrl,
        "application/x-mpegURL"
      );
      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(request);
    } catch (err) {
      const code = err && err.code ? err.code : err;
      if (code === "cancel") {
        console.log("[Cast] sessão/cast cancelado pelo usuário (ok).");
      } else if (code === "session_error") {
        console.log("[Cast] não foi possível iniciar sessão de cast.", err);
      } else {
        console.error("[Cast] erro ao iniciar cast:", err);
      }
    }
  });
}

// Safari → apenas AirPlay / Chrome → apenas Chromecast
if (window.WebKitPlaybackTargetAvailabilityEvent) {
  // Safari: esconder Chromecast, mostrar AirPlay
  castButton.style.display = "none";
  airplayButton.style.display = "flex";
  airplayButton.addEventListener("click", () => {
    if (video && video.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker();
    }
  });
} else {
  // Chrome/Android TV: esconder AirPlay, inicializar Chromecast
  airplayButton.style.display = "none";
  initChromecast();
}

/* =======================================================================
   NOW PLAYING via https://droptv.com.br/now.json
   ======================================================================= */

let currentTrackInfo = { title: "", artist: "", cover: "" };
let lastMusicFile    = null; // detecta troca de música

async function fetchNowPlayingFromNowJson() {
  try {
    const res = await fetch("https://droptv.com.br/now.json", {
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      console.error("[now.json] HTTP error:", res.status, res.statusText);
      return;
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!contentType.includes("application/json")) {
      console.error(
        "[now.json] Conteúdo não é JSON:",
        "status =", res.status,
        "content-type =", contentType,
        "trecho =", text.slice(0, 120)
      );
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(
        "[now.json] Erro ao fazer JSON.parse:",
        e,
        "trecho =", text.slice(0, 120)
      );
      return;
    }

    if (!data || !data.music_file) {
      return;
    }

    // Só atualiza se a música trocou
    if (data.music_file === lastMusicFile) {
      return;
    }
    lastMusicFile = data.music_file;

    const title  = data.title  || "";
    const artist = data.artist || "";
    const cover  = (data.cover_url || "").trim(); // now.json já cuida de fallback

    currentTrackInfo = { title, artist, cover };
    updateUIFromTrack();
    updateMediaSession();
  } catch (err) {
    console.error("[now.json] Erro ao consultar now.json:", err);
  }
}

function updateUIFromTrack() {
  if (titleEl)  titleEl.textContent  = currentTrackInfo.title  || "";
  if (artistEl) artistEl.textContent = currentTrackInfo.artist || "";
  if (coverEl && currentTrackInfo.cover) {
    coverEl.src = currentTrackInfo.cover;
  }
}

function updateMediaSession() {
  if (!("mediaSession" in navigator) || !currentTrackInfo.cover) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title:  currentTrackInfo.title,
    artist: currentTrackInfo.artist,
    artwork: [
      {
        src:   currentTrackInfo.cover,
        sizes: "512x512",
        type:  "image/jpeg"
      }
    ]
  });

  navigator.mediaSession.setActionHandler("play", () => {
    if (video) video.play().catch(() => {});
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    if (video) video.pause();
  });
}

// Inicia o polling do now.json assim que o script carrega
fetchNowPlayingFromNowJson();
setInterval(fetchNowPlayingFromNowJson, 5000);
