(() => {
  const settings = ['large','contrast','simple','reduce'];
  const key = name => `ahnsen-a11y-${name}`;
  const apply = () => settings.forEach(name => document.documentElement.classList.toggle(`a11y-${name}`, localStorage.getItem(key(name)) === '1'));
  apply();
  const setup = () => {
    const trigger = document.getElementById('accessibility-toggle');
    const panel = document.getElementById('accessibility-panel');
    if (!trigger || !panel) return;
    const refresh = () => settings.forEach(name => { const button=panel.querySelector(`[data-a11y="${name}"]`); if(button) button.setAttribute('aria-pressed', localStorage.getItem(key(name)) === '1' ? 'true':'false'); });
    trigger.addEventListener('click', () => { const open=panel.hidden; panel.hidden=!open; trigger.setAttribute('aria-expanded',open?'true':'false'); if(open){refresh();panel.querySelector('button')?.focus();} });
    panel.addEventListener('click', event => { const button=event.target.closest('[data-a11y]'); if(!button)return; const name=button.dataset.a11y; localStorage.setItem(key(name),localStorage.getItem(key(name))==='1'?'0':'1'); apply(); refresh(); });
    document.addEventListener('keydown', event => { if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();} });
    document.querySelectorAll('[data-accessibility-profile] select').forEach(select => { const name=select.name.replace('a11y_',''); localStorage.setItem(key(name),select.value==='ja'?'1':'0'); });
  };
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',setup,{once:true}) : setup();
})();

