(() => {
  const translations = {
    en: {
      'Start':'Home','Melden':'Report','Termine':'Events','Mehr':'More','Profil':'Profile',
      'Mein Profil':'My profile','Mein Ahnsen':'My Ahnsen','Nachrichten':'Messages','Suche':'Search',
      'Mängel melden':'Report an issue','Veranstaltungen':'Events','DGH-Kalender':'Community hall calendar',
      'Müllabfuhr':'Waste collection','Vereine & Gruppen':'Clubs & groups','Aktuelles':'News',
      'Bürgerinformationen':'Citizen information','Über Ahnsen':'About Ahnsen','Ansprechpartner':'Contacts',
      'Feuerwehr':'Fire brigade','Warnlage':'Warnings','Politik & Rat':'Politics & council',
      'Ideen für Ahnsen':'Ideas for Ahnsen','Nachbarschaftshilfe':'Neighbourhood help','Mängelkarte':'Issue map',
      'Was suchst du?':'What are you looking for?','Suchen':'Search','Zurück':'Back','Zur Bürger-App':'Back to citizen app',
      'Anmelden':'Sign in','Konto erstellen':'Create account','Abmelden':'Sign out','Speichern':'Save',
      'Neue Idee einreichen':'Submit a new idea','Idee einreichen':'Submit idea','Kommentieren':'Comment',
      'Idee unterstützen':'Support idea','Mitmachen':'Take part','Hilfe suchen oder anbieten':'Ask for or offer help',
      'Nachricht senden':'Send message','Aktuelle Warnlage ansehen':'View current warnings','Push aktivieren':'Enable notifications',
      'Auf diesem Gerät deaktivieren':'Disable on this device','Profil & Push-Auswahl speichern':'Save profile & notification choices',
      'Meine Meldungen':'My reports','Meine DGH-Anfragen':'My hall requests','Passwort ändern':'Change password',
      'Heute in Ahnsen':'Today in Ahnsen','Schön, dass du da bist.':'Good to see you.'
    },
    pl: {
      'Start':'Start','Melden':'Zgłoś','Termine':'Wydarzenia','Mehr':'Więcej','Profil':'Profil','Mein Profil':'Mój profil','Nachrichten':'Wiadomości','Suche':'Szukaj',
      'Mängel melden':'Zgłoś problem','Veranstaltungen':'Wydarzenia','DGH-Kalender':'Kalendarz domu społeczności','Müllabfuhr':'Odbiór odpadów','Bürgerinformationen':'Informacje dla mieszkańców','Über Ahnsen':'O Ahnsen','Ansprechpartner':'Kontakty','Feuerwehr':'Straż pożarna','Warnlage':'Ostrzeżenia','Politik & Rat':'Polityka i rada','Ideen für Ahnsen':'Pomysły dla Ahnsen','Nachbarschaftshilfe':'Pomoc sąsiedzka','Mängelkarte':'Mapa zgłoszeń','Was suchst du?':'Czego szukasz?','Suchen':'Szukaj','Zurück':'Wstecz','Anmelden':'Zaloguj','Abmelden':'Wyloguj','Mitmachen':'Weź udział','Nachricht senden':'Wyślij wiadomość'
    },
    uk: {
      'Start':'Головна','Melden':'Повідомити','Termine':'Події','Mehr':'Більше','Profil':'Профіль','Mein Profil':'Мій профіль','Nachrichten':'Повідомлення','Suche':'Пошук',
      'Mängel melden':'Повідомити про проблему','Veranstaltungen':'Події','Müllabfuhr':'Вивіз сміття','Bürgerinformationen':'Інформація для мешканців','Über Ahnsen':'Про Ahnsen','Ansprechpartner':'Контакти','Feuerwehr':'Пожежна служба','Warnlage':'Попередження','Politik & Rat':'Політика та рада','Ideen für Ahnsen':'Ідеї для Ahnsen','Nachbarschaftshilfe':'Сусідська допомога','Mängelkarte':'Карта повідомлень','Was suchst du?':'Що ви шукаєте?','Suchen':'Шукати','Zurück':'Назад','Anmelden':'Увійти','Abmelden':'Вийти','Mitmachen':'Долучитися','Nachricht senden':'Надіслати повідомлення'
    },
    tr: {
      'Start':'Ana sayfa','Melden':'Bildir','Termine':'Etkinlikler','Mehr':'Daha fazla','Profil':'Profil','Mein Profil':'Profilim','Nachrichten':'Mesajlar','Suche':'Ara',
      'Mängel melden':'Sorun bildir','Veranstaltungen':'Etkinlikler','Müllabfuhr':'Çöp toplama','Bürgerinformationen':'Vatandaş bilgileri','Über Ahnsen':'Ahnsen hakkında','Ansprechpartner':'İletişim','Feuerwehr':'İtfaiye','Warnlage':'Uyarılar','Politik & Rat':'Siyaset ve meclis','Ideen für Ahnsen':'Ahnsen için fikirler','Nachbarschaftshilfe':'Komşuluk yardımı','Mängelkarte':'Sorun haritası','Was suchst du?':'Ne arıyorsunuz?','Suchen':'Ara','Zurück':'Geri','Anmelden':'Giriş yap','Abmelden':'Çıkış yap','Mitmachen':'Katıl','Nachricht senden':'Mesaj gönder'
    }
  };

  const original = new WeakMap();
  const translateTextNodes = lang => {
    document.documentElement.lang = lang === 'uk' ? 'uk' : lang;
    if (lang === 'de') {
      document.querySelectorAll('[data-i18n-original]').forEach(el => {
        el.textContent = el.dataset.i18nOriginal;
        delete el.dataset.i18nOriginal;
      });
      return;
    }
    const dict = translations[lang] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || ['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
        const text = node.textContent.trim();
        return dict[text] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const el = node.parentElement;
      const key = node.textContent.trim();
      if (!el.dataset.i18nOriginal) el.dataset.i18nOriginal = key;
      node.textContent = node.textContent.replace(key, dict[key] || key);
    });
  };

  const setupLanguage = () => {
    const select = document.getElementById('platform-language');
    if (!select) return;
    const saved = localStorage.getItem('ahnsen-language') || document.cookie.match(/(?:^|; )ahnsen_language=([^;]+)/)?.[1] || 'de';
    if ([...select.options].some(o => o.value === saved)) select.value = saved;
    translateTextNodes(select.value);
    select.addEventListener('change', async () => {
      const language = select.value;
      localStorage.setItem('ahnsen-language', language);
      translateTextNodes(language);
      try {
        await fetch('/api/sprache', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({language})});
      } catch (_) {}
    });
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
      if (badge) {
        badge.textContent = data.count > 99 ? '99+' : String(data.count || '');
        badge.hidden = !data.count;
      }
    } catch (_) {}
  };

  const setupBrand = async () => {
    try {
      const response = await fetch('/api/plattform', {credentials:'same-origin'});
      if (!response.ok) return;
      const data = await response.json();
      document.documentElement.style.setProperty('--forest', data.primary_color || '#174936');
      document.documentElement.style.setProperty('--sage', data.accent_color || '#8da77a');
      document.querySelectorAll('[data-platform-name]').forEach(el => el.textContent = data.platform_name || 'Ahnsen hilft');
      document.querySelectorAll('[data-platform-claim]').forEach(el => el.textContent = data.claim || 'Dein Dorf. Unsere Gemeinschaft.');
    } catch (_) {}
  };

  const setup = () => { setupLanguage(); setupMessages(); setupBrand(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true}); else setup();
})();
