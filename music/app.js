// Configuração principal
const streamUrl = "https://hearthis.app/droptv/live/listen/";
const trackTitle = "DropTV Live";
const artistName = "DropTV";
const coverUrl = "cover.jpg"; // pode trocar por arte dinâmica

const audio = document.getElementById("audio");
const playPause = document.getElementById("playPause");
const cover = document.getElementById("cover");
const title = document.getElementById("title");

audio.src = streamUrl;
title.textContent = trackTitle;

// Função para atualizar Media Session API
function updateMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle,
      artist: artistName,
      artwork: [
        { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => {
      audio.play();
      playPause.textContent = "Pause";
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
      playPause.textContent = "Play";
    });
  }
}

// Botão de play/pause
playPause.addEventListener("click", () => {
  if (audio.paused) {
    audio.play();
    playPause.textContent = "Pause";
  } else {
    audio.pause();
    playPause.textContent = "Play";
  }
});

// Atualiza a sessão quando a capa for carregada
audio.addEventListener("play", updateMediaSession);

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js', { scope: '/music/' })
    .then(() => console.log("Service Worker registrado com sucesso"))
    .catch(err => console.error("Erro ao registrar Service Worker:", err));
}

