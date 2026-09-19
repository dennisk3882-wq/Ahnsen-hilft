const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const marker='/* __SYNDIKAT_MODULES__ */';
const modules=[
  "src/modules/10-legacy-v3.js",
  "src/modules/20-organization-operations.js",
  "src/modules/30-meta-progression.js",
  "src/modules/40-ai-espionage-events.js",
  "src/modules/50-economy-property.js",
  "src/modules/55-visual-story.js",
  "src/modules/60-cloud-online.js",
  "src/modules/70-decisions.js",
  "src/modules/80-justice.js",
  "src/modules/90-final-gameplay.js",
  "src/modules/95-visual-story.js"
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
