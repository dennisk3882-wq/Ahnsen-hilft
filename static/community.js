(() => {
  const state = {
    language: 'de',
    translating: false,
    nodeOriginals: new WeakMap(),
    attrOriginals: new WeakMap(),
    timer: null,
    observer: null,
    platform: null,
  };

  const SKIP = 'script,style,noscript,code,pre,svg,[data-no-translate],[translate="no"],[contenteditable="true"]';
  const ATTRS = ['placeholder', 'title', 'aria-label'];

  const languageFromStorage = () =>
    localStorage.getItem('platform-language') ||
    localStorage.getItem('ahnsen-language') ||
    document.cookie.match(/(?:^|; )ahnsen_language=([^;]+)/)?.[1] ||
    document.body?.dataset.platformDefaultLanguage || 'de';

  const showState = (active, degraded = false) => {
    const el = document.getElementById('translation-state');
    if (!el) return;
    el.hidden = !active && !degraded;
    el.textContent = degraded ? '!' : '↻';
    el.title = degraded ? 'Übersetzung teilweise nicht verfügbar' : 'Inhalt wird übersetzt';
  };

  const shouldSkip = element => {
    if (!element) return true;
    if (element.closest(SKIP)) return true;
    if (element.closest('#platform-language, #translation-state')) return true;
    return false;
  };

  const splitWhitespace = value => {
    const match = String(value || '').match(/^(\s*)(.*?)(\s*)$/s);
    return {prefix: match?.[1] || '', core: match?.[2] || '', suffix: match?.[3] || ''};
  };

  const collect = root => {
    const entries = [];
    const start = root && root.nodeType === Node.ELEMENT_NODE ? root : document.body;
    if (!start) return entries;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (shouldSkip(el)) return NodeFilter.FILTER_REJECT;
        const {core} = splitWhitespace(node.nodeValue);
        if (!core || core.length < 2 || !/[\p{L}]/u.test(core)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!state.nodeOriginals.has(node)) state.nodeOriginals.set(node, node.nodeValue);
      const original = state.nodeOriginals.get(node);
      const {prefix, core, suffix} = splitWhitespace(original);
      entries.push({kind: 'node', target: node, original, prefix, core, suffix});
    }

    const elements = [start, ...start.querySelectorAll?.('*') || []];
    elements.forEach(el => {
      if (!(el instanceof Element) || shouldSkip(el)) return;
      let saved = state.attrOriginals.get(el);
      if (!saved) { saved = {}; state.attrOriginals.set(el, saved); }
      ATTRS.forEach(attr => {
        if (!el.hasAttribute(attr)) return;
        if (!(attr in saved)) saved[attr] = el.getAttribute(attr) || '';
        const original = saved[attr];
        if (!original || original.length < 2 || !/[\p{L}]/u.test(original)) return;
        entries.push({kind: 'attr', target: el, attr, original, prefix: '', core: original, suffix: ''});
      });
    });
    return entries;
  };

  const restoreOriginals = () => {
    document.querySelectorAll('*').forEach(el => {
      const saved = state.attrOriginals.get(el);
      if (saved) Object.entries(saved).forEach(([attr, value]) => el.setAttribute(attr, value));
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (state.nodeOriginals.has(node)) node.nodeValue = state.nodeOriginals.get(node);
    }
  };

  const translateEntries = async entries => {
    if (state.language === 'de' || !entries.length) return;
    const unique = [...new Set(entries.map(entry => entry.core))];
    const translated = new Map();
    let degraded = false;
    for (let offset = 0; offset < unique.length; offset += 35) {
      const batch = unique.slice(offset, offset + 35);
      try {
        const response = await fetch('/api/uebersetzen', {
          method: 'POST', credentials: 'same-origin',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({texts: batch, source: 'auto', target: state.language})
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        (data.translations || []).forEach((value, i) => translated.set(batch[i], value || batch[i]));
        degraded = degraded || !!data.degraded;
      } catch (_) {
        degraded = true;
        batch.forEach(value => translated.set(value, value));
      }
    }
    state.translating = true;
    entries.forEach(entry => {
      const value = translated.get(entry.core) || entry.core;
      if (entry.kind === 'node' && entry.target.isConnected) entry.target.nodeValue = `${entry.prefix}${value}${entry.suffix}`;
      if (entry.kind === 'attr' && entry.target.isConnected) entry.target.setAttribute(entry.attr, value);
    });
    state.translating = false;
    showState(false, degraded);
  };

  const translateDocument = async () => {
    if (state.translating) return;
    restoreOriginals();
    document.documentElement.lang = state.language;
    if (state.language === 'de') { showState(false, false); return; }
    showState(true, false);
    await translateEntries(collect(document.body));
  };

  const scheduleTranslate = root => {
    if (state.language === 'de' || state.translating) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      showState(true, false);
      await translateEntries(collect(root || document.body));
    }, 180);
  };

  const setupLanguage = async () => {
    const select = document.getElementById('platform-language');
    if (!select) return;
    const saved = languageFromStorage();
    if ([...select.options].some(o => o.value === saved)) select.value = saved;
    state.language = select.value || 'de';
    await translateDocument();
    select.addEventListener('change', async () => {
      state.language = select.value || 'de';
      localStorage.setItem('platform-language', state.language);
      localStorage.removeItem('ahnsen-language');
      try {
        await fetch('/api/sprache', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({language:state.language})});
      } catch (_) {}
      await translateDocument();
    });
    state.observer = new MutationObserver(mutations => {
      if (state.translating) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          const root = [...mutation.addedNodes].find(node => node.nodeType === Node.ELEMENT_NODE);
          if (root) { scheduleTranslate(root); break; }
        }
      }
    });
    state.observer.observe(document.body, {childList:true, subtree:true});
  };

  const setupMessages = async () => {
    const link = document.getElementById('message-center-link');
    if (!link) return;
    try {
      const response = await fetch('/api/me/unread-count', {credentials:'same-origin'});
      if (!response.ok) return;
      const data = await response.json();
      link.hidden = !data.loggedIn;
      const badge = link.querySelector('.message-badge');
      if (badge) { badge.textContent = data.count > 99 ? '99+' : String(data.count || ''); badge.hidden = !data.count; }
    } catch (_) {}
  };

  const setupBrand = async () => {
    try {
      const response = await fetch('/api/plattform', {credentials:'same-origin'});
      if (!response.ok) return;
      const data = await response.json();
      state.platform = data;
      document.documentElement.style.setProperty('--forest', data.primary_color || '#174936');
      document.documentElement.style.setProperty('--sage', data.accent_color || '#8da77a');
      document.querySelectorAll('[data-platform-municipality]').forEach(el => el.textContent = data.municipality_name || '');
      document.querySelectorAll('[data-platform-claim]').forEach(el => el.textContent = data.claim || '');
    } catch (_) {}
  };

  const setup = async () => {
    await setupBrand();
    setupMessages();
    await setupLanguage();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true}); else setup();
})();
