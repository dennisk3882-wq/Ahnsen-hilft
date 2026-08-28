'use strict';
function openModal(title,hint,html,onReady){$('#modalTitle').textContent=title;$('#modalHint').textContent=hint||'';$('#modalBody').innerHTML=html;$('#modalBackdrop').classList.remove('hidden');setTimeout(()=>$('#modal input:not([type=hidden]),#modal select')?.focus(),20);onReady?.()}
function closeModal(){$('#modalBackdrop').classList.add('hidden');$('#modalBody').innerHTML=''}
function formVal(fd,k){return fd.get(k)?.toString().trim()||''}
function deleteButton(kind,id,collection){return id?`<button type="button" class="danger-button" data-delete="${id}">Löschen</button>`:''}
function attachDelete(collection,id,label='Eintrag'){const b=$(`[data-delete="${id}"]`,$('#modalBody'));if(!b)return;b.onclick=()=>{if(confirm(`${label} wirklich löschen?`)){data[collection]=data[collection].filter(x=>x.id!==id);closeModal();saveData(`${label} gelöscht`)}}}