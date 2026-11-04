/* treino.html — o motor da ficha
 *
 * Não existe hash de resposta em lugar nenhum. Cada série é um bloco
 * AES-GCM cuja chave vem da própria resposta via PBKDF2. Se a decifragem
 * falhar, a resposta estava errada: a validação é a decifragem.
 */

(function () {
  "use strict";

  var P = window.TREINO_PAYLOAD;
  if (!P) return;

  var ITER = P.iteracoes || 300000;
  var CHAVE_SITE = "descanso entre as series";
  var DESCANSO = 2 * 60 * 1000; // 2 min entre dicas

  var K_PROGRESSO = "__treino_progresso";
  var K_DICAS = "__treino_dicas";

  var ORDEM = ["A", "B", "C"];

  /* --- utilidades ---------------------------------------------------------- */

  /** Igual à de tools/encrypt.mjs. Mudou aqui, muda lá. */
  function normalizar(txt) {
    return String(txt)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function deB64(s) {
    var bin = atob(s);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  function ler(chave, padrao) {
    try {
      var cru = localStorage.getItem(chave);
      return cru ? JSON.parse(cru) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      /* modo privado: ela perde o progresso ao fechar, mas nada quebra */
    }
  }

  /* --- cripto -------------------------------------------------------------- */

  function derivar(resposta, salt) {
    return crypto.subtle
      .importKey(
        "raw",
        new TextEncoder().encode(normalizar(resposta)),
        "PBKDF2",
        false,
        ["deriveKey"]
      )
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
      });
  }

  function abrir(bloco, resposta) {
    return derivar(resposta, deB64(bloco.salt))
      .then(function (chave) {
        return crypto.subtle.decrypt(
          { name: "AES-GCM", iv: deB64(bloco.iv) },
          chave,
          deB64(bloco.ct)
        );
      })
      .then(function (claro) {
        return JSON.parse(new TextDecoder().decode(claro));
      });
  }

  /* --- estado -------------------------------------------------------------- */

  var progresso = ler(K_PROGRESSO, {});
  var dicas = ler(K_DICAS, { usadas: { A: 0, B: 0, C: 0 }, proximaEm: 0 });
  var apoio = null; // { dicas, whatsapp, nome } — abre com a chave do site
  var elementos = {};

  function temSerie(id) {
    return Boolean(P.series && P.series[id]);
  }

  function concluida(id) {
    return Boolean(progresso[id]);
  }

  /* --- formatação ---------------------------------------------------------- */

  var DIAS = [
    "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado",
  ];
  var MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  function dataLocal(iso) {
    var p = iso.split("-");
    // montagem manual: new Date("AAAA-MM-DD") é lido como UTC e volta um dia
    // atrás em fuso negativo, como o nosso
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function formatarData(iso) {
    var d = dataLocal(iso);
    return DIAS[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()];
  }

  function diasAte(iso) {
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round((dataLocal(iso) - hoje) / 86400000);
  }

  function valorDe(id) {
    var c = progresso[id];
    if (!c) return "";
    if (c.campo === "data") return formatarData(c.data_iso);
    if (c.campo === "hora") return "te busco às " + c.hora_busca;
    return c.preparo || "";
  }

  /* --- render -------------------------------------------------------------- */

  function pintarSerie(id) {
    var el = elementos[id];
    if (!el) return;

    var campo = el.querySelector(".serie-campo");
    var estado = el.querySelector(".serie-estado");
    var nota = el.querySelector(".serie-nota");

    if (concluida(id)) {
      el.classList.add("concluida");
      estado.textContent = "✔";
      // a linha do circuito já cumpriu o papel; some junto com o cadeado
      var dica = el.querySelector(".serie-dica");
      if (dica) dica.hidden = true;
      // o "???" da série 3 finalmente tem nome
      if (id === "C") el.querySelector(".serie-rotulo").textContent = "PREPARO";
      campo.innerHTML = "";
      var v = document.createElement("span");
      v.className = "serie-valor";
      v.textContent = valorDe(id);
      campo.appendChild(v);
      nota.hidden = true;
      return;
    }

    if (!temSerie(id)) {
      // série ainda não liberada (payload com C: null)
      campo.innerHTML = "";
      estado.textContent = "🔒";
      var trava = document.createElement("span");
      trava.className = "serie-valor";
      trava.textContent = "liberada em breve";
      campo.appendChild(trava);

      // A contagem só aparece depois que a série 1 abriu. Antes disso ela
      // entregaria a data — justamente o que a série 1 cobra.
      if (concluida("A")) {
        var faltam = diasAte(progresso.A.data_iso);
        nota.textContent =
          faltam > 1
            ? "faltam " + faltam + " dias"
            : faltam === 1
              ? "é amanhã"
              : faltam === 0
                ? "é hoje"
                : "";
        nota.hidden = !nota.textContent;
      }
      return;
    }

    nota.hidden = true;
  }

  function linhasEm(caixa, linhas) {
    caixa.innerHTML = "";
    linhas.forEach(function (linha) {
      if (!linha) return;
      var p = document.createElement("p");
      p.textContent = linha;
      caixa.appendChild(p);
    });
    caixa.hidden = false;
  }

  function pintarRevelado() {
    var caixa = document.getElementById("revelado");
    if (!caixa) return;

    if (concluida("C")) {
      linhasEm(caixa, [
        progresso.C.mensagem_final,
        "Local: surpresa. Eu te busco.",
      ]);
      var botao = document.createElement("button");
      botao.type = "button";
      botao.className = "botao-terminal botao-calendario";
      botao.textContent = "adicionar ao calendário";
      botao.addEventListener("click", baixarIcs);
      caixa.appendChild(botao);
      return;
    }

    if (concluida("A") && concluida("B") && !temSerie("C")) {
      linhasEm(caixa, [
        "Local: surpresa. Eu te busco.",
        "A série 3 destrava o resto.",
      ]);
      return;
    }

    caixa.hidden = true;
  }

  function pintarTudo() {
    ORDEM.forEach(pintarSerie);
    pintarRevelado();
    pintarPersonal();
  }

  /* --- envio de resposta ---------------------------------------------------- */

  function tentar(id) {
    var el = elementos[id];
    var input = el.querySelector(".serie-input");
    var botao = el.querySelector(".serie-ok");
    var erro = el.querySelector(".serie-erro");

    if (!input || !botao) return;
    if (!normalizar(input.value)) return;

    erro.hidden = true;
    botao.disabled = true;
    botao.textContent = "…";

    // 300.000 iterações levam alguns décimos de segundo — é de propósito:
    // é o que torna força bruta cara.
    abrir(P.series[id], input.value)
      .then(function (conteudo) {
        progresso[id] = conteudo;
        gravar(K_PROGRESSO, progresso);
        pintarTudo();
        if (id === "C") confete();
      })
      .catch(function () {
        botao.disabled = false;
        botao.textContent = "⏎";
        erro.textContent = "carga errada. tenta de novo.";
        erro.hidden = false;
        input.select();
      });
  }

  /* --- o personal ----------------------------------------------------------- */

  function serieAberta() {
    // a próxima série sem resposta, na ordem — é nela que o personal ajuda
    for (var i = 0; i < ORDEM.length; i++) {
      var id = ORDEM[i];
      if (temSerie(id) && !concluida(id)) return id;
    }
    return null;
  }

  function dicasRestantes() {
    if (!apoio) return 0;
    var total = 0;
    ORDEM.forEach(function (id) {
      if (!temSerie(id) || concluida(id)) return;
      var lista = (apoio.dicas && apoio.dicas[id]) || [];
      total += Math.max(0, lista.length - (dicas.usadas[id] || 0));
    });
    return total;
  }

  function pintarPersonal() {
    var botao = document.getElementById("personal");
    var rotulo = document.getElementById("descanso");
    var desisto = document.getElementById("desisto");
    if (!botao || !rotulo) return;

    var alvo = serieAberta();

    if (!apoio) {
      botao.disabled = true;
      rotulo.textContent = "chamando o personal…";
      return;
    }

    if (!alvo) {
      botao.disabled = true;
      // com a série 3 ainda trancada, o treino não acabou — só o de hoje
      rotulo.textContent = temSerie("C")
        ? "treino concluído"
        : "por hoje é só. a série 3 vem aí.";
      return;
    }

    var restam = dicasRestantes();

    if (restam === 0) {
      botao.disabled = true;
      rotulo.textContent = "o personal já falou tudo que sabia";
      if (desisto && apoio.whatsapp) desisto.hidden = false;
      return;
    }

    var falta = dicas.proximaEm - Date.now();

    if (falta > 0) {
      botao.disabled = true;
      var seg = Math.ceil(falta / 1000);
      rotulo.textContent =
        "descanso: " +
        Math.floor(seg / 60) +
        ":" +
        String(seg % 60).padStart(2, "0");
      return;
    }

    botao.disabled = false;
    rotulo.textContent =
      "descanso entre dicas: 2 min · restam " +
      restam +
      (restam === 1 ? " dica" : " dicas");
  }

  function chamarPersonal() {
    var alvo = serieAberta();
    if (!alvo || !apoio) return;
    if (dicas.proximaEm - Date.now() > 0) return;

    var lista = (apoio.dicas && apoio.dicas[alvo]) || [];
    var i = dicas.usadas[alvo] || 0;
    if (i >= lista.length) return;

    var caixa = elementos[alvo].querySelector(".serie-dica");
    caixa.textContent = "personal: " + lista[i];
    caixa.hidden = false;

    dicas.usadas[alvo] = i + 1;
    dicas.proximaEm = Date.now() + DESCANSO;
    gravar(K_DICAS, dicas);
    pintarPersonal();
  }

  function montarDesisto() {
    var botao = document.getElementById("desisto");
    if (!botao || !apoio || !apoio.whatsapp) return;
    botao.addEventListener("click", function () {
      var texto = encodeURIComponent("socorro, travei na ficha de treino 🙃");
      window.open(
        "https://wa.me/" + apoio.whatsapp + "?text=" + texto,
        "_blank",
        "noopener"
      );
    });
  }

  /* --- console: a carga da série 2 ------------------------------------------ */

  function montarConsole() {
    var destaque =
      "font-size:15px;font-weight:bold;color:#7ef0b2;" +
      "background:#2b1620;padding:6px 12px;border-radius:6px";
    var corpo = "color:#ffd6e8;font-family:monospace;font-size:13px";

    try {
      console.log("%cficha carregada. 3 séries.", destaque);
      console.log(
        "%cSérie 2 · HORA — a carga está no %ctreinar()",
        corpo,
        destaque
      );
    } catch (e) {}

    window.treinar = function () {
      try {
        console.log(
          "%ccarga da série 2, em hexadecimal. decodifica e digita na ficha.",
          corpo
        );
      } catch (e) {}
      return P.eco || "";
    };
  }

  /* --- série 3: o circuito do humans.txt ------------------------------------ */

  var CIRCUITO = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ];

  function montarCircuito() {
    // só arma quando a série 3 existe — sem carga publicada não há o que revelar
    if (!temSerie("C") || !P.eco3) return;

    var passo = 0;

    document.addEventListener("keydown", function (e) {
      var tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (tecla !== CIRCUITO[passo]) {
        // recomeça, mas sem perder um acerto que já serve de primeiro passo
        passo = tecla === CIRCUITO[0] ? 1 : 0;
        return;
      }

      passo++;
      if (passo < CIRCUITO.length) return;
      passo = 0;

      if (concluida("C")) return;

      var el = elementos.C;
      var caixa = el.querySelector(".serie-dica");
      caixa.textContent = "circuito completo. carga liberada: " + atob(P.eco3);
      caixa.hidden = false;
      el.querySelector(".serie-input").focus();
    });
  }

  /* --- .ics ------------------------------------------------------------------ */

  // America/Cuiaba é UTC-4 o ano inteiro (sem horário de verão desde 2019),
  // então converto para UTC somando 4h em vez de embutir uma VTIMEZONE.
  var FUSO_HORAS = 4;
  var DURACAO_HORAS = 3;

  function carimbo(d) {
    function dd(n) {
      return String(n).padStart(2, "0");
    }
    return (
      d.getUTCFullYear() +
      dd(d.getUTCMonth() + 1) +
      dd(d.getUTCDate()) +
      "T" +
      dd(d.getUTCHours()) +
      dd(d.getUTCMinutes()) +
      "00Z"
    );
  }

  function escaparIcs(txt) {
    return String(txt)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function dobrar(linha) {
    // RFC 5545: linhas com no máximo 75 octetos, continuação com espaço
    var saida = [];
    while (linha.length > 73) {
      saida.push(linha.slice(0, 73));
      linha = " " + linha.slice(73);
    }
    saida.push(linha);
    return saida.join("\r\n");
  }

  function montarIcs() {
    var p = progresso.A.data_iso.split("-");
    var h = progresso.B.hora_busca.split(":");
    var inicio = new Date(
      Date.UTC(+p[0], +p[1] - 1, +p[2], +h[0] + FUSO_HORAS, +h[1])
    );
    var fim = new Date(inicio.getTime() + DURACAO_HORAS * 3600000);

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//treino//ficha//PT-BR",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + Date.now() + "@treino",
      "DTSTAMP:" + carimbo(new Date()),
      "DTSTART:" + carimbo(inicio),
      "DTEND:" + carimbo(fim),
      dobrar("SUMMARY:Encontro 🔒"),
      "LOCATION:Surpresa",
      dobrar("DESCRIPTION:" + escaparIcs(progresso.C.preparo)),
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
  }

  function baixarIcs() {
    var blob = new Blob([montarIcs()], {
      type: "text/calendar;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "encontro.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* --- confete ---------------------------------------------------------------- */

  function confete() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var tela = document.createElement("canvas");
    tela.className = "confete";
    document.body.appendChild(tela);
    var ctx = tela.getContext("2d");

    function medir() {
      tela.width = window.innerWidth;
      tela.height = window.innerHeight;
    }
    medir();
    window.addEventListener("resize", medir);

    var cores = ["#ff1493", "#7ef0b2", "#ffd6e8", "#f8c8dc"];
    var pedacos = [];
    for (var i = 0; i < 140; i++) {
      pedacos.push({
        x: Math.random() * tela.width,
        y: -20 - Math.random() * tela.height * 0.5,
        l: 5 + Math.random() * 7,
        vy: 1.6 + Math.random() * 2.6,
        vx: -1 + Math.random() * 2,
        giro: Math.random() * Math.PI,
        dgiro: -0.12 + Math.random() * 0.24,
        cor: cores[Math.floor(Math.random() * cores.length)],
      });
    }

    var fim = Date.now() + 4500;

    function quadro() {
      ctx.clearRect(0, 0, tela.width, tela.height);
      var restante = fim - Date.now();
      ctx.globalAlpha = Math.max(0, Math.min(1, restante / 1200));

      pedacos.forEach(function (c) {
        c.x += c.vx;
        c.y += c.vy;
        c.giro += c.dgiro;
        if (c.y > tela.height + 20) {
          c.y = -20;
          c.x = Math.random() * tela.width;
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.giro);
        ctx.fillStyle = c.cor;
        ctx.fillRect(-c.l / 2, -c.l / 2, c.l, c.l * 0.6);
        ctx.restore();
      });

      if (restante > 0) {
        requestAnimationFrame(quadro);
      } else {
        window.removeEventListener("resize", medir);
        tela.remove();
      }
    }
    requestAnimationFrame(quadro);
  }

  /* --- partida -------------------------------------------------------------- */

  function comecar() {
    var ficha = document.getElementById("ficha");
    var aviso = document.getElementById("soNoPc");

    var noCelular =
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;

    if (noCelular) {
      document.getElementById("urlPc").textContent =
        (window.TREINO_CONFIG && window.TREINO_CONFIG.url_curta) ||
        location.href.replace(/[^/]*$/, "");
      aviso.hidden = false;
      return;
    }

    ficha.hidden = false;

    ORDEM.forEach(function (id) {
      var el = document.querySelector('.serie[data-serie="' + id + '"]');
      elementos[id] = el;
      if (!el) return;
      el.querySelector(".serie-ok").addEventListener("click", function () {
        tentar(id);
      });
      el.querySelector(".serie-input").addEventListener("keydown", function (e) {
        if (e.key === "Enter") tentar(id);
      });
    });

    document.getElementById("personal").addEventListener("click", chamarPersonal);

    montarConsole();
    montarCircuito();
    pintarTudo();

    // relógio do descanso
    setInterval(pintarPersonal, 1000);

    // apoio (dicas + whatsapp) abre com a chave fixa do site
    abrir(P.apoio, CHAVE_SITE)
      .then(function (conteudo) {
        apoio = conteudo;
        if (apoio.nome) document.getElementById("nome").textContent = apoio.nome;
        montarDesisto();
        pintarPersonal();
      })
      .catch(function () {
        document.getElementById("descanso").textContent =
          "o personal não atendeu";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", comecar);
  } else {
    comecar();
  }
})();
