'use strict';
(() => {
  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Modul konnte nicht geladen werden: ${src}`));
      document.head.appendChild(script);
    });
  }
  load('/community-core.js')
    .then(() => load('/community-social.js'))
    .then(() => load('/community-games.js'))
    .then(() => {
      const privateOption = document.querySelector('#packVisibility option[value="private"]');
      if (privateOption) privateOption.textContent = 'Privat – nur du';
      window.QTCommunity?.init?.();
    })
    .catch(error => {
      console.error(error);
      const target = document.querySelector('#communityLoginRequired');
      if (target) {
        target.classList.remove('hidden');
        target.innerHTML = `<h2>Community konnte nicht geladen werden</h2><p>${String(error.message || error)}</p>`;
      }
    });
})();
