/* yes.html — a comemoração parece o fim; ~6s depois, não é mais */

(function () {
  "use strict";

  var ESPERA = 6000; // ms até o estopim na primeira visita
  var CHAVE = "__treino_aquecido";

  var cfg = (window.TREINO_CONFIG || {}).estopim || {};
  var LINHA1 = cfg.linha1 || "Te espero... mas você ainda não sabe quando.";
  var LINHA2 = cfg.linha2 || "O treino de hoje ainda não acabou.";
  var URL_CURTA =
    (window.TREINO_CONFIG || {}).url_curta ||
    location.href.replace(/[^/]*$/, "");

  var final = document.getElementById("final");
  var bloco = document.getElementById("estopim");
  var el1 = document.getElementById("linha1");
  var el2 = document.getElementById("linha2");
  var prompt = document.getElementById("prompt");

  if (!final || !bloco || !el1 || !el2 || !prompt) return;

  var calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // tela touch ou estreita: a ficha é impossível de resolver no celular
  var noCelular =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;

  /* --- localStorage sempre em try/catch: modo privado derruba o acesso ----- */

  function jaViu() {
    try {
      return localStorage.getItem(CHAVE) === "1";
    } catch (e) {
      return false;
    }
  }

  function marcar() {
    try {
      localStorage.setItem(CHAVE, "1");
    } catch (e) {
      /* sem persistência: ela só espera os 6s de novo, nada quebra */
    }
  }

  /* --- efeitos ------------------------------------------------------------ */

  var RUIDO = "!<>-_\/[]{}—=+*^?#@$%&";

  function embaralhar(texto) {
    var saida = "";
    for (var i = 0; i < texto.length; i++) {
      saida +=
        texto[i] === " "
          ? " "
          : RUIDO[Math.floor(Math.random() * RUIDO.length)];
    }
    return saida;
  }

  function glitch(ms) {
    return new Promise(function (resolve) {
      if (calmo) return resolve();
      var original = final.textContent;
      final.classList.add("glitch");
      var timer = setInterval(function () {
        final.textContent = embaralhar(original);
      }, 50);
      setTimeout(function () {
        clearInterval(timer);
        final.classList.remove("glitch");
        final.textContent = original;
        resolve();
      }, ms);
    });
  }

  function digitar(el, texto, velocidade) {
    return new Promise(function (resolve) {
      if (calmo) {
        el.textContent = texto;
        return resolve();
      }
      el.textContent = "";
      el.classList.add("digitando");
      var i = 0;
      var timer = setInterval(function () {
        el.textContent = texto.slice(0, ++i);
        if (i >= texto.length) {
          clearInterval(timer);
          el.classList.remove("digitando");
          resolve();
        }
      }, velocidade);
    });
  }

  function esperar(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /* --- prompt ------------------------------------------------------------- */

  function montarPrompt() {
    if (noCelular) {
      prompt.className = "prompt prompt--mobile";
      prompt.removeAttribute("href");
      prompt.setAttribute("role", "note");
      prompt.innerHTML =
        "<span>esse treino é no computador 💻. Abre lá:</span>" +
        '<span class="url"></span>';
      prompt.querySelector(".url").textContent = URL_CURTA;
    } else {
      prompt.textContent = "> abrir ficha_de_treino";
      var cursor = document.createElement("span");
      cursor.className = "cursor";
      cursor.textContent = "_";
      prompt.appendChild(cursor);
      // Enter também abre, para quem vive no teclado
      document.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.target.closest("a, button")) {
          window.location.href = prompt.getAttribute("href");
        }
      });
    }
    requestAnimationFrame(function () {
      prompt.classList.add("visivel");
    });
  }

  /* --- sequência ---------------------------------------------------------- */

  function disparar(instantaneo) {
    marcar();
    document.title = "ainda não acabou 👀";

    Promise.resolve()
      .then(function () {
        return instantaneo ? null : glitch(420);
      })
      .then(function () {
        final.hidden = true;
        bloco.hidden = false;
        return digitar(el1, LINHA1, instantaneo ? 0 : 38);
      })
      .then(function () {
        return esperar(instantaneo ? 0 : 450);
      })
      .then(function () {
        return digitar(el2, LINHA2, instantaneo ? 0 : 38);
      })
      .then(function () {
        return esperar(instantaneo ? 0 : 500);
      })
      .then(montarPrompt);
  }

  var voltou = jaViu();

  try {
    console.log(
      "%cachou que era só isso?",
      "font-size:18px;font-weight:bold;color:#ff1493;" +
        "background:#2b1620;padding:8px 14px;border-radius:8px"
    );
  } catch (e) {}

  if (voltou) {
    disparar(true);
  } else {
    setTimeout(function () {
      disparar(false);
    }, ESPERA);
  }
})();
