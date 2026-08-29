'use strict';
(function(){
  let deferredInstall=null;
  const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true||document.referrer.startsWith('android-app://');
  const button=document.createElement('button');button.id='installPwaButton';button.className='icon-button pwa-install-button';button.type='button';button.title='Finanzplan installieren';button.setAttribute('aria-label','Finanzplan als App installieren');button.innerHTML='<span aria-hidden="true" style="font-size:22px;line-height:1">⇩</span>';
  const top=document.querySelector('.top-actions'),quick=document.getElementById('quickAddTop');if(top)top.insertBefore(button,quick||null);
  const update=()=>{button.style.display=isStandalone()?'none':'inline-flex'};update();
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;update()});
  window.addEventListener('appinstalled',()=>{deferredInstall=null;button.style.display='none';toast?.('Finanzplan wurde installiert','success')});
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',update);

  function instructions(){const ios=/iphone|ipad|ipod/i.test(navigator.userAgent),android=/android/i.test(navigator.userAgent);const text=ios?'In Safari auf „Teilen“ tippen und anschließend „Zum Home-Bildschirm“ wählen.':android?'Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.':'Im Browser-Menü „Finanzplan installieren“ bzw. „App installieren“ wählen.';openModal('Finanzplan installieren','Die installierte PWA läuft wie eine eigene App und blendet diesen Installationsbutton anschließend automatisch aus.',`<div class="insight"><div class="insight-icon">⇩</div><div><b>Als App installieren</b><p>${text}</p></div></div><div class="modal-actions"><button class="primary-button" data-cancel>Verstanden</button></div>`,()=>{$('[data-cancel]').onclick=closeModal})}
  button.addEventListener('click',async()=>{if(isStandalone())return;try{if(deferredInstall){await deferredInstall.prompt();const choice=await deferredInstall.userChoice;deferredInstall=null;if(choice?.outcome==='accepted')button.style.display='none';else update();return}instructions()}catch(_){instructions()}});
  globalThis.FinanzPWA={isStandalone,installButton:button,getInstallPrompt:()=>deferredInstall};
})();
