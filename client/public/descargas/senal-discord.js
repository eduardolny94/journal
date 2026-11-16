// Botón «Copiar el código» de senal-discord.html: baja el indicador (mismo dominio) y lo pone en el portapapeles.
// Si el navegador no deja copiar, enseña el código en un recuadro ya seleccionado para copiarlo a mano.
(function () {
  var boton = document.getElementById('copiar');
  var estado = document.getElementById('estado');
  var area = document.getElementById('codigo');
  if (!boton) return;
  function aMano(texto) {
    area.value = texto; area.hidden = false; area.focus(); area.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    estado.textContent = ok ? 'Copiado. Ahora pégalo en el Editor Pine de TradingView.' : 'Tu navegador no deja copiar solo: el código está seleccionado aquí abajo, cópialo con Ctrl+C (o Cmd+C).';
  }
  boton.addEventListener('click', function () {
    estado.textContent = 'Copiando…';
    fetch('GTFX_SenalDiscord.pine')
      .then(function (r) { if (!r.ok) throw new Error('descarga'); return r.text(); })
      .then(function (texto) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(texto).then(function () { estado.textContent = 'Copiado. Ahora pégalo en el Editor Pine de TradingView.'; }, function () { aMano(texto); });
        }
        aMano(texto);
      })
      .catch(function () { estado.textContent = 'No se pudo bajar el código. Usa «Descargar el archivo».'; });
  });
})();
