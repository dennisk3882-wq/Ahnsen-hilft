'use strict';
(function(){
  data.version='3.0.0';data.schemaVersion=3;
  featureMatrix=function(){return [
    [1,'Dashboard / Startseite','complete','Safe-to-Spend, Tagesbudget, Prognose und Stressanalyse'],[2,'Konten','complete','Cent-Ledger, Eröffnungssaldo, Stichtagsabgleich und Transferprüfung'],[3,'Regelmäßige Einnahmen','complete','exakte Start-/Endregeln'],[4,'Regelmäßige Ausgaben / Fixkosten','complete','synchronisierte Zukunftsbuchungen'],[5,'Variable Ausgaben','complete','Split, Beleg und Rückerstattung'],[6,'Kategorien & Unterkategorien','complete','inkl. Händlerregeln'],[7,'Monatsbudget','complete','Warnschwellen und Netto-Rückerstattungen'],[8,'Monatsabschluss','complete','historisches Nettovermögen datumsgerecht'],[9,'Finanzkalender','complete','geplante und gebuchte Bewegungen'],[10,'Cashflow-Prognose','complete','zentrale Ereignisliste'],[11,'Sparziele','complete','Kontotöpfe ohne Doppelbelegung'],[12,'Rücklagen','complete','reversibel und mit Verpflichtungen verrechnet'],[13,'Verträge & Abos','complete','Zahlungsplanung, Restore und Fristen'],[14,'Versicherungen','complete','Zahlung, Frist und Rücklage verbunden'],[15,'Kredite & Schulden','complete','Tilgungsplan, Sondertilgung und Cascade-Restore'],[16,'Vermögensübersicht','complete','historische Stichtagsberechnung'],[17,'Haushaltsansicht','complete','Personenzuordnung und lokale Rollen'],[18,'Gemeinsame Nutzung','partial','verschlüsselter Konflikt-Sync; echtes Multiuser-Merging braucht Backend/Auth'],[19,'Belege & Dokumente','complete','IndexedDB, Papierkorb, V3-Vollbackup und Reset-Schutz'],[20,'Suche & Filter','complete','inkl. Split/Refund'],[21,'Statistiken','complete','Trends, Fixkosten und Sparquote'],[22,'Jahresübersicht','complete','12 Monate'],[23,'Echte Jahreskosten','complete','Centgenaue Monats-/Jahreswerte'],[24,'Automatische Hochrechnung','complete','Tempo + Historie + Planung'],[25,'Intelligente Hinweise','complete','stabilitätsgefilterte Preissteigerungen'],[26,'Notgroschen','complete','Reichweite mit essenziellen Kosten'],[27,'Szenario-Rechner','complete','Was-wäre-wenn'],[28,'Anschaffungs-Rechner','complete','Sparrate und Cashflow'],[29,'Urlaubs-/Projektbudgets','complete','Split/Refund, Tags, Kategorien und Zeitraum'],[30,'Wiederkehrende Buchungen','complete','exakte Serien-Synchronisierung'],[31,'Flexible Fixkostenbeträge','complete','geschätzt/real und Soll/Ist'],[32,'Benachrichtigungen','partial','Push-Client und Service Worker fertig; zuverlässige Zustellung bei geschlossener App braucht Push-Backend'],[33,'Dashboard anpassbar','complete','Module, Reihenfolge und Drag & Drop'],[34,'Dark Mode','complete','persistent'],[35,'Mobile PWA','complete','responsive, Offline, native PNG-Icons und Installationsbutton'],[36,'Schnellerfassung','complete','Ausgabe, Einnahme, Transfer, Erstattung und Beleg'],[37,'CSV-/Excel-Import','complete','deutsche Formate, XLSX, Mapping, Vorschau und Duplikate'],[38,'Bankanbindung','partial','PSD2-Client vorbereitet; Provider-Consent und Backend extern nötig'],[39,'Export','complete','CSV/XLS/PDF/JSON + binäres verschlüsseltes V3-Vollbackup'],[40,'Datensicherung','complete','IndexedDB-Snapshots, Undo, Papierkorb und Beleg-Vollbackup'],[41,'Datenschutz & Sicherheit','complete','AES-GCM-Tresor, Memory-Lock, CSP/Headers, PIN und optional WebAuthn'],[42,'Demo-/Privatmodus','complete','Beträge ausblendbar'],[43,'Finanz-Score','complete','transparente Berechnung'],[44,'KI-Finanzassistent','partial','lokaler Analyst; freie generative KI benötigt externes Modell'],[45,'Startseiten-Kurzprognose','complete','Safe-to-Spend, Tagesbudget und Reichweite']
  ].map(([n,name,status,note])=>({n,name,status,note}))};

  const baseRenderMore=renderMore;renderMore=function(){baseRenderMore();const root=$('#view-more');if(!$('#v3ArchitectureStatus',root))root.insertAdjacentHTML('beforeend',`<article id="v3ArchitectureStatus" class="card" style="margin-top:16px"><div class="card-title-row"><div><h2>Finanzplan V3</h2><p>Cent-Ledger · IndexedDB · binäres Vollbackup · gehärteter Offline-Cache · Cross-Browser-Tests</p></div><span class="tag green">3.0.0</span></div></article>`)};

  // Later compatibility layers may recreate these visual switches without their original
  // accessible name. V3 restores an explicit control name and state after every settings render.
  const v3SettingsA11yBase=renderSettings;
  renderSettings=function(){
    v3SettingsA11yBase();
    const root=$('#view-settings');
    $$('button.switch[data-setting]',root).forEach(button=>{
      const setting=button.dataset.setting||'';
      const key=setting.startsWith('widget:')?setting.slice(7):'';
      const rowTitle=button.closest('.setting-row')?.querySelector('b')?.textContent?.trim();
      const label=key&&typeof widgetLabel==='function'?widgetLabel(key):(rowTitle||'Einstellung');
      button.setAttribute('aria-label',`${label} ${button.classList.contains('on')?'deaktivieren':'aktivieren'}`);
      button.setAttribute('aria-pressed',button.classList.contains('on')?'true':'false');
      if(!button.title)button.title=label;
    });
  };
})();
