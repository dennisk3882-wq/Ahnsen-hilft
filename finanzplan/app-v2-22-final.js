'use strict';

const v22FinalSaveBase=saveData;
saveData=function(reason='Änderung gespeichert'){data.version=V22_VERSION;data.schemaVersion=V2_SCHEMA;return v22FinalSaveBase(reason)};

if(typeof emptyProjectData==='function'){
  const v22FinalEmptyBase=emptyProjectData;
  emptyProjectData=function(preservePreferences=true){const fresh=v22FinalEmptyBase(preservePreferences);fresh.version=V22_VERSION;fresh.schemaVersion=V2_SCHEMA;return fresh};
}
data.version=V22_VERSION;data.schemaVersion=V2_SCHEMA;
