/* index — o botão que não quer ser clicado */

(function () {
  "use strict";

  var sim = document.getElementById("yesButton");
  var nao = document.getElementById("noButton");
  var slot = document.querySelector(".no-slot");

  if (sim) {
    sim.addEventListener("click", function () {
      window.location.href = "yes.html";
    });
  }

  if (!nao) return;

  var folga = 8; // respiro mínimo até a borda da viewport

  function fugir() {
    // Na primeira fuga, congela o tamanho do slot antes de tirar o botão do
    // fluxo — sem isso a linha de botões colapsa e o "Simm" dá um salto.
    if (!nao.classList.contains("fugindo")) {
      var caixa = nao.getBoundingClientRect();
      if (slot) {
        slot.style.width = caixa.width + "px";
        slot.style.height = caixa.height + "px";
      }
      nao.style.left = caixa.left + "px";
      nao.style.top = caixa.top + "px";
      nao.classList.add("fugindo");
      // força o browser a aplicar a posição inicial antes de animar
      void nao.offsetWidth;
    }

    var largura = nao.offsetWidth;
    var altura = nao.offsetHeight;
    var maxX = Math.max(folga, window.innerWidth - largura - folga);
    var maxY = Math.max(folga, window.innerHeight - altura - folga);

    // sorteia até achar um ponto que não cubra o botão "Simm" — senão ele
    // pousa por cima e ela não consegue mais clicar no que importa
    var zona = sim ? sim.getBoundingClientRect() : null;
    var margem = 16;
    var x, y;

    for (var i = 0; i < 25; i++) {
      x = folga + Math.random() * (maxX - folga);
      y = folga + Math.random() * (maxY - folga);
      if (
        !zona ||
        x + largura < zona.left - margem ||
        x > zona.right + margem ||
        y + altura < zona.top - margem ||
        y > zona.bottom + margem
      ) {
        break;
      }
    }

    nao.style.left = x + "px";
    nao.style.top = y + "px";
  }

  // pointerenter cobre mouse e toque; focus cobre navegação por teclado
  nao.addEventListener("pointerenter", fugir);
  nao.addEventListener("focus", fugir);
  nao.addEventListener("click", function (e) {
    e.preventDefault();
    fugir();
  });

  // se a janela mudar de tamanho, traz o botão de volta para dentro
  window.addEventListener("resize", function () {
    if (!nao.classList.contains("fugindo")) return;
    var maxX = Math.max(folga, window.innerWidth - nao.offsetWidth - folga);
    var maxY = Math.max(folga, window.innerHeight - nao.offsetHeight - folga);
    nao.style.left = Math.min(parseFloat(nao.style.left) || 0, maxX) + "px";
    nao.style.top = Math.min(parseFloat(nao.style.top) || 0, maxY) + "px";
  });
})();
