// Navegación, preferencias locales y descargas de las páginas públicas de kywai.
(function () {
  'use strict';
  var node = document.getElementById('site-config');
  if (!node) return;
  var config = JSON.parse(node.textContent);
  try {
    var chosen = localStorage.getItem('kywai-lang');
    if (config.lang === 'en' && !chosen && !/[?&]lang=en/.test(location.search)) {
      var wanted = (navigator.languages || [navigator.language || 'en']).map(function (lang) { return String(lang).slice(0, 2).toLowerCase(); });
      for (var i = 0; i < wanted.length; i++) {
        if (wanted[i] === 'en') break;
        if (config.translations[wanted[i]]) { location.replace(config.translations[wanted[i]] + location.hash); return; }
      }
    }
    var savedTheme = localStorage.getItem('kywai-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
  } catch (_) {}
  document.querySelectorAll('.lang a[data-lang]').forEach(function (a) {
    a.addEventListener('click', function () { try { localStorage.setItem('kywai-lang', a.dataset.lang); } catch (_) {} });
  });
  var composioNode = document.getElementById('composio-data');
  if (composioNode) {
    var catalog = JSON.parse(composioNode.textContent), searchBox = document.querySelector('[data-composio-search]'), moreApps = document.querySelector('[data-composio-more]'), appGrid = document.querySelector('[data-composio-grid]'), appLimit = 36;
    function normalized(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    function renderApps() {
      var query = normalized(searchBox.value.trim()), matches = catalog.items.filter(function (a) { return normalized(a.name + ' ' + a.slug).includes(query); });
      appGrid.replaceChildren();
      matches.slice(0, appLimit).forEach(function (a) {
        var card = document.createElement('article'), logo = document.createElement('span'), title = document.createElement('h3'), link = document.createElement('a'), initial = catalog.items.indexOf(a);
        card.className = 'composio-card'; logo.className = 'composio-logo'; logo.setAttribute('aria-hidden', 'true');
        if (initial < 36) { var image = document.createElement('img'); image.src = catalog.base + 'assets/composio/' + a.slug + '.svg'; image.alt = ''; image.width = 38; image.height = 38; image.loading = 'lazy'; logo.append(image); }
        else logo.textContent = a.name.slice(0, 2).toUpperCase();
        title.textContent = a.name; link.textContent = catalog.details + ' →'; link.href = 'https://docs.composio.dev/toolkits/' + encodeURIComponent(a.slug); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', catalog.details + ' · ' + a.name);
        card.append(logo, title, link); appGrid.append(card);
      });
      moreApps.hidden = matches.length <= appLimit;
      document.querySelector('[data-composio-empty]').hidden = matches.length > 0;
      document.querySelector('[data-composio-results]').textContent = matches.length + ' / ' + catalog.items.length;
    }
    moreApps.hidden = catalog.items.length <= appLimit;
    searchBox.addEventListener('input', function () { appLimit = 36; renderApps(); });
    moreApps.addEventListener('click', function () { appLimit += 36; renderApps(); });
  }
  var theme = document.querySelector('.theme-toggle');
  if (theme) theme.addEventListener('click', function () {
    var current = document.documentElement.dataset.theme;
    if (!current) current = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kywai-theme', next); } catch (_) {}
  });
  // Los enlaces antiguos a secciones siguen llegando a la página correspondiente.
  var hash = location.hash.slice(1);
  if (hash && !document.getElementById(hash) && config.hashLinks[hash]) {
    location.replace(config.hashLinks[hash]); return;
  }
  var ua = navigator.userAgent || '';
  var platform = navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || '';
  var os = /Android/i.test(ua) ? 'android' : /iPhone|iPad/i.test(ua) || /Mac/i.test(platform) && navigator.maxTouchPoints > 1 ? null : /Win/i.test(platform + ua) ? 'win' : /Mac/i.test(platform + ua) ? 'mac' : /Linux/i.test(platform + ua) ? 'linux' : null;
  var card = os && document.querySelector('[data-platform="' + os + '"]');
  if (card) {
    card.classList.add('recommended');
    var badge = card.querySelector('.platform-recommended');
    if (badge) badge.hidden = false;
  }
  var hero = document.getElementById('hero-dl');
  if (hero && os) {
    hero.href = config.downloadUrl + '#' + os;
    var label = hero.querySelector('span');
    if (label) label.textContent = config.forLabel + ' ' + ({ win: 'Windows', mac: 'macOS', linux: 'Linux', android: 'Android' })[os];
  }
  var tabs = Array.from(document.querySelectorAll('.os-tabs [data-guide]'));
  function showGuide(key, focus) {
    tabs.forEach(function (tab) {
      var on = tab.dataset.guide === key;
      tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
      var panel = document.getElementById('guide-' + tab.dataset.guide);
      if (panel) panel.hidden = !on;
      if (on && focus) tab.focus();
    });
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { showGuide(tab.dataset.guide); });
    tab.addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next !== null) { event.preventDefault(); showGuide(tabs[next].dataset.guide, true); }
    });
  });
  if (tabs.length) showGuide(os === 'mac' ? 'mac' : os === 'linux' ? 'lin' : 'win');
  document.querySelectorAll('.cmd-row button').forEach(function (button) {
    var original = button.textContent;
    button.addEventListener('click', function () {
      var code = button.parentNode.querySelector('code');
      if (code && navigator.clipboard) navigator.clipboard.writeText(code.textContent).then(function () {
        button.textContent = button.dataset.copy;
        setTimeout(function () { button.textContent = original; }, 1800);
      }, function () {});
    });
  });
  // Pausa la órbita al leer una descripción; el giro del símbolo es independiente.
  var orbit = document.querySelector('.orbit-system');
  if (orbit) {
    var orbitButtons = Array.from(orbit.querySelectorAll('.orbit-trigger'));
    var pinnedOrbit = null;
    var refreshOrbitMotion = function () {};
    function closeOrbit() {
      orbitButtons.forEach(function (button) {
        button.setAttribute('aria-expanded', 'false');
        var tip = document.getElementById(button.getAttribute('aria-controls'));
        if (tip) tip.hidden = true;
      });
      orbit.removeAttribute('data-orbit-paused');
      refreshOrbitMotion();
    }
    function openOrbit(button) {
      closeOrbit();
      button.setAttribute('aria-expanded', 'true');
      var tip = document.getElementById(button.getAttribute('aria-controls'));
      if (tip) tip.hidden = false;
      orbit.setAttribute('data-orbit-paused', '');
      refreshOrbitMotion();
    }
    orbitButtons.forEach(function (button) {
      // Sin JavaScript se conserva el texto alternativo del navegador.
      button.removeAttribute('title');
      button.addEventListener('pointerenter', function (event) {
        if (event.pointerType !== 'touch') { pinnedOrbit = null; openOrbit(button); }
      });
      button.addEventListener('pointerleave', function (event) {
        var art = orbit.closest('.orchestration-art');
        if (event.relatedTarget && art.contains(event.relatedTarget)) return;
        if (pinnedOrbit !== button && !button.matches(':focus-visible')) closeOrbit();
      });
      button.addEventListener('focus', function () { pinnedOrbit = null; openOrbit(button); });
      button.addEventListener('blur', function () { pinnedOrbit = null; closeOrbit(); });
      button.addEventListener('click', function () {
        if (pinnedOrbit === button) { pinnedOrbit = null; closeOrbit(); }
        else { pinnedOrbit = button; openOrbit(button); }
      });
    });
    orbit.closest('.orchestration-art').addEventListener('pointerleave', function () {
      if (!pinnedOrbit && !orbit.querySelector('.orbit-trigger:focus-visible')) closeOrbit();
    });
    document.addEventListener('pointerdown', function (event) {
      if (!orbit.contains(event.target)) { pinnedOrbit = null; closeOrbit(); }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { pinnedOrbit = null; closeOrbit(); }
    });
  }
  if (orbit && window.requestAnimationFrame) {
    var orbitSvg = orbit.querySelector('.orbit-lines');
    var orbitShapes = orbitButtons.map(function (button) {
      var point = button.parentElement;
      var shape = document.getElementById(point.dataset.orbitPath);
      return { point: point, button: button, shape: shape, phase: Number(point.dataset.orbitPhase), period: Number(point.dataset.orbitPeriod), direction: Number(point.dataset.orbitDirection) || 1, seconds: 0 };
    });
    if (orbitSvg && typeof orbitSvg.createSVGPoint === 'function' && orbitShapes.every(function (item) { return item.shape && item.shape.ownerSVGElement === orbitSvg && typeof item.shape.getPointAtLength === 'function' && typeof item.shape.getTotalLength === 'function'; })) {
      var orbitFrame = null, orbitLast = null, orbitInView = true;
      var orbitReduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
      orbitShapes.forEach(function (item) { item.length = item.shape.getTotalLength(); });
      orbit.setAttribute('data-path-motion', '');
      function fitOrbit() {
        orbitShapes.forEach(function (item) {
          item.matrix = item.shape.getCTM();
          var center = orbitSvg.createSVGPoint(); center.x = 210; center.y = 165;
          item.center = item.matrix ? center.matrixTransform(item.matrix) : center;
        });
      }
      function drawOrbit() {
        orbitShapes.forEach(function (item) {
          if (!item.matrix) return;
          var progress = ((item.phase + item.direction * item.seconds / item.period) % 1 + 1) % 1;
          var raw = item.shape.getPointAtLength(progress * item.length);
          var point = orbitSvg.createSVGPoint(); point.x = raw.x; point.y = raw.y;
          var position = point.matrixTransform(item.matrix);
          item.point.style.transform = 'translate3d(' + position.x.toFixed(3) + 'px,' + position.y.toFixed(3) + 'px,0) translate(-50%,-50%)';
          item.point.style.zIndex = position.y < item.center.y ? '1' : '3';
        });
      }
      function orbitCanMove() { return !orbitReduced.matches && orbitInView && !document.hidden; }
      function tickOrbit(time) {
        orbitFrame = null;
        // Cada etiqueta conserva su propio tiempo: sólo se pausa la que muestra su descripción.
        if (orbitLast !== null && orbitCanMove()) orbitShapes.forEach(function (item) {
          if (item.button.getAttribute('aria-expanded') !== 'true') item.seconds += (time - orbitLast) / 1000;
        });
        orbitLast = time; drawOrbit();
        if (orbitCanMove()) orbitFrame = requestAnimationFrame(tickOrbit);
        else orbitLast = null;
      }
      refreshOrbitMotion = function () {
        drawOrbit();
        if (!orbitCanMove()) { if (orbitFrame !== null) cancelAnimationFrame(orbitFrame); orbitFrame = null; orbitLast = null; }
        else if (orbitFrame === null) orbitFrame = requestAnimationFrame(tickOrbit);
      };
      fitOrbit(); refreshOrbitMotion();
      if (window.ResizeObserver) new ResizeObserver(function () { fitOrbit(); drawOrbit(); }).observe(orbit);
      else window.addEventListener('resize', function () { fitOrbit(); drawOrbit(); });
      if (orbitReduced.addEventListener) orbitReduced.addEventListener('change', refreshOrbitMotion);
      document.addEventListener('visibilitychange', refreshOrbitMotion);
      if (window.IntersectionObserver) new IntersectionObserver(function (entries) { orbitInView = entries[0].isIntersecting; refreshOrbitMotion(); }).observe(orbit);
    }
  }
  // Catálogo visual de agentes: filtrar y buscar no conecta cuentas.
  var agentFilters = Array.from(document.querySelectorAll('[data-agent-filter]'));
  var agentSearch = document.querySelector('[data-agent-search]');
  var agentCategory = 'all';
  function filterAgents() {
    var query = agentSearch ? agentSearch.value.trim().toLocaleLowerCase() : '';
    var visible = 0;
    document.querySelectorAll('[data-agent-category]').forEach(function (card) {
      card.hidden = (agentCategory !== 'all' && card.dataset.agentCategory !== agentCategory) || !card.dataset.agentName.includes(query);
      if (!card.hidden) visible++;
    });
    var empty = document.querySelector('.agent-empty');
    if (empty) empty.hidden = visible > 0;
  }
  agentFilters.forEach(function (button) {
    button.addEventListener('click', function () {
      agentCategory = button.dataset.agentFilter;
      agentFilters.forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      filterAgents();
    });
  });
  if (agentSearch) agentSearch.addEventListener('input', filterAgents);
  var themeFilters = Array.from(document.querySelectorAll('[data-theme-filter]'));
  themeFilters.forEach(function (button) {
    button.addEventListener('click', function () {
      themeFilters.forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      document.querySelectorAll('[data-theme-category]').forEach(function (card) {
        card.hidden = button.dataset.themeFilter !== 'all' && card.dataset.themeCategory !== button.dataset.themeFilter;
      });
    });
  });
  var themeDialog = document.querySelector('.theme-preview-dialog');
  if (themeDialog && typeof themeDialog.showModal === 'function') {
    var themeOpener;
    var activeTheme;
    function visibleThemeLinks() {
      return Array.from(document.querySelectorAll('[data-theme-preview]')).filter(function (link) { return !link.closest('[data-theme-category]').hidden; });
    }
    function showTheme(link) {
      activeTheme = link;
      var card = link.closest('.theme-gallery-card');
      var title = card.querySelector('h2').textContent;
      var preview = themeDialog.querySelector('.theme-preview-content>img');
      preview.src = link.href; preview.alt = title;
      themeDialog.querySelector('[data-theme-title]').textContent = title;
      themeDialog.querySelector('[data-theme-hint]').textContent = card.querySelector('p').textContent;
      themeDialog.querySelector('[data-theme-group]').textContent = card.querySelector('div>span').textContent;
    }
    document.querySelectorAll('[data-theme-preview]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
        event.preventDefault(); themeOpener = link; showTheme(link); themeDialog.showModal();
      });
    });
    function adjacentTheme(delta) {
      var links = visibleThemeLinks();
      if (links.length) showTheme(links[(links.indexOf(activeTheme) + delta + links.length) % links.length]);
    }
    themeDialog.querySelector('[data-theme-prev]').addEventListener('click', function () { adjacentTheme(-1); });
    themeDialog.querySelector('[data-theme-next]').addEventListener('click', function () { adjacentTheme(1); });
    themeDialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); adjacentTheme(event.key === 'ArrowRight' ? 1 : -1); }
    });
    themeDialog.addEventListener('close', function () { if (themeOpener) themeOpener.focus(); });
    themeDialog.addEventListener('click', function (event) {
      var bounds = themeDialog.getBoundingClientRect();
      if (event.target === themeDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) themeDialog.close();
    });
  }
  var walkTabs = Array.from(document.querySelectorAll('.walkthrough-tabs [role="tab"]'));
  if (walkTabs.length) {
    var walkIndex = 0;
    var walkPrev = document.querySelector('[data-walk-prev]');
    var walkNext = document.querySelector('[data-walk-next]');
    document.querySelector('.walk-controls').hidden = false;
    function showWalk(index, focus) {
      walkIndex = index;
      walkTabs.forEach(function (tab, i) {
        tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
        if (i === index && focus) tab.focus();
      });
      walkPrev.disabled = index === 0; walkNext.disabled = index === walkTabs.length - 1;
    }
    walkTabs.forEach(function (tab, index) {
      tab.addEventListener('click', function (event) { event.preventDefault(); showWalk(index, false); });
      tab.addEventListener('keydown', function (event) {
        var next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % walkTabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + walkTabs.length - 1) % walkTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? walkTabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); showWalk(next, true); }
      });
    });
    walkPrev.addEventListener('click', function () { if (walkIndex > 0) showWalk(walkIndex - 1, false); });
    walkNext.addEventListener('click', function () { if (walkIndex < walkTabs.length - 1) showWalk(walkIndex + 1, false); });
    if (window.matchMedia) {
      var walkNarrow = window.matchMedia('(max-width: 760px)');
      function walkOrientation() { document.querySelector('.walkthrough-tabs').setAttribute('aria-orientation', walkNarrow.matches ? 'horizontal' : 'vertical'); }
      walkOrientation(); walkNarrow.addEventListener('change', walkOrientation);
    }
    showWalk(0, false);
  }
  // Las guías tienen URL propia por servicio y funcionan también desde un enlace directo.
  var guideService = document.querySelector('[data-guide-service]');
  if (guideService) {
    var serviceGuides = Array.from(document.querySelectorAll('[data-service-guide]'));
    function showServiceGuide(id, scroll) {
      var selected = serviceGuides.find(function (guide) { return guide.dataset.serviceGuide === id; });
      if (!selected) return;
      guideService.value = id;
      serviceGuides.forEach(function (guide) { guide.hidden = guide !== selected; });
      document.querySelectorAll('.lang a[data-lang]').forEach(function (link) { link.hash = id; });
      if (scroll) selected.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    var serviceHash = location.hash.slice(1);
    var knownService = serviceGuides.some(function (guide) { return guide.dataset.serviceGuide === serviceHash; });
    showServiceGuide(knownService ? serviceHash : 'deepwiki', false);
    if (knownService) requestAnimationFrame(function () {
      var before = document.querySelector('.guide-before');
      if (before) before.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    guideService.addEventListener('change', function () {
      history.replaceState(null, '', '#' + guideService.value);
      showServiceGuide(guideService.value, true);
    });
    window.addEventListener('hashchange', function () { showServiceGuide(location.hash.slice(1), true); });
  }
  // El catálogo público filtra instrucciones; no inicia una autorización desde la web.
  var connectionFilters = Array.from(document.querySelectorAll('[data-connect-filter]'));
  connectionFilters.forEach(function (button) {
    button.addEventListener('click', function () {
      var category = button.dataset.connectFilter;
      connectionFilters.forEach(function (filter) { filter.setAttribute('aria-pressed', String(filter === button)); });
      var count = 0;
      document.querySelectorAll('[data-connect-category]').forEach(function (card) {
        card.hidden = category !== 'all' && category !== card.dataset.connectCategory;
        if (card.hidden) card.open = false;
        else count++;
      });
      var empty = document.querySelector('.connector-empty');
      if (empty) empty.hidden = count > 0;
    });
  });
  // Ejemplos de encargos: selección accesible, sin ejecutar tareas ni llamar a proveedores.
  var stories = Array.from(document.querySelectorAll('.story-tabs [role="tab"]'));
  function showStory(index, focus) {
    stories.forEach(function (tab, i) {
      var selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
      if (selected && focus) tab.focus();
    });
  }
  stories.forEach(function (tab, index) {
    tab.addEventListener('click', function () { showStory(index, false); });
    tab.addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowDown' ? (index + 1) % stories.length : event.key === 'ArrowUp' ? (index + stories.length - 1) % stories.length : event.key === 'Home' ? 0 : event.key === 'End' ? stories.length - 1 : null;
      if (next !== null) { event.preventDefault(); showStory(next, true); }
    });
  });
  var videoDialog = document.getElementById('product-video');
  if (videoDialog && typeof videoDialog.showModal === 'function') {
    var opener;
    var video = videoDialog.querySelector('video');
    document.querySelectorAll('[data-video-open]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        // Mantiene abrir en otra pestaña y el enlace directo como alternativa.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
        event.preventDefault(); opener = link; videoDialog.showModal();
        if (video) { var playing = video.play(); if (playing) playing.catch(function () {}); }
      });
    });
    videoDialog.addEventListener('close', function () { if (video) video.pause(); if (opener) opener.focus(); });
    videoDialog.addEventListener('click', function (event) {
      var bounds = videoDialog.getBoundingClientRect();
      if (event.target === videoDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) videoDialog.close();
    });
  }
  if (!document.querySelector('[data-artifact]')) return;
  var patterns = { win: /Setup.*\.exe$/, 'mac-arm': /arm64\.dmg$/, 'mac-intel': /x64\.dmg$/, 'linux-x64': /x86_64\.AppImage$/, 'linux-arm': /arm64\.AppImage$/, android: /orbita\.apk$/ };
  fetch('https://api.github.com/repos/Yiku21/kywai/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (response) { if (!response.ok) throw Error('Release unavailable'); return response.json(); })
    .then(function (release) {
      var updated = 0;
      document.querySelectorAll('[data-artifact]').forEach(function (a) {
        var pattern = patterns[a.dataset.artifact];
        var asset = (release.assets || []).find(function (item) { return pattern && pattern.test(item.name); });
        // Solo se admiten archivos de las releases del repositorio oficial.
        if (!asset || !/^https:\/\/github\.com\/Yiku21\/kywai\/releases\/download\//.test(asset.browser_download_url)) return;
        a.href = asset.browser_download_url;
        var info = document.querySelector('[data-artifact-info="' + a.dataset.artifact + '"]');
        if (info) info.textContent = asset.name + ' · ' + Math.round(asset.size / 1048576) + ' MB';
        updated++;
      });
      var version = document.getElementById('dl-version');
      if (version && updated) version.textContent = String(release.tag_name || '').replace(/^v/, '');
    })
    .catch(function () { /* Los enlaces verificados incluidos en el HTML siguen funcionando. */ });
})();
