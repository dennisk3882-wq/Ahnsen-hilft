'use strict';

function emptyProjectData(preservePreferences=true){
  const previousSettings=preservePreferences&&data?.settings?{...data.settings}:null;
  const fresh=defaultData();
  fresh.members=[{id:'m1',name:'Ich',role:'admin',active:true}];
  fresh.accounts=[];
  fresh.transactions=[];
  fresh.recurring=[];
  fresh.budgets=[];
  fresh.goals=[];
  fresh.reserves=[];
  fresh.contracts=[];
  fresh.insurances=[];
  fresh.debts=[];
  fresh.projects=[];
  fresh.monthClosures=[];
  fresh.documents=[];
  fresh.notifications=[];
  fresh.assistantLog=[{role:'bot',text:'Hallo! Dein Finanzplan ist noch leer. Sobald du Einnahmen und Ausgaben erfasst hast, kann ich deine lokalen Finanzdaten analysieren.'}];
  if(previousSettings) fresh.settings={...fresh.settings,...previousSettings};
  fresh.settings.onboardingComplete=true;
  return fresh;
}

function createPreResetSnapshot(){
  const snaps=safeJSON(localStorage.getItem(SNAP_KEY))||[];
  snaps.unshift({at:new Date().toISOString(),data:JSON.stringify(data),label:'Sicherung vor Neustart'});
  localStorage.setItem(SNAP_KEY,JSON.stringify(snaps.slice(0,10)));
}

async function clearProjectDocuments(){
  try{
    if(typeof dbPromise!=='undefined'&&dbPromise){const db=await dbPromise;db.close();dbPromise=null}
    if(!('indexedDB'in window))return;
    await new Promise(resolve=>{const req=indexedDB.deleteDatabase('finanzplan-files');req.onsuccess=()=>resolve();req.onerror=()=>resolve();req.onblocked=()=>resolve()});
  }catch(_){ }
}

function isOriginalDemoDataset(){
  const titles=new Set((data.transactions||[]).map(t=>t.title));
  return titles.has('REWE Supermarkt')&&titles.has('Tankstelle')&&titles.has('Netflix')&&(data.recurring||[]).some(r=>r.title==='Gehalt'&&num(r.amount)===2950)&&(data.accounts||[]).some(a=>a.name==='Tagesgeld');
}

function openNewProjectWizard(firstRun=false){
  const demo=isOriginalDemoDataset();
  const intro=firstRun
    ? 'Du startest jetzt mit einem leeren Finanzplan. Alle Angaben sind optional.'
    : demo
      ? 'Die aktuell sichtbaren Werte sind Beispieldaten. Du kannst sie jetzt vollständig entfernen und mit deinen eigenen Finanzen starten.'
      : 'Damit entfernst du die aktuell aktiven Konten, Buchungen, Budgets, Verträge, Ziele und Planungen auf diesem Gerät. Vorher wird automatisch ein lokaler Sicherungspunkt erstellt.';
  openModal(firstRun?'Finanzplan einrichten':'Neuen Haushalt starten',intro,`
    <form id="newProjectForm">
      ${demo?'<div class="insight"><div class="insight-icon">i</div><div><b>Beispieldaten erkannt</b><p>Gehalt, REWE, Netflix, Tankstelle und die angezeigten Kontostände stammen nur aus der Demo und gehören nicht zu deinen echten Finanzen.</p></div></div>':''}
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>Name des Haushalts / Projekts</label><input name="household" class="input" value="${escapeHTML(firstRun?'Mein Haushalt':data.household?.name||'Mein Haushalt')}" placeholder="z. B. Mein Haushalt"></div>
        <div class="field"><label>Erstes Konto (optional)</label><input name="accountName" class="input" placeholder="z. B. Girokonto"></div>
        <div class="field"><label>Aktueller Kontostand (optional)</label><input name="balance" type="number" step="0.01" class="input" placeholder="0,00"></div>
        <div class="field"><label>Monatliches Gehalt (optional)</label><input name="salary" type="number" step="0.01" min="0" class="input" placeholder="0,00"></div>
        <div class="field"><label>Üblicher Gehaltstag</label><input name="salaryDay" type="number" min="1" max="31" class="input" value="1"></div>
      </div>
      <div class="insight"><div class="insight-icon">✓</div><div><b>Auch komplett leer möglich</b><p>Lass Konto und Gehalt einfach leer. Die Standard-Kategorien bleiben vorhanden; Konten, Einnahmen, Fixkosten, Budgets und Ziele kannst du anschließend einzeln anlegen.</p></div></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-cancel>${firstRun?'Später':'Abbrechen'}</button><button class="primary-button">${firstRun?'Eigenen Finanzplan starten':demo?'Demo löschen & starten':'Daten zurücksetzen & starten'}</button></div>
    </form>`,()=>{
      const form=$('#newProjectForm');
      form.onsubmit=async e=>{
        e.preventDefault();
        if(!firstRun&&!demo&&!confirm('Wirklich einen neuen Haushalt starten? Die aktuellen Finanzdaten werden aus der aktiven Ansicht entfernt.')) return;
        if(!firstRun) createPreResetSnapshot();
        const fd=new FormData(form),fresh=emptyProjectData(true);
        fresh.household.name=formVal(fd,'household')||'Mein Haushalt';
        const accountName=formVal(fd,'accountName'),balance=num(formVal(fd,'balance')),salary=num(formVal(fd,'salary')),salaryDay=clamp(num(formVal(fd,'salaryDay'))||1,1,31);
        if(accountName||balance||salary){
          const acc={id:uid('acc'),name:accountName||'Girokonto',type:'checking',balance,baseBalance:balance,includeNetWorth:true};
          fresh.accounts.push(acc);
          if(salary>0){
            fresh.recurring.push({id:uid('rec'),title:'Gehalt',amount:salary,type:'income',categoryId:'c_income_salary',accountId:acc.id,memberId:'m1',frequency:'monthly',interval:1,day:salaryDay,start:localISO(new Date(now.getFullYear(),now.getMonth(),Math.min(salaryDay,daysInMonth(now)))),end:'',active:true,estimate:false});
          }
        }
        await clearProjectDocuments();
        data=fresh;
        localStorage.setItem(STORE_KEY,JSON.stringify(data));
        selectedMonth=monthStart(now);currentView='dashboard';
        generateRecurringForMonth(selectedMonth);
        closeModal();renderAll();
        toast('Dein neuer Finanzplan ist bereit','success');
      };
      $('[data-cancel]',form).onclick=closeModal;
    });
}

