#!/usr/bin/env bash
set -euo pipefail

# URL do stream (pode passar outra via argumento)
URL="${1:-https://droptv.com.br/music.m3u8}"
DURATION=30  # segundos

echo "🔎 Medindo consumo de banda do stream:"
echo "   URL:      $URL"
echo "   Duração:  ${DURATION}s"
echo

# Arquivo temporário
TMPFILE="$(mktemp /tmp/droptv_bandwidth_XXXXXX.ts)"

cleanup() {
  rm -f "$TMPFILE"
}
trap cleanup EXIT

echo "▶️ Baixando stream por ${DURATION}s com ffmpeg..."
ffmpeg \
  -loglevel error \
  -hide_banner \
  -i "$URL" \
  -t "$DURATION" \
  -c copy \
  -f mpegts \
  "$TMPFILE"

echo "✅ Download concluído, calculando tamanho..."

# Função para obter tamanho do arquivo (Linux x macOS)
get_size_bytes() {
  if stat --version >/dev/null 2>&1; then
    # GNU stat (Linux)
    stat -c%s "$1"
  else
    # BSD stat (macOS)
    stat -f%z "$1"
  fi
}

BYTES=$(get_size_bytes "$TMPFILE")
BITS=$(( BYTES * 8 ))

# Usar bc para ter casas decimais
if command -v bc >/dev/null 2>&1; then
  MB=$(echo "scale=2; $BYTES / (1024*1024)" | bc)
  KBPS=$(echo "scale=2; $BITS / $DURATION / 1000" | bc)
else
  # fallback inteiro se não tiver bc
  MB=$(( BYTES / 1024 / 1024 ))
  KBPS=$(( BITS / DURATION / 1000 ))
fi

echo
echo "📊 Resultados:"
echo "   Total baixado: ${MB} MB (aprox)"
echo "   Bytes exatos:  ${BYTES}"
echo "   Média:         ${KBPS} kbps (aprox)"
echo
echo "ℹ️ Dica: refaça o teste em horários diferentes pra ter uma média mais realista."

