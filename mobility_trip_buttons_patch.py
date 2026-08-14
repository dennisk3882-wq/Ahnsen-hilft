from __future__ import annotations

from fastapi import Query
from fastapi.responses import JSONResponse

import mobility_citizen as legacy
import mobility_journey_patch as journey


router = journey.router
_journey_content = journey.content

_COMPACT_STYLE = r'''
<style>
/* Die Verbindungssuche ist die primäre Bürgeransicht. Die frühere technische
   Abfahrtstafel bleibt im DOM als interner Daten-/Kompatibilitätslayer, wird
   aber nicht mehr sichtbar dargestellt. */
.mob-citizen .cit-board,
.mob-citizen .cit-day,
.mob-citizen .cit-map-details,
.mob-citizen .cit-lines { display: none !important; }
.mob-citizen .journey-card { margin-bottom: 22px; }
.mob-citizen .app-main { padding-bottom: 190px; }
</style>
'''


def compact_content() -> str:
    return _COMPACT_STYLE + _journey_content()


@router.get("/api/mobilitaet/fahrt-id", name="journey_trip_details_by_id")
async def journey_trip_details_by_id(
    trip_id: str = Query(..., min_length=1, max_length=500),
):
    return JSONResponse(
        journey._trip_stops(trip_id),
        headers={"Cache-Control": "no-store"},
    )


_TRIP_BUTTONS_STYLE = r'''
<style>
.journey-stop-actions{display:grid;gap:8px;margin-top:12px}
.journey-stops-btn{width:100%;min-height:46px;padding:10px 14px;border:1px solid #bfd3c1;border-radius:14px;background:#eef6ed;color:var(--forest);font-size:.78rem;font-weight:900;text-align:left;cursor:pointer}
.journey-stops-btn:active{transform:scale(.99)}
.journey-stops-btn small{display:block;margin-top:2px;color:var(--muted);font-size:.67rem;font-weight:700}
</style>
'''


_TRIP_BUTTONS_JS = r'''
<script>
(() => {
  const results = document.getElementById('journey-results');
  const from = document.getElementById('journey-from');
  const toId = document.getElementById('journey-to-id');
  const timeInput = document.getElementById('journey-time');
  const sheet = document.getElementById('trip-sheet-backdrop');
  const sheetBody = document.getElementById('trip-sheet-body');
  const sheetTitle = document.getElementById('trip-sheet-title');
  if (!results || !from || !toId || !timeInput || !sheet || !sheetBody || !sheetTitle) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastKey = '';
  let loading = false;

  function renderStops(data, currentName = '') {
    sheetTitle.textContent = data.line ? `Linie ${data.line} → ${data.direction || ''}` : 'Fahrtverlauf';
    if (!data.stops || !data.stops.length) {
      sheetBody.innerHTML = `<div class="cit-empty">${esc(data.message || 'Keine Haltestellenfolge verfügbar.')}</div>`;
      return;
    }
    const needle = String(currentName || '').replace('Ahnsen, ', '').toLowerCase();
    sheetBody.innerHTML = `<div class="trip-stop-list">${data.stops.map(s => {
      const name = String(s.name || '');
      const current = needle && name.toLowerCase().includes(needle);
      return `<div class="trip-stop ${current ? 'current' : ''}"><span class="trip-stop-time">${esc(s.departure || s.arrival || '')}</span><span class="trip-stop-dot"></span><span class="trip-stop-name">${esc(name)}</span></div>`;
    }).join('')}</div>`;
  }

  async function openTrip(button) {
    const tripId = button.dataset.tripid || '';
    if (!tripId) return;
    sheet.hidden = false;
    sheetTitle.textContent = button.dataset.line ? `Linie ${button.dataset.line}` : 'Fahrtverlauf';
    sheetBody.innerHTML = '<div class="cit-empty">Haltestellen werden geladen …</div>';
    try {
      const r = await fetch(`/api/mobilitaet/fahrt-id?trip_id=${encodeURIComponent(tripId)}`, {cache:'no-store'});
      const d = await r.json();
      renderStops(d, button.dataset.from || '');
    } catch (_) {
      sheetBody.innerHTML = '<div class="cit-empty">Die Haltestellenfolge konnte gerade nicht geladen werden.</div>';
    }
  }

  results.addEventListener('click', e => {
    const button = e.target.closest('.journey-stops-btn');
    if (button) openTrip(button);
  });

  async function addButtons() {
    const cards = [...results.querySelectorAll('.journey-result')];
    if (!cards.length || !toId.value) return;
    const key = `${from.value}|${toId.value}|${timeInput.value}|${cards.length}`;
    if (loading || (lastKey === key && cards.every(c => c.dataset.stopButtonsReady === '1'))) return;
    loading = true;
    try {
      const r = await fetch(`/api/mobilitaet/verbindungen?start=${encodeURIComponent(from.value)}&ziel=${encodeURIComponent(toId.value)}&zeit=${encodeURIComponent(timeInput.value)}`, {cache:'no-store'});
      if (!r.ok) return;
      const d = await r.json();
      const connections = d.connections || [];
      cards.forEach((card, index) => {
        const connection = connections[index];
        if (!connection) return;
        card.querySelector('.journey-stop-actions')?.remove();
        const legs = (connection.legs || []).filter(l => !['WALK','BIKE','CAR'].includes(String(l.mode || '').toUpperCase()) && l.trip_id);
        if (!legs.length) return;
        const wrap = document.createElement('div');
        wrap.className = 'journey-stop-actions';
        legs.forEach((leg, legIndex) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'journey-stops-btn';
          button.dataset.tripid = leg.trip_id;
          button.dataset.line = leg.line || '';
          button.dataset.from = leg.from || '';
          const suffix = legs.length > 1 && leg.line ? ` · Linie ${leg.line}` : '';
          button.innerHTML = `Alle Haltestellen anzeigen${esc(suffix)}<small>${esc(leg.from || '')} → ${esc(leg.to || leg.direction || '')}</small>`;
          wrap.appendChild(button);
        });
        card.appendChild(wrap);
        card.dataset.stopButtonsReady = '1';
      });
      lastKey = key;
    } catch (_) {
      // Die Verbindung bleibt weiterhin sichtbar; nur der Detailbutton fehlt.
    } finally {
      loading = false;
    }
  }

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(addButtons, 80);
  });
  observer.observe(results, {childList:true, subtree:true});
  addButtons();
})();
</script>
'''


def content() -> str:
    return _TRIP_BUTTONS_STYLE + compact_content() + _TRIP_BUTTONS_JS


journey.legacy._content = content
legacy._content = content
