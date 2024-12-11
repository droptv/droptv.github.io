#!/bin/bash

ACCOUNT_ID=""          # Cloudflare Account ID
NAMESPACE_ID=""        # Cloudflare Namespace ID 
API_TOKEN=""           # Cloudflare API Token
KEY_NAME="STREAM_URL"  # Nome da chave
PLAY_URL=" "           # A URL que fornece o stream
SOURCE_URL=""          # A fonte do streaming HLS
ARQUIVO_VALOR="./${0}.txt"  # Arquivo para armazenar o valor

while true; do
    RESULTADO=$(curl -L "$PLAY_URL" 2>/dev/null)

    if echo "$RESULTADO" | grep -q "^Not Found$"; then
        echo "URL retornou 'Not Found', prosseguindo com a lógica de atualização."

        # Verificar se o arquivo de valor armazenado existe
        if [[ -f "$ARQUIVO_VALOR" ]]; then
            VALOR_ANTERIOR=$(cat "$ARQUIVO_VALOR")
        else
            VALOR_ANTERIOR=""
        fi

        # Obter o novo valor do URL
        NOVO_URL=$(python3 -m streamlink "$SOURCE_URL" best --stream-url)

        if [[ "$NOVO_URL" != "$VALOR_ANTERIOR" ]]; then
            if [[ -n "$NOVO_URL" ]]; then
                echo "Armazenando o valor no arquivo e no KV: $NOVO_URL"

                echo "$NOVO_URL" > "$ARQUIVO_VALOR"

                # Chamada API para atualizar o valor no KV Namespace
                curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/storage/kv/namespaces/$NAMESPACE_ID/values/$KEY_NAME" \
                    -H "Authorization: Bearer $API_TOKEN" \
                    -H "Content-Type: text/plain" \
                    --data "$NOVO_URL"

                date
            else
                echo "Novo URL está em branco. Continuando o loop."
            fi
        else
            echo "Valores iguais, nenhuma atualização necessária."
        fi
    else
        printf "%s" '.'
    fi

    # Esperar 30 segundos antes de testar novamente
    sleep 30
done
