'use strict';
try{initializeV22Accounting();refreshLinkedSources();data.version=V22_VERSION;if(!window.__vaultLocked)renderAll();resetAutoLock()}catch(e){console.error('Finanzplan v2.2 bootstrap failed',e);toast?.(`Finanzplan-Startprüfung: ${e.message}`,'error')}
