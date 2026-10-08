# treino

Página estática com uma ficha de treino e alguns easter eggs. Sem framework e
sem build: HTML, CSS e JS puros, publicada no GitHub Pages.

## Rodar localmente

Precisa de um servidor HTTP (o `file://` quebra alguns caminhos):

```bash
npx serve .
```

## Estrutura

```
index.html        convite
yes.html          comemoração
css/style.css     folha única, variáveis em :root
js/main.js        botão que foge
assets/           vídeos (mp4/webm) + posters
tools/            scripts locais
```

## Mídia

Os GIFs originais ficam fora do versionamento (veja `.gitignore`) porque são
pesados. O que vai para o site é `mp4` + `webm` em loop, com um poster `webp`
de fallback. Para reconverter:

```bash
ffmpeg -i origem.gif -vf "scale=480:-2:flags=lanczos" -pix_fmt yuv420p \
  -c:v libx264 -crf 30 -preset slow -movflags +faststart -an saida.mp4
ffmpeg -i origem.gif -vf "scale=480:-2:flags=lanczos,format=yuv420p" \
  -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 -an saida.webm
ffmpeg -i origem.gif -frames:v 1 -vf "scale=480:-2:flags=lanczos" \
  -c:v libwebp -quality 80 saida-poster.webp
```

## Créditos

Template base por [@DjuliCoelho](https://github.com/DjuliCoelho). As animações
vêm do template original.
