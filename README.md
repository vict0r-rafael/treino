# treino

Página estática com uma ficha de treino e alguns easter eggs. Sem framework e
sem build: HTML, CSS e JS puros, publicada no GitHub Pages.

## Rodar localmente

Precisa de um servidor HTTP (o `file://` quebra alguns caminhos):

```bash
npx serve .
```

## Gerar o payload

O conteúdo das séries não existe em texto puro no repositório. Ele é cifrado
localmente a partir de `segredo.json`, que **nunca é commitado**:

```bash
cp segredo.example.json segredo.json   # preencher
node tools/encrypt.mjs
```

Isso escreve `js/payload.js` e atualiza o comentário de aquecimento dentro de
`treino.html`. Deixe `chaves.C_preparo` vazio para publicar com a série 3
bloqueada; preencha e rode de novo para liberá-la.

### Como funciona a cifra

Cada série é um bloco **AES-256-GCM** cuja chave vem da resposta daquela série
via **PBKDF2-SHA256, 300.000 iterações**, com salt e iv próprios. Não existe
hash das respostas em lugar nenhum: a validação é a própria decifragem — o GCM
tem tag de autenticação, então a chave errada faz o `decrypt` lançar erro, e
isso já é a resposta.

Séries independentes significam que dá para publicar a série 3 depois sem
tocar nas outras.

### Limitação conhecida

PBKDF2 encarece cada tentativa, mas não torna o conteúdo inquebrável: uma
resposta curta e comum cai em ataque de dicionário. Por isso as respostas devem
ter **8+ caracteres ou ser frases curtas** (ex.: "dia de perna") — o gerador
recusa respostas menores que isso. É um jogo, não um cofre; o objetivo é que
não seja trivial.

O bloco `apoio` (dicas e contato) é cifrado com uma chave fixa que está no
próprio JS. Isso **não é segurança** — serve só para as dicas não aparecerem em
texto puro no código-fonte e estragarem a brincadeira de quem está jogando
limpo, e para manter o telefone fora do repositório público.

## Estrutura

```
index.html           convite
yes.html             comemoração + estopim
treino.html          a ficha
css/style.css        folha única, variáveis em :root
js/main.js           botão que foge
js/estopim.js        glitch, digitação, prompt
js/treino.js         séries, dicas, decifragem
js/payload.js        GERADO — só dados cifrados
assets/              vídeos (mp4/webm) + posters
tools/encrypt.mjs    gerador do payload
segredo.example.json modelo do segredo (o real fica fora do git)
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
