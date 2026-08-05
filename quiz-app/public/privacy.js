'use strict';

async function request(type) {
  const message = document.querySelector('#privacyMessage');
  try {
    const response = await fetch('/api/platform/privacy/requests', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type}) });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage konnte nicht gespeichert werden.');
    message.textContent = type === 'export' ? 'Deine Datenauskunft wurde angefordert.' : 'Deine Kontolöschung wurde angefordert. Sie wird vor Ausführung geprüft.';
  } catch (error) { message.textContent = error.message; }
}
document.querySelector('#exportData')?.addEventListener('click',()=>request('export'));
document.querySelector('#deleteData')?.addEventListener('click',()=>{ if (confirm('Kontolöschung wirklich anfordern?')) request('delete'); });
