// La cotorra que te mira: gira la cabeza hacia el ratón y pone caras al tocarla. Adaptado de page-mascot
// (https://github.com/nilbuild/page-mascot) · MIT License · Copyright (c) 2026 Kamran Ahmed <https://kamran.fyi>.
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
// notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE SOFTWARE OR ITS USE.
(function () {
  // Uso: <button data-mascota data-direcciones="…/direcciones.webp" data-caras="…/reacciones.webp"></button>
  var CLOCK = [5, 8, 7, 6, 3, 0, 1, 2]; // derecha, abajo-der., abajo, abajo-izq., izquierda, arriba-izq., arriba, arriba-der.
  var SECTOR = Math.PI / 4, HYST = 0.12, DEAD = 70;
  var CARAS = { blink: 0, heart: 1, sparkle: 2, delighted: 8, dizzy: 7 }, TURNO = ['heart', 'sparkle', 'delighted'];
  function cell(i) { return (i % 3) * 50 + '% ' + Math.floor(i / 3) * 50 + '%'; }
  function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function capa(src, op) {
    var s = document.createElement('span');
    s.style.cssText = 'position:absolute;inset:0;background:url("' + src + '") no-repeat;background-size:300% 300%;opacity:' + op;
    return s;
  }
  function init(btn) {
    var dir = capa(btn.dataset.direcciones, 1), caras = capa(btn.dataset.caras, 0), bote = document.createElement('span');
    bote.style.cssText = 'position:relative;display:block;width:100%;height:100%;transform-origin:50% 88%';
    dir.style.backgroundPosition = cell(4); caras.style.backgroundPosition = cell(0);
    bote.appendChild(dir); bote.appendChild(caras); btn.appendChild(bote);
    var sector = -1, ptr = null, timers = [], boops = { n: 0, at: 0 };
    function aim() {
      if (!ptr) return;
      var b = btn.getBoundingClientRect(), dx = ptr.x - (b.left + b.width / 2), dy = ptr.y - (b.top + b.height / 2);
      if (Math.hypot(dx, dy) < DEAD) sector = -1;
      else {
        var a = Math.atan2(dy, dx);
        if (sector === -1 || Math.abs(wrap(a - sector * SECTOR)) >= SECTOR / 2 + HYST) sector = (Math.round(a / SECTOR) + 8) % 8;
      }
      dir.style.backgroundPosition = cell(sector < 0 ? 4 : CLOCK[sector]);
    }
    if (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      addEventListener('pointermove', function (e) { ptr = { x: e.clientX, y: e.clientY }; aim(); }, { passive: true });
      addEventListener('scroll', aim, { passive: true });
    }
    function show(cara) {
      if (cara) caras.style.backgroundPosition = cell(CARAS[cara]);
      caras.style.opacity = cara ? 1 : 0; dir.style.opacity = cara ? 0 : 1;
    }
    btn.addEventListener('click', function () {
      timers.forEach(clearTimeout); timers = [];
      var now = Date.now(); boops.n = now - boops.at < 1600 ? boops.n + 1 : 1; boops.at = now;
      if (boops.n >= 4) { boops.n = 0; show('dizzy'); timers.push(setTimeout(show, 1100, null)); }
      else { show('blink'); timers.push(setTimeout(show, 120, TURNO[(boops.n - 1) % 3]), setTimeout(show, 560, null)); }
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (bote.animate) bote.animate([
        { transform: 'scale(1,1)', easing: 'ease-in' }, { transform: 'scale(1.10,.86)', offset: .18, easing: 'ease-out' },
        { transform: 'scale(.95,1.08)', offset: .45, easing: 'ease-in-out' }, { transform: 'scale(1.03,.97)', offset: .72, easing: 'ease-in-out' },
        { transform: 'scale(1,1)' }], { duration: 420, easing: 'linear' });
    });
  }
  function start() { document.querySelectorAll('[data-mascota]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
