'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.error || 'Anfrage fehlgeschlagen.'), { status: response.status }); return body; }
  function render(data) {
    $('#progressLoading').classList.add('hidden'); $('#progressApp').classList.remove('hidden');
    $('#currentStreak').textContent = data.streak.current; $('#longestStreak').textContent = `Längste Serie: ${data.streak.longest} Tage`;
    $('#weeklyGoal').textContent = `${data.weeklyGoal.progress}/${data.weeklyGoal.target}`; $('#weeklyGoalBar').style.width = `${Math.min(100, data.weeklyGoal.progress / data.weeklyGoal.target * 100)}%`; $('#weeklyGoalLabel').textContent = data.weeklyGoal.complete ? 'Wochenziel geschafft!' : `Noch ${Math.max(0, data.weeklyGoal.target - data.weeklyGoal.progress)} Runden`;
    $('#weekGames').textContent = data.week.games; $('#weekStats').textContent = `${data.week.correct} richtige Antworten · ${data.week.score} Punkte`;
    const byDay = new Map((data.activity || []).map(item => [String(item.activity_day).slice(0, 10), item])); const days = [];
    for (let offset = 29; offset >= 0; offset -= 1) { const date = new Date(); date.setDate(date.getDate() - offset); const key = date.toISOString().slice(0, 10); const item = byDay.get(key); days.push(`<div class="activity-day ${item?.games || item?.answers ? 'active' : ''}" title="${key}: ${item?.games || 0} Spiele"></div>`); }
    $('#activityGrid').innerHTML = days.join('');
    $('#achievements').innerHTML = data.achievements.length ? data.achievements.map(item => `<div class="progress-item"><strong>${esc(item.title || item.achievement_id)}</strong><br><small>${esc(item.text || '')}</small></div>`).join('') : '<p class="muted">Das erste Abzeichen wartet nach deiner ersten Runde.</p>';
    $('#records').innerHTML = data.records.length ? data.records.map(item => `<div class="progress-item"><strong>${esc(item.record_key)}</strong><br><small>${item.record_value}</small></div>`).join('') : '<p class="muted">Noch keine Rekorde gespeichert.</p>';
    $('#recommendations').innerHTML = data.recommendations.length ? data.recommendations.map(item => `<a class="progress-item" href="${esc(item.href)}"><strong>${esc(item.title)}</strong><br><small>${esc(item.text)}</small></a>`).join('') : '<p class="muted">Empfehlungen sind deaktiviert.</p>';
    $('#friendActivity').innerHTML = data.friends.length ? data.friends.map(item => `<div class="progress-item"><strong>${esc(item.name)}</strong><br><small>${item.games_7d} Spiele · ${item.correct_7d} richtige Antworten in 7 Tagen</small></div>`).join('') : '<p class="muted">Noch keine Aktivitäten bestätigter Freunde.</p>';
    $('#weeklyGoalInput').value = data.weeklyGoal.target; $('#reminderHour').value = data.preferences.reminderHour; $('#reminderEnabled').checked = data.preferences.reminderEnabled; $('#recommendationsEnabled').checked = data.preferences.recommendationOptIn;
  }
  async function load() {
    try { render(await api('/api/platform/phase13/overview')); }
    catch (error) { $('#progressLoading').innerHTML = error.status === 401 ? '<h2>Bitte anmelden</h2><p>Öffne zuerst dein Profil im Solo-Modus.</p><a class="btn primary" href="/solo">Zum Solo-Modus</a>' : `<p>${esc(error.message)}</p>`; }
  }
  $('#progressSettings').addEventListener('submit', async event => { event.preventDefault(); const message = $('#progressSettingsMessage'); try { await api('/api/platform/phase13/preferences', { method: 'PATCH', body: JSON.stringify({ weeklyGoal: Number($('#weeklyGoalInput').value), reminderHour: Number($('#reminderHour').value), reminderEnabled: $('#reminderEnabled').checked, recommendationOptIn: $('#recommendationsEnabled').checked }) }); message.textContent = 'Einstellungen gespeichert.'; await load(); } catch (error) { message.textContent = error.message; } });
  load();
})();
