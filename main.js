// === PWA Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(() => console.log("[PWA] Service worker registrado"))
    .catch(err => console.error("[PWA] Falha no registro", err));
}

// === Elementos globais ===
const streamUrl = "https://droptv.com.br/play.m3u8";
const iframe = document.getElementById("videoFrame");
const dvMusic = document.getElementById("dv-musiqid");
const artistEl = document.getElementById("artist");
const titleEl = document.getElementById("title");
const coverEl = document.getElementById("cover");
const overlay = document.getElementById("overlay");
const castControls = document.getElementById("castControls");
const castButton = document.getElementById("castButton");
const airplayButton = document.getElementById("airplayButton");

let hideTimeout;

// === Mostrar/ocultar UI (painel de música + cast) ===
function showUI() {
  dvMusic.classList.add("show");
  castControls.classList.add("visible");

  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    dvMusic.classList.remove("show");
    castControls.classList.remove("visible");
  }, 3000);
}

// Captura movimento/click em qualquer lugar da página (fora do iframe)
["mousemove", "touchstart"].forEach(ev => {
  document.addEventListener(ev, showUI, { passive: true });
});

// === Overlay inicial ===
window.addEventListener("load", () => {
  // Inicia o iframe (player nativo do browser/TV)
  iframe.src = streamUrl;

  // Remove o overlay de logo após 2s
  setTimeout(() => {
    overlay.classList.add("fade-out");
    setTimeout(() => (overlay.style.display = "none"), 1000);
  }, 2000);

  // Inicia o polling do now.json
  fetchNowPlayingFromNowJson();
  setInterval(fetchNowPlayingFromNowJson, 5000); // ajuste o intervalo se quiser
});

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
    if (err === "cancel" || (err && err.code === "cancel")) {
      console.log("[Cast] sessão/cast cancelado pelo usuário (ok).");
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
    const vid = document.createElement("video");
    vid.src = streamUrl;
    if (vid.webkitShowPlaybackTargetPicker) {
      vid.webkitShowPlaybackTargetPicker();
    }
  });
} else {
  // Chrome/Android TV: esconder AirPlay, inicializar Chromecast
  airplayButton.style.display = "none";
  initChromecast();
}

/* =======================================================================
   NOW PLAYING via /now.json (sem fallback local)
   ======================================================================= */

// Estado atual da faixa
let currentTrackInfo = {
  title: "",
  artist: "",
  cover: ""
};

// Usado para detectar troca de música
let lastMusicFile = null;

async function fetchNowPlayingFromNowJson() {
  try {
    const res = await fetch("https://droptv.com.br/now.json", {
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      console.error("[now.json] HTTP error:", res.status, res.statusText);
      return;
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    // Se não for JSON, provavelmente recebemos HTML (index, erro etc.)
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

    // Esperado:
    // {
    //   "artist":"Kurt Vile",
    //   "title":"Baby’s Arm",
    //   "music_file":"08-04_-_Kurt_Vile_-_Baby_s_Arm.mp3",
    //   "video_file":"filmes/....mkv",
    //   "cover_url":"https://droptv.com.br/cdn-cgi/image/.../front"
    // }

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
    updateUI();
    updateMediaSession();

    // NÃO chamamos showUI() aqui: o painel só aparece com movimento de mouse/touch

  } catch (err) {
    console.error("[now.json] Erro ao consultar now.json:", err);
  }
}

function updateUI() {
  titleEl.textContent = currentTrackInfo.title || "";
  artistEl.textContent = currentTrackInfo.artist || "";

  if (currentTrackInfo.cover) {
    coverEl.src = currentTrackInfo.cover;
  }
}

function updateMediaSession() {
  if ("mediaSession" in navigator && currentTrackInfo.cover) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrackInfo.title,
      artist: currentTrackInfo.artist,
      artwork: [
        {
          src: currentTrackInfo.cover,
          sizes: "512x512",
          type: "image/jpeg"
        }
      ]
    });
  }
}
