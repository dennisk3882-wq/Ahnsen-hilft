(() => {
  const SUPPORTED_LANGUAGES = new Set(['de', 'en', 'pl', 'uk', 'tr']);
  const CACHE_VERSION = 'i18n-v4';
  const CACHE_LIMIT = 900;
  const REQUEST_TIMEOUT = 12000;
  const phrasebook = {en: new Map(), pl: new Map(), uk: new Map(), tr: new Map()};

  // The essential interface is translated locally. Changing language therefore
  // always has an immediate visible result, even when every free provider is down.
  [
    ['Direkt zum Inhalt', 'Skip to content', 'Przejdź do treści', 'Перейти до вмісту', 'İçeriğe geç'],
    ['Sprache', 'Language', 'Język', 'Мова', 'Dil'],
    ['Sprache auswählen', 'Select language', 'Wybierz język', 'Вибрати мову', 'Dil seç'],
    ['Darstellung und Barrierefreiheit', 'Display and accessibility', 'Wygląd i dostępność', 'Вигляд і доступність', 'Görünüm ve erişilebilirlik'],
    ['Installieren', 'Install', 'Zainstaluj', 'Встановити', 'Yükle'],
    ['Nachrichten', 'Messages', 'Wiadomości', 'Повідомлення', 'Mesajlar'],
    ['App-Navigation', 'App navigation', 'Nawigacja aplikacji', 'Навігація застосунку', 'Uygulama menüsü'],
    ['Start', 'Home', 'Start', 'Головна', 'Ana sayfa'],
    ['Übersicht', 'Overview', 'Przegląd', 'Огляд', 'Genel bakış'],
    ['Melden', 'Report', 'Zgłoś', 'Повідомити', 'Bildir'],
    ['Mängel', 'Issues', 'Usterki', 'Несправності', 'Sorunlar'],
    ['Aktuell', 'News', 'Aktualności', 'Актуальне', 'Güncel'],
    ['Termine', 'Events', 'Wydarzenia', 'Події', 'Etkinlikler'],
    ['Mobilität', 'Mobility', 'Mobilność', 'Мобільність', 'Ulaşım'],
    ['Bus & Fahrt', 'Bus & travel', 'Autobus i przejazdy', 'Автобус і поїздки', 'Otobüs ve yolculuk'],
    ['Müll', 'Waste', 'Odpady', 'Сміття', 'Çöp'],
    ['Abfuhr', 'Collection', 'Odbiór', 'Вивезення', 'Toplama'],
    ['Belegung', 'Occupancy', 'Zajętość', 'Зайнятість', 'Doluluk'],
    ['Politik', 'Politics', 'Polityka', 'Політика', 'Siyaset'],
    ['Rat & Protokolle', 'Council & minutes', 'Rada i protokoły', 'Рада і протоколи', 'Meclis ve tutanaklar'],
    ['Vereine', 'Clubs', 'Stowarzyszenia', 'Об’єднання', 'Dernekler'],
    ['Gruppen', 'Groups', 'Grupy', 'Групи', 'Gruplar'],
    ['Ideen', 'Ideas', 'Pomysły', 'Ідеї', 'Fikirler'],
    ['Mitgestalten', 'Take part', 'Współtwórz', 'Долучитися', 'Katıl'],
    ['Helfen', 'Help', 'Pomoc', 'Допомога', 'Yardım'],
    ['Nachbarschaft', 'Neighbourhood', 'Sąsiedztwo', 'Сусідство', 'Komşuluk'],
    ['Warnlage', 'Warnings', 'Ostrzeżenia', 'Попередження', 'Uyarılar'],
    ['Amtlich', 'Official', 'Urzędowe', 'Офіційно', 'Resmî'],
    ['Karte', 'Map', 'Mapa', 'Мапа', 'Harita'],
    ['Mängelkarte', 'Issue map', 'Mapa usterek', 'Мапа несправностей', 'Sorun haritası'],
    ['Mehr', 'More', 'Więcej', 'Більше', 'Daha fazla'],
    ['Alle Bereiche', 'All sections', 'Wszystkie działy', 'Усі розділи', 'Tüm bölümler'],
    ['Profil', 'Profile', 'Profil', 'Профіль', 'Profil'],
    ['Mein Ahnsen', 'My Ahnsen', 'Mój Ahnsen', 'Мій Ahnsen', 'Ahnsen’im'],
    ['Digitale Bürgerplattform der Gemeinde Ahnsen', 'Digital citizen platform for Ahnsen', 'Cyfrowa platforma mieszkańców Ahnsen', 'Цифрова платформа для мешканців Ahnsen', 'Ahnsen dijital vatandaş platformu'],
    ['Guten Morgen', 'Good morning', 'Dzień dobry', 'Доброго ранку', 'Günaydın'],
    ['Guten Tag', 'Hello', 'Dzień dobry', 'Добрий день', 'Merhaba'],
    ['Guten Abend', 'Good evening', 'Dobry wieczór', 'Добрий вечір', 'İyi akşamlar'],
    ['Schön, dass du da bist.', 'Good to see you.', 'Dobrze, że jesteś.', 'Раді, що ви тут.', 'Burada olmanıza sevindik.'],
    ['Nächster Termin', 'Next event', 'Najbliższe wydarzenie', 'Найближча подія', 'Sıradaki etkinlik'],
    ['Nächste Müllabfuhr', 'Next waste collection', 'Najbliższy odbiór odpadów', 'Наступне вивезення сміття', 'Sıradaki çöp toplama'],
    ['Amtliche Warnung für Ahnsen', 'Official warning for Ahnsen', 'Oficjalne ostrzeżenie dla Ahnsen', 'Офіційне попередження для Ahnsen', 'Ahnsen için resmî uyarı'],
    ['Was suchst du? Müll, DGH, Rat, Feuerwehr …', 'What are you looking for? Waste, community hall, council, fire brigade …', 'Czego szukasz? Odpady, dom kultury, rada, straż pożarna …', 'Що ви шукаєте? Сміття, громадський центр, рада, пожежна служба …', 'Ne arıyorsunuz? Çöp, toplum merkezi, meclis, itfaiye …'],
    ['Suche', 'Search', 'Szukaj', 'Пошук', 'Ara'],
    ['Suchen', 'Search', 'Szukaj', 'Шукати', 'Ara'],
    ['Digitale Dienste', 'Digital services', 'Usługi cyfrowe', 'Цифрові послуги', 'Dijital hizmetler'],
    ['Mängel melden', 'Report an issue', 'Zgłoś usterkę', 'Повідомити про несправність', 'Sorun bildir'],
    ['Direkt mit Foto und Standort.', 'Directly with a photo and location.', 'Bezpośrednio ze zdjęciem i lokalizacją.', 'Одразу з фото та місцем.', 'Fotoğraf ve konumla doğrudan bildirin.'],
    ['Aktuelles & Termine', 'News & events', 'Aktualności i wydarzenia', 'Новини та події', 'Haberler ve etkinlikler'],
    ['Termine, Neuigkeiten und Rückblicke.', 'Events, news and reviews.', 'Wydarzenia, wiadomości i relacje.', 'Події, новини та огляди.', 'Etkinlikler, haberler ve geçmiş içerikler.'],
    ['DGH-Kalender', 'Community hall calendar', 'Kalendarz domu kultury', 'Календар громадського центру', 'Toplum merkezi takvimi'],
    ['Freie Tage und Belegungen.', 'Available dates and bookings.', 'Wolne terminy i rezerwacje.', 'Вільні дати та бронювання.', 'Boş tarihler ve rezervasyonlar.'],
    ['Müllabfuhr', 'Waste collection', 'Odbiór odpadów', 'Вивезення сміття', 'Çöp toplama'],
    ['Termine und Kalenderexport.', 'Dates and calendar export.', 'Terminy i eksport kalendarza.', 'Дати та експорт календаря.', 'Tarihler ve takvim dışa aktarma.'],
    ['Vereine & Gruppen', 'Clubs & groups', 'Stowarzyszenia i grupy', 'Об’єднання та групи', 'Dernekler ve gruplar'],
    ['Gemeinschaft erleben.', 'Experience the community.', 'Poznaj lokalną społeczność.', 'Долучайтеся до громади.', 'Topluluğu yaşayın.'],
    ['Bürgerservice', 'Citizen services', 'Usługi dla mieszkańców', 'Послуги для мешканців', 'Vatandaş hizmetleri'],
    ['Anträge, Dokumente & Rathausservices.', 'Applications, documents & municipal services.', 'Wnioski, dokumenty i usługi urzędu.', 'Заяви, документи та муніципальні послуги.', 'Başvurular, belgeler ve belediye hizmetleri.'],
    ['Über Ahnsen', 'About Ahnsen', 'O Ahnsen', 'Про Ahnsen', 'Ahnsen hakkında'],
    ['Unser Dorf im Überblick.', 'Our village at a glance.', 'Nasza wieś w skrócie.', 'Наше село з першого погляду.', 'Köyümüze genel bakış.'],
    ['Ansprechpartner', 'Contacts', 'Kontakty', 'Контакти', 'İletişim'],
    ['Wichtige Kontakte auf einen Blick.', 'Important contacts at a glance.', 'Najważniejsze kontakty w skrócie.', 'Важливі контакти з першого погляду.', 'Önemli iletişim bilgileri.'],
    ['Amtliche Wetter- und Gefahrenwarnungen für Ahnsen.', 'Official weather and hazard warnings for Ahnsen.', 'Oficjalne ostrzeżenia pogodowe i o zagrożeniach dla Ahnsen.', 'Офіційні попередження про погоду та небезпеки для Ahnsen.', 'Ahnsen için resmî hava ve tehlike uyarıları.'],
    ['Öffentliche Meldungen auf der Dorfkarte.', 'Public reports on the village map.', 'Publiczne zgłoszenia na mapie wsi.', 'Публічні повідомлення на мапі села.', 'Köy haritasındaki herkese açık bildirimler.'],
    ['Ideen für Ahnsen', 'Ideas for Ahnsen', 'Pomysły dla Ahnsen', 'Ідеї для Ahnsen', 'Ahnsen için fikirler'],
    ['Vorschlagen, unterstützen und kommentieren.', 'Suggest, support and comment.', 'Proponuj, wspieraj i komentuj.', 'Пропонуйте, підтримуйте й коментуйте.', 'Önerin, destekleyin ve yorum yapın.'],
    ['Politik & Rat', 'Politics & council', 'Polityka i rada', 'Політика та рада', 'Siyaset ve meclis'],
    ['Sitzungen, Protokolle und Beschlüsse.', 'Meetings, minutes and decisions.', 'Posiedzenia, protokoły i uchwały.', 'Засідання, протоколи та рішення.', 'Toplantılar, tutanaklar ve kararlar.'],
    ['Nachbarschaftshilfe', 'Neighbourhood help', 'Pomoc sąsiedzka', 'Сусідська допомога', 'Komşuluk yardımı'],
    ['Hilfe im Dorf suchen oder anbieten.', 'Find or offer help in the village.', 'Szukaj lub oferuj pomoc we wsi.', 'Шукайте або пропонуйте допомогу в селі.', 'Köyde yardım arayın veya sunun.'],
    ['Digitaler Mängelmelder', 'Digital issue reporter', 'Cyfrowe zgłaszanie usterek', 'Цифрове повідомлення про несправності', 'Dijital sorun bildirimi'],
    ['Was können wir verbessern?', 'What can we improve?', 'Co możemy poprawić?', 'Що ми можемо покращити?', 'Neyi iyileştirebiliriz?'],
    ['Deine Meldung landet direkt im Verwaltungs-Dashboard und erhält eine Vorgangsnummer.', 'Your report goes directly to the administration dashboard and receives a reference number.', 'Twoje zgłoszenie trafia bezpośrednio do panelu administracji i otrzymuje numer sprawy.', 'Ваше повідомлення одразу потрапить до панелі адміністрації та отримає номер справи.', 'Bildiriminiz doğrudan yönetim paneline gider ve bir işlem numarası alır.'],
    ['Art des Mangels', 'Type of issue', 'Rodzaj usterki', 'Тип несправності', 'Sorun türü'],
    ['Wähle die passendste Kategorie.', 'Select the most suitable category.', 'Wybierz najlepiej pasującą kategorię.', 'Виберіть найбільш відповідну категорію.', 'En uygun kategoriyi seçin.'],
    ['Kategorie *', 'Category *', 'Kategoria *', 'Категорія *', 'Kategori *'],
    ['Bitte auswählen', 'Please select', 'Wybierz', 'Будь ласка, виберіть', 'Lütfen seçin'],
    ['Wo ist der Mangel?', 'Where is the issue?', 'Gdzie jest usterka?', 'Де знаходиться несправність?', 'Sorun nerede?'],
    ['Je genauer der Ort, desto schneller kann er geprüft werden.', 'The more precise the location, the faster it can be checked.', 'Im dokładniejsza lokalizacja, tym szybciej można ją sprawdzić.', 'Чим точніше місце, тим швидше його можна перевірити.', 'Konum ne kadar net olursa o kadar hızlı kontrol edilir.'],
    ['Straße, Hausnummer oder Ortsbeschreibung *', 'Street, house number or location description *', 'Ulica, numer domu lub opis miejsca *', 'Вулиця, номер будинку або опис місця *', 'Sokak, bina numarası veya konum açıklaması *'],
    ['Standort übernehmen', 'Use current location', 'Użyj bieżącej lokalizacji', 'Використати поточне місце', 'Mevcut konumu kullan'],
    ['Optional – nur nach deiner Freigabe.', 'Optional – only with your permission.', 'Opcjonalnie – tylko za Twoją zgodą.', 'Необов’язково — лише з вашого дозволу.', 'İsteğe bağlıdır — yalnızca izninizle.'],
    ['Kurze Beschreibung', 'Short description', 'Krótki opis', 'Короткий опис', 'Kısa açıklama'],
    ['Beschreibe, was genau auffällig oder beschädigt ist.', 'Describe exactly what is unusual or damaged.', 'Opisz dokładnie, co jest uszkodzone lub nieprawidłowe.', 'Опишіть, що саме пошкоджено або не так.', 'Tam olarak neyin hasarlı veya sorunlu olduğunu açıklayın.'],
    ['Beschreibung *', 'Description *', 'Opis *', 'Опис *', 'Açıklama *'],
    ['Bitte mindestens 10 Zeichen eingeben.', 'Please enter at least 10 characters.', 'Wpisz co najmniej 10 znaków.', 'Введіть щонайменше 10 символів.', 'Lütfen en az 10 karakter girin.'],
    ['Foto hinzufügen', 'Add photo', 'Dodaj zdjęcie', 'Додати фото', 'Fotoğraf ekle'],
    ['Ein Foto ist optional, hilft aber häufig bei der Einschätzung.', 'A photo is optional but often helps with assessment.', 'Zdjęcie jest opcjonalne, ale często ułatwia ocenę.', 'Фото необов’язкове, але часто допомагає оцінити ситуацію.', 'Fotoğraf isteğe bağlıdır ancak değerlendirmeye yardımcı olur.'],
    ['Foto aufnehmen oder auswählen', 'Take or select a photo', 'Zrób lub wybierz zdjęcie', 'Зробити або вибрати фото', 'Fotoğraf çekin veya seçin'],
    ['Kontakt für Rückfragen', 'Contact for questions', 'Kontakt w razie pytań', 'Контакт для уточнень', 'Sorular için iletişim'],
    ['Freiwillig. Die Meldung kann auch ohne Kontaktdaten gesendet werden.', 'Optional. The report can also be sent without contact details.', 'Opcjonalnie. Zgłoszenie można wysłać bez danych kontaktowych.', 'Необов’язково. Повідомлення можна надіслати без контактних даних.', 'İsteğe bağlıdır. Bildirim iletişim bilgileri olmadan da gönderilebilir.'],
    ['Name', 'Name', 'Imię i nazwisko', 'Ім’я', 'Ad'],
    ['E-Mail', 'Email', 'E-mail', 'Електронна пошта', 'E-posta'],
    ['Datenschutzhinweise', 'privacy notice', 'informacje o ochronie danych', 'повідомлення про захист даних', 'gizlilik bildirimini'],
    ['Meldung verbindlich absenden', 'Submit report', 'Wyślij zgłoszenie', 'Надіслати повідомлення', 'Bildirimi gönder'],
    ['Nach dem Absenden erhältst du sofort eine Vorgangsnummer.', 'After submitting, you will immediately receive a reference number.', 'Po wysłaniu od razu otrzymasz numer sprawy.', 'Після надсилання ви одразу отримаєте номер справи.', 'Gönderdikten sonra hemen bir işlem numarası alırsınız.'],
    ['Bitte fülle alle Pflichtfelder vollständig aus und bestätige die Datenschutzhinweise.', 'Please complete all required fields and confirm the privacy notice.', 'Wypełnij wszystkie wymagane pola i potwierdź informacje o ochronie danych.', 'Заповніть усі обов’язкові поля та підтвердьте повідомлення про захист даних.', 'Lütfen tüm zorunlu alanları doldurun ve gizlilik bildirimini onaylayın.'],
    ['Darstellung', 'Display', 'Wygląd', 'Вигляд', 'Görünüm'],
    ['Größere Schrift', 'Larger text', 'Większy tekst', 'Більший текст', 'Daha büyük yazı'],
    ['Hoher Kontrast', 'High contrast', 'Wysoki kontrast', 'Високий контраст', 'Yüksek kontrast'],
    ['Einfache Ansicht', 'Simple view', 'Prosty widok', 'Спрощений вигляд', 'Basit görünüm'],
    ['Weniger Bewegung', 'Reduce motion', 'Mniej animacji', 'Менше руху', 'Daha az hareket'],
    ['Du bist offline. Bereits geladene Inhalte bleiben verfügbar.', 'You are offline. Previously loaded content remains available.', 'Jesteś offline. Wcześniej wczytane treści pozostają dostępne.', 'Ви офлайн. Раніше завантажений вміст залишається доступним.', 'Çevrimdışısınız. Önceden yüklenen içerikler kullanılabilir.']
  ].forEach(([de, en, pl, uk, tr]) => {
    phrasebook.en.set(de, en);
    phrasebook.pl.set(de, pl);
    phrasebook.uk.set(de, uk);
    phrasebook.tr.set(de, tr);
  });

  const state = {
    language: 'de',
    revision: 0,
    nodeOriginals: new WeakMap(),
    attrOriginals: new WeakMap(),
    timer: null,
    observer: null,
    abortController: null,
    suppressObserver: 0,
    platform: null,
    caches: new Map(),
  };

  const SKIP = 'script,style,noscript,code,pre,svg,[data-no-translate],[translate="no"],[contenteditable="true"]';
  const ATTRS = ['placeholder', 'title', 'aria-label'];

  const safeStorageGet = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const safeStorageSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const languageFromStorage = () => {
    const cookie = document.cookie.match(/(?:^|; )platform_language=([^;]+)/)?.[1];
    const candidate = safeStorageGet('platform-language') || safeStorageGet('ahnsen-language') || cookie || document.body?.dataset.platformDefaultLanguage || 'de';
    return SUPPORTED_LANGUAGES.has(candidate) ? candidate : 'de';
  };

  const getCache = language => {
    if (state.caches.has(language)) return state.caches.get(language);
    let values = {};
    try {
      const saved = JSON.parse(safeStorageGet(`${CACHE_VERSION}:${language}`) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) values = saved;
    } catch (_) {}
    const cache = new Map(Object.entries(values).slice(-CACHE_LIMIT));
    state.caches.set(language, cache);
    return cache;
  };

  const persistCache = language => {
    const cache = getCache(language);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    safeStorageSet(`${CACHE_VERSION}:${language}`, JSON.stringify(Object.fromEntries(cache)));
  };

  const showState = (mode = 'idle') => {
    const el = document.getElementById('translation-state');
    if (!el) return;
    const loading = mode === 'loading';
    const degraded = mode === 'degraded';
    el.hidden = !loading && !degraded;
    el.textContent = degraded ? '!' : '↻';
    el.title = degraded ? 'Einige Inhalte sind noch auf Deutsch. Zum erneuten Übersetzen anklicken.' : 'Inhalt wird übersetzt';
    el.setAttribute('aria-label', el.title);
    el.dataset.mode = mode;
  };

  const shouldSkip = element => !element || !!element.closest(SKIP) || !!element.closest('#platform-language, #translation-state');
  const splitWhitespace = value => {
    const match = String(value || '').match(/^(\s*)(.*?)(\s*)$/s);
    return {prefix: match?.[1] || '', core: match?.[2] || '', suffix: match?.[3] || ''};
  };

  const collect = root => {
    const entries = [];
    let start = root || document.body;
    if (start.nodeType === Node.TEXT_NODE) start = start.parentElement;
    if (!start || start.nodeType !== Node.ELEMENT_NODE) start = document.body;
    if (!start) return entries;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
        const {core} = splitWhitespace(node.nodeValue);
        return core.length >= 2 && /[\p{L}]/u.test(core) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!state.nodeOriginals.has(node)) state.nodeOriginals.set(node, node.nodeValue);
      const original = state.nodeOriginals.get(node);
      const {prefix, core, suffix} = splitWhitespace(original);
      entries.push({kind: 'node', target: node, prefix, core, suffix});
    }
    const elements = [start, ...(start.querySelectorAll?.('*') || [])];
    elements.forEach(el => {
      if (!(el instanceof Element) || shouldSkip(el)) return;
      let saved = state.attrOriginals.get(el);
      if (!saved) { saved = {}; state.attrOriginals.set(el, saved); }
      ATTRS.forEach(attr => {
        if (!el.hasAttribute(attr)) return;
        if (!(attr in saved)) saved[attr] = el.getAttribute(attr) || '';
        const original = saved[attr];
        if (original.length >= 2 && /[\p{L}]/u.test(original)) entries.push({kind: 'attr', target: el, attr, prefix: '', core: original, suffix: ''});
      });
    });
    return entries;
  };

  const withObserverSuppressed = callback => {
    state.suppressObserver += 1;
    try { callback(); } finally { setTimeout(() => { state.suppressObserver = Math.max(0, state.suppressObserver - 1); }, 0); }
  };

  const applyEntries = (entries, translated) => withObserverSuppressed(() => {
    entries.forEach(entry => {
      const value = translated.get(entry.core);
      if (value === undefined || !entry.target.isConnected) return;
      if (entry.kind === 'node') entry.target.nodeValue = `${entry.prefix}${value}${entry.suffix}`;
      else entry.target.setAttribute(entry.attr, value);
    });
  });

  const restoreOriginals = () => withObserverSuppressed(() => {
    document.querySelectorAll('*').forEach(el => {
      const saved = state.attrOriginals.get(el);
      if (saved) Object.entries(saved).forEach(([attr, value]) => el.setAttribute(attr, value));
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (state.nodeOriginals.has(node)) node.nodeValue = state.nodeOriginals.get(node);
    }
  });

  const translateEntries = async (entries, revision) => {
    if (state.language === 'de' || !entries.length || revision !== state.revision) return false;
    const language = state.language;
    const local = phrasebook[language] || new Map();
    const cache = getCache(language);
    const unique = [...new Set(entries.map(entry => entry.core))];
    const translated = new Map();
    unique.forEach(value => {
      const known = local.get(value) || cache.get(value);
      if (known) translated.set(value, known);
    });
    applyEntries(entries, translated);

    const missing = unique.filter(value => !translated.has(value));
    if (!missing.length) return false;
    let degraded = false;
    for (let offset = 0; offset < missing.length; offset += 24) {
      if (revision !== state.revision) return degraded;
      const batch = missing.slice(offset, offset + 24);
      state.abortController = new AbortController();
      const timeout = setTimeout(() => state.abortController?.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch('/api/uebersetzen', {
          method: 'POST', credentials: 'same-origin', signal: state.abortController.signal,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({texts: batch, source: 'de', target: language})
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        (data.translations || []).forEach((value, index) => {
          const original = batch[index];
          const result = String(value || original);
          translated.set(original, result);
          if (result !== original) cache.set(original, result);
        });
        degraded = degraded || !!data.degraded || (data.translations || []).length !== batch.length;
        if (revision === state.revision) applyEntries(entries, translated);
      } catch (_) {
        degraded = true;
      } finally {
        clearTimeout(timeout);
      }
    }
    persistCache(language);
    return degraded;
  };

  const translateDocument = async () => {
    const revision = ++state.revision;
    state.abortController?.abort();
    restoreOriginals();
    document.documentElement.lang = state.language;
    if (state.language === 'de') { showState('idle'); return; }
    showState('loading');
    const degraded = await translateEntries(collect(document.body), revision);
    if (revision === state.revision) showState(degraded ? 'degraded' : 'idle');
  };

  const scheduleTranslate = root => {
    if (state.language === 'de' || state.suppressObserver) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      const revision = state.revision;
      const degraded = await translateEntries(collect(root || document.body), revision);
      if (revision === state.revision) showState(degraded ? 'degraded' : 'idle');
    }, 220);
  };

  const saveLanguage = language => {
    safeStorageSet('platform-language', language);
    try { localStorage.removeItem('ahnsen-language'); } catch (_) {}
    fetch('/api/sprache', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
      body: JSON.stringify({language})
    }).catch(() => {});
  };

  const setupLanguage = async () => {
    const select = document.getElementById('platform-language');
    if (!select) return;
    [...select.options].forEach(option => { if (!SUPPORTED_LANGUAGES.has(option.value)) option.remove(); });
    const saved = languageFromStorage();
    select.value = [...select.options].some(option => option.value === saved) ? saved : 'de';
    state.language = select.value || 'de';
    select.addEventListener('change', () => {
      state.language = SUPPORTED_LANGUAGES.has(select.value) ? select.value : 'de';
      saveLanguage(state.language);
      translateDocument();
    });
    const retry = document.getElementById('translation-state');
    retry?.addEventListener('click', () => { if (retry.dataset.mode === 'degraded') translateDocument(); });
    state.observer = new MutationObserver(mutations => {
      if (state.suppressObserver) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          scheduleTranslate(mutation.addedNodes[0]);
          break;
        }
      }
    });
    state.observer.observe(document.body, {childList: true, subtree: true});
    await translateDocument();
  };

  const refreshMessages = async () => {
    const link = document.getElementById('message-center-link');
    if (!link) return;
    const badge = link.querySelector('.message-badge');
    if (badge) { badge.textContent = ''; badge.hidden = true; }
    try {
      const response = await fetch('/api/me/unread-count', {credentials: 'same-origin', cache: 'no-store', headers: {'Cache-Control': 'no-cache'}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      link.hidden = !data.loggedIn;
      const count = Number(data.count || 0);
      if (badge) { badge.textContent = count > 99 ? '99+' : (count > 0 ? String(count) : ''); badge.hidden = count <= 0; }
    } catch (_) {
      if (badge) { badge.textContent = ''; badge.hidden = true; }
    }
  };

  const setupMessages = () => {
    if (!document.getElementById('message-center-link')) return;
    refreshMessages();
    window.addEventListener('pageshow', refreshMessages);
    window.addEventListener('focus', refreshMessages);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMessages(); });
  };

  const setupBrand = async () => {
    try {
      const response = await fetch('/api/plattform', {credentials: 'same-origin'});
      if (!response.ok) return;
      const data = await response.json();
      state.platform = data;
      document.documentElement.style.setProperty('--forest', data.primary_color || '#174936');
      document.documentElement.style.setProperty('--sage', data.accent_color || '#8da77a');
      document.querySelectorAll('[data-platform-municipality]').forEach(el => { el.textContent = data.municipality_name || ''; });
      document.querySelectorAll('[data-platform-claim]').forEach(el => { el.textContent = data.claim || ''; });
    } catch (_) {}
  };

  const setup = async () => { await setupBrand(); setupMessages(); await setupLanguage(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once: true}); else setup();
})();