function injectProjectResetControls(){
  const moreRoot=$('#view-more'),grid=$('.more-grid',moreRoot);
  if(grid&&!$('#newProjectTile',moreRoot)){
    grid.insertAdjacentHTML('beforeend','<button id="newProjectTile" class="more-tile"><span>✦</span><b>Neuen Haushalt starten</b><small>Beispieldaten entfernen oder komplett neu beginnen</small></button>');
    $('#newProjectTile',moreRoot).onclick=()=>openNewProjectWizard(false);
  }
  const settingsRoot=$('#view-settings');
  if(settingsRoot&&!$('#newProjectSettingsCard',settingsRoot)){
    settingsRoot.insertAdjacentHTML('beforeend','<article id="newProjectSettingsCard" class="card" style="margin-top:16px"><div class="card-title-row"><div><h2>Daten & Neustart</h2><p>Für einen neuen Haushalt oder zum Entfernen der ursprünglichen Beispieldaten.</p></div></div><div class="setting-row"><div><b>Neuen Haushalt starten</b><small style="display:block;color:var(--muted)">Setzt Konten, Buchungen, Budgets, Verträge, Ziele und Planungen zurück. Standard-Kategorien bleiben erhalten.</small></div><button id="startNewProject" class="danger-button">Neu starten</button></div></article>');
    $('#startNewProject',settingsRoot).onclick=()=>openNewProjectWizard(false);
  }
}

function injectDemoBanner(){
  if(!isOriginalDemoDataset()||sessionStorage.getItem('finanzplan:hide-demo-banner')==='1')return;
  const root=$('#view-dashboard');
  if(!root||$('#demoDataBanner',root))return;
  root.insertAdjacentHTML('afterbegin','<article id="demoDataBanner" class="neo-banner" style="margin-bottom:16px"><h2>Du siehst noch Beispieldaten</h2><p>Die angezeigten Einnahmen, Ausgaben, Konten und Verträge sind nur Demo-Werte. Mit einem Klick startest du deinen eigenen leeren Haushaltsplan.</p><div class="action-row"><button id="startOwnProject" class="primary-button">Eigene Finanzen starten</button><button id="hideDemoBanner" class="secondary-button">Später</button></div></article>');
  $('#startOwnProject',root).onclick=()=>openNewProjectWizard(false);
  $('#hideDemoBanner',root).onclick=()=>{sessionStorage.setItem('finanzplan:hide-demo-banner','1');$('#demoDataBanner',root)?.remove()};
}

const _renderMoreForProjectReset=renderMore;
renderMore=function(){_renderMoreForProjectReset();injectProjectResetControls()};
const _renderSettingsForProjectReset=renderSettings;
renderSettings=function(){_renderSettingsForProjectReset();injectProjectResetControls()};
const _renderDashboardForProjectReset=renderDashboard;
renderDashboard=function(){_renderDashboardForProjectReset();injectDemoBanner()};

const isFirstRun=sessionStorage.getItem('finanzplan:first-run')==='1';
if(isFirstRun){
  sessionStorage.removeItem('finanzplan:first-run');
  data=emptyProjectData(false);
  localStorage.setItem(STORE_KEY,JSON.stringify(data));
  renderAll();
  setTimeout(()=>openNewProjectWizard(true),160);
}else{
  injectProjectResetControls();
  injectDemoBanner();
}
