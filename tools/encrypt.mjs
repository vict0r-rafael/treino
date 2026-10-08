/**
 * Gera js/payload.js a partir de segredo.json.
 *
 *   node tools/encrypt.mjs
 *
 * Sem dependências. Cada série é cifrada com uma chave derivada da resposta
 * daquela série (PBKDF2-SHA256 + AES-256-GCM), com salt e iv próprios. Não
 * existe hash das respostas em lugar nenhum: a validação é a própria
 * decifragem — o GCM falha com a chave errada, e isso já é a resposta.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pbkdf2Sync, randomBytes, createCipheriv } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITERACOES = 300000;

/** Mesma normalização do navegador (js/treino.js). Qualquer divergência aqui
 *  gera uma chave diferente e a série fica impossível de abrir. */
function normalizar(txt) {
  return String(txt)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function cifrar(objeto, resposta) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const chave = pbkdf2Sync(normalizar(resposta), salt, ITERACOES, 32, "sha256");

  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([
    cipher.update(JSON.stringify(objeto), "utf8"),
    cipher.final(),
  ]);
  // A Web Crypto espera a tag de autenticação colada no fim do ciphertext.
  const ct = Buffer.concat([corpo, cipher.getAuthTag()]);

  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
  };
}

/* -------------------------------------------------------------------------- */

const caminhoSegredo = join(RAIZ, "segredo.json");

if (!existsSync(caminhoSegredo)) {
  console.error(
    "\n  segredo.json não encontrado.\n" +
      "  Copie segredo.example.json para segredo.json e preencha.\n"
  );
  process.exit(1);
}

const s = JSON.parse(readFileSync(caminhoSegredo, "utf8"));

/* --- validação: erro agora é melhor que um site quebrado no ar ------------ */

const erros = [];
const r = s.revelacao || {};

if (!s.chaves?.A_data) erros.push("chaves.A_data está vazia");
if (!s.chaves?.B_hora) erros.push("chaves.B_hora está vazia");
if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data_iso || ""))
  erros.push("revelacao.data_iso precisa estar em AAAA-MM-DD");
if (!/^\d{2}:\d{2}$/.test(r.hora_busca || ""))
  erros.push("revelacao.hora_busca precisa estar em HH:MM");
if (!r.nome) erros.push("revelacao.nome está vazio");

for (const [serie, campo] of [
  ["A", "A_data"],
  ["B", "B_hora"],
  ["C", "C_preparo"],
]) {
  const resposta = s.chaves?.[campo];
  if (resposta && normalizar(resposta).length < 8) {
    erros.push(
      `chaves.${campo} tem menos de 8 caracteres — frágil contra ataque de ` +
        `dicionário (veja o README)`
    );
  }
  const dicas = s.dicas?.[serie];
  if (resposta && (!Array.isArray(dicas) || dicas.length === 0)) {
    erros.push(`dicas.${serie} está vazia — ela pode travar na série ${serie}`);
  }
}

const temC = Boolean(s.chaves?.C_preparo);
if (temC && !r.preparo) erros.push("revelacao.preparo está vazio");
if (temC && !r.mensagem_final) erros.push("revelacao.mensagem_final está vazia");

if (erros.length) {
  console.error("\n  payload NÃO gerado:\n" + erros.map((e) => "   · " + e).join("\n") + "\n");
  process.exit(1);
}

/* --- conteúdo de cada série ----------------------------------------------- */

const series = {
  A: cifrar({ campo: "data", data_iso: r.data_iso }, s.chaves.A_data),
  B: cifrar({ campo: "hora", hora_busca: r.hora_busca }, s.chaves.B_hora),
  // Série 3 fechada até ser liberada: sem chave, sem bloco cifrado no site.
  C: temC
    ? cifrar(
        {
          campo: "preparo",
          nome: r.nome,
          preparo: r.preparo,
          mensagem_final: r.mensagem_final,
        },
        s.chaves.C_preparo
      )
    : null,
};

