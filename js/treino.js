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
        "Leva: " + progresso.C.preparo,
        "Local: surpresa. Eu te busco.",
      ]);
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
