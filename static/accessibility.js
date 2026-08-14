(() => {
  const settings = ['large', 'contrast', 'simple', 'reduce'];
  const key = name => `ahnsen-a11y-${name}`;
  const LARGE_SCALE = 1.22;
  const originalFontSizes = new WeakMap();
  const scaledElements = new Set();
  let observer;

  const hasDirectText = element => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.matches('input,select,textarea,button,summary,option')) return true;
    if (element.closest('[aria-hidden="true"],.service-icon,.nav-icon,.glyph,.card-arrow,.home-quick-arrow')) return false;
    return Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && /\S/.test(node.textContent || ''));
  };

  const candidatesIn = root => {
    const elements = [];
    if (root instanceof HTMLElement && hasDirectText(root)) elements.push(root);
    if (root instanceof Element || root instanceof Document) {
      root.querySelectorAll('*').forEach(element => {
        if (hasDirectText(element)) elements.push(element);
      });
    }
    return elements;
  };

  const nearestScaledParent = element => {
    let parent = element.parentElement;
    while (parent) {
      if (scaledElements.has(parent)) return parent;
      parent = parent.parentElement;
    }
    return null;
  };

  const enlarge = root => {
    const snapshots = candidatesIn(root)
      .filter(element => !scaledElements.has(element))
      .map(element => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }))
      .filter(item => Number.isFinite(item.size) && item.size > 0);

    snapshots.forEach(({ element, size }) => {
      const parent = nearestScaledParent(element);
      if (parent) {
        const parentSize = Number.parseFloat(getComputedStyle(parent).fontSize);
        if (Number.isFinite(parentSize) && Math.abs(parentSize - size) < 0.1) return;
      }
      originalFontSizes.set(element, {
        value: element.style.getPropertyValue('font-size'),
        priority: element.style.getPropertyPriority('font-size'),
      });
      element.style.setProperty('font-size', `${Math.round(size * LARGE_SCALE * 100) / 100}px`, 'important');
      scaledElements.add(element);
    });
  };

  const restoreFontSizes = () => {
    scaledElements.forEach(element => {
      const original = originalFontSizes.get(element);
      if (!original) return;
      if (original.value) element.style.setProperty('font-size', original.value, original.priority);
      else element.style.removeProperty('font-size');
    });
    scaledElements.clear();
  };

  const applyLargeText = enabled => {
    document.documentElement.classList.toggle('a11y-large', enabled);
    if (!document.body) return;
    if (enabled) {
      enlarge(document);
      if (!observer) {
        observer = new MutationObserver(records => {
          if (!document.documentElement.classList.contains('a11y-large')) return;
          records.forEach(record => record.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) enlarge(node);
            else if (node.nodeType === Node.TEXT_NODE && node.parentElement) enlarge(node.parentElement);
          }));
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      restoreFontSizes();
      observer?.disconnect();
      observer = undefined;
    }
  };

  const apply = () => {
    applyLargeText(localStorage.getItem(key('large')) === '1');
    settings.filter(name => name !== 'large').forEach(name => {
      document.documentElement.classList.toggle(`a11y-${name}`, localStorage.getItem(key(name)) === '1');
    });
  };

  apply();
  const setup = () => {
    const trigger = document.getElementById('accessibility-toggle');
    const panel = document.getElementById('accessibility-panel');
    if (!trigger || !panel) return;
    document.querySelectorAll('[data-accessibility-profile] select').forEach(select => {
      const name = select.name.replace('a11y_', '');
      localStorage.setItem(key(name), select.value === 'ja' ? '1' : '0');
    });
    apply();
    const refresh = () => settings.forEach(name => {
      const button = panel.querySelector(`[data-a11y="${name}"]`);
      if (button) button.setAttribute('aria-pressed', localStorage.getItem(key(name)) === '1' ? 'true' : 'false');
    });
    trigger.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { refresh(); panel.querySelector('button')?.focus(); }
    });
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-a11y]');
      if (!button) return;
      const name = button.dataset.a11y;
      localStorage.setItem(key(name), localStorage.getItem(key(name)) === '1' ? '0' : '1');
      apply();
      refresh();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
    });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', setup, { once: true }) : setup();
})();
