'use strict';
try {
  const hasPlain=!!localStorage.getItem('finanzplan:data:v1');
  const hasVault=!!localStorage.getItem('finanzplan:vault:v2');
  if(!hasPlain&&!hasVault)sessionStorage.setItem('finanzplan:first-run','1');
} catch (_) {}