/* --- apoio (dicas + whatsapp) ---------------------------------------------
 * Cifrado com uma chave fixa do próprio site. Isso NÃO é segurança: quem ler
 * o js abre em um minuto. Serve só para as dicas não aparecerem em texto puro
 * no código-fonte e estragarem a brincadeira de quem está jogando limpo.
 * De quebra, mantém o número de telefone fora do repositório público.
 * -------------------------------------------------------------------------- */

const CHAVE_SITE = "descanso entre as series";

const apoio = cifrar(
  {
    dicas: {
      A: s.dicas?.A || [],
      B: s.dicas?.B || [],
      C: temC ? s.dicas?.C || [] : [],
    },
    whatsapp: s.whatsapp || "",
    nome: r.nome,
  },
  CHAVE_SITE
);

/* --- escrita --------------------------------------------------------------- */

/* --- easter eggs: as chaves ficam codificadas, não cifradas ---------------
 * São para ser encontradas. O que protege o conteúdo é a cifra da série;
 * a codificação aqui é só o enigma. Série 1 em Base64 no comentário HTML,
 * série 2 em hexadecimal, devolvida por treinar() no console. Duas
 * codificações diferentes de propósito: ela decodifica a primeira e já
 * sabe que a segunda não vai ser do mesmo jeito.
 * -------------------------------------------------------------------------- */

const ecoB = Buffer.from(s.chaves.B_hora, "utf8")
  .toString("hex")
  .replace(/../g, "$& ")
  .trim();

const payload = {
  v: 1,
  iteracoes: ITERACOES,
  cfg: {
    estopim: s.estopim || {},
    url_curta: s.url_curta || "",
  },
  eco: ecoB,
  series,
  apoio,
};

const saida =
  "/* GERADO por tools/encrypt.mjs — não edite à mão. */\n" +
  "window.TREINO_PAYLOAD = " +
  JSON.stringify(payload, null, 2) +
  ";\n" +
  "window.TREINO_CONFIG = window.TREINO_PAYLOAD.cfg;\n";

writeFileSync(join(RAIZ, "js", "payload.js"), saida, "utf8");

/* --- comentário de aquecimento dentro de treino.html ----------------------- */

const b64A = Buffer.from(s.chaves.A_data, "utf8").toString("base64");

// Comentário HTML não aceita "--" no meio, então a arte usa só "=" e "_".
const aquecimento = [
  "    <!-- aquecimento",
  "",
  "         ___                                    ___",
  "        |[_]|====================================|[_]|",
  "         ‾‾‾                                      ‾‾‾",
  "",
  "        serie 1 . DATA",
  "        carga:  " + b64A,
  "",
  "        proxima: o console tem a serie 2.",
  "    -->",
].join("\n");

const caminhoFicha = join(RAIZ, "treino.html");
const html = readFileSync(caminhoFicha, "utf8");
const marcaIni = "<!-- AQUECIMENTO:INICIO (gerado por tools/encrypt.mjs) -->";
const marcaFim = "<!-- AQUECIMENTO:FIM -->";
const regiao = new RegExp(
  marcaIni.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "[\\s\\S]*?" +
    marcaFim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
);

if (!regiao.test(html)) {
  console.error(
    "\n  marcas AQUECIMENTO:INICIO/FIM não encontradas em treino.html\n"
  );
  process.exit(1);
}

writeFileSync(
  caminhoFicha,
  html.replace(regiao, marcaIni + "\n" + aquecimento + "\n    " + marcaFim),
  "utf8"
);

console.log(
  "\n  js/payload.js gerado.\n" +
    `   · série A: cifrada\n` +
    `   · série B: cifrada\n` +
    `   · série C: ${temC ? "cifrada" : "BLOQUEADA (C: null)"}\n` +
    `   · PBKDF2-SHA256 ${ITERACOES.toLocaleString("pt-BR")} iterações + AES-256-GCM\n`
);
