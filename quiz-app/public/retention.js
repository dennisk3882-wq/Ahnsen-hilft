'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function api(url, options={}) {
  const response = await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
  return data;
}
function metric(label,value){return `<div class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function render(data){
  $('#streakHero').textContent = `${data.streak.current} Tage`;
  $('#weeklyGoals').innerHTML = (data.goals||[]).map(goal=>{
    const percent=Math.min(100,Math.round(Number(goal.progress||0)/Number(goal.target||1)*100));
    return `<div class="goal-card"><strong>${esc(goal.title)}</strong><p>${goal.progress} von ${goal.target}</p><div class="goal-track"><span style="width:${percent}%"></span></div>${goal.complete&&!goal.reward_claimed?`<button class="btn primary small" data-claim="${esc(goal.goal_key)}">${goal.reward} XP abholen</button>`:goal.reward_claimed?'<small>Belohnung abgeholt</small>':''}</div>`;
  }).join('') || '<p class="muted">Noch keine Wochenziele verfügbar.</p>';
  $('#personalRecords').innerHTML = [metric('Beste Serie',`${data.records.bestStreak} Tage`),metric('Quizrunden',data.records.quizzes),metric('Richtige Antworten',data.records.totalCorrect),metric('Beste Einzelantwort',`${data.records.bestAnswerScore} P.`)].join('');
  const improve=(data.recommendations.improve||[]).map(x=>`<a href="/solo">${esc(x.category)} · ${x.accuracy}%</a>`).join('');
  const discover=(data.recommendations.discover||[]).map(x=>`<a href="/solo">${esc(x)}</a>`).join('');
  $('#recommendations').innerHTML=`<div class="recommend-card"><strong>Hier kannst du dich verbessern</strong><div class="tag-list">${improve||'<span>Noch nicht genug Daten</span>'}</div></div><div class="recommend-card"><strong>Neue Kategorien entdecken</strong><div class="tag-list">${discover||'<span>Du hast schon viele Kategorien gespielt</span>'}</div></div>`;
  $('#friendActivity').innerHTML=(data.friendActivity||[]).map(item=>`<div class="activity-card"><strong>${esc(item.name)}</strong><p>${item.correct} richtige Antworten in den letzten 14 Tagen</p></div>`).join('')||'<p class="muted">Noch keine aktuellen Freundesaktivitäten.</p>';
  $('#reminderEnabled').checked=Boolean(data.streak.reminderEnabled);
  $('#reminderHour').value=String(data.streak.reminderHour??19);
  $('#preferredCategories').value=(data.streak.preferredCategories||[]).join(', ');
  document.querySelectorAll('[data-claim]').forEach(button=>button.onclick=async()=>{try{await api(`/api/platform/phase13/goals/${button.dataset.claim}/claim`,{method:'POST',body:'{}'});await load();}catch(error){$('#retentionMessage').textContent=error.message;}});
}
async function load(){try{render(await api('/api/platform/phase13/overview'));}catch(error){$('#retentionMessage').textContent=error.message;}}
for(let hour=0;hour<24;hour+=1){const option=document.createElement('option');option.value=String(hour);option.textContent=`${String(hour).padStart(2,'0')}:00 Uhr`;$('#reminderHour').appendChild(option);}
$('#saveRetentionSettings').addEventListener('click',async()=>{try{const data=await api('/api/platform/phase13/settings',{method:'PATCH',body:JSON.stringify({reminderEnabled:$('#reminderEnabled').checked,reminderHour:Number($('#reminderHour').value),preferredCategories:$('#preferredCategories').value.split(',').map(v=>v.trim()).filter(Boolean)})});render(data);$('#retentionMessage').textContent='Einstellungen gespeichert.';}catch(error){$('#retentionMessage').textContent=error.message;}});
load();
