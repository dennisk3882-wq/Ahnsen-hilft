'use strict';
// Merkt sich ausschließlich für diesen Browser-Tab, ob noch nie Finanzplan-Daten vorhanden waren.
// So können neue Installationen nach dem Laden automatisch mit einem leeren Projekt starten.
try {
  if (!localStorage.getItem('finanzplan:data:v1')) sessionStorage.setItem('finanzplan:first-run','1');
} catch (_) {}
