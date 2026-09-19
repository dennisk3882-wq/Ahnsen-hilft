const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const marker='/* __SYNDIKAT_MODULES__ */';
const modules=[
  "src/modules/10-compatibility-core.js",
  "src/modules/20-organization-operations.js",
  "src/modules/30-progression.js",
  "src/modules/40-ai-events.js",
  "src/modules/50-economy-property.js",
  "src/modules/55-story-campaign.js",
  "src/modules/58-world-systems.js",
  "src/modules/59-visuals.js",
  "src/modules/60-online-cloud.js",
  "src/modules/62-account-push.js",
  "src/modules/65-ui-art.js",
  "src/modules/70-decisions.js",
  "src/modules/80-justice.js",
  "src/modules/90-endgame.js",
  "src/modules/95-runtime-facade.js"
];

const basePath=path.join(root,'src','core-base.js');
const outPath=path.join(root,'js','core.js');
const base=fs.readFileSync(basePath,'utf8');
if(!base.includes(marker)) throw new Error('Build marker missing in core-base.js');

const joined=modules.map(rel=>fs.readFileSync(path.join(root,rel),'utf8').trim()).join('\n\n');
const output=base.replace(marker,()=>joined);

if(process.argv.includes('--check')){
  const current=fs.readFileSync(outPath,'utf8');
  if(current!==output){
    console.error('Syndikat/js/core.js is not synchronized with source modules. Run: node Syndikat/tools/build-core.cjs');
    process.exit(1);
  }
  console.log('Syndikat core bundle is synchronized.');
}else{
  fs.writeFileSync(outPath,output);
  console.log('Built '+outPath);
}
