const fs=require('fs');
const src=fs.readFileSync('Syndikat/tests/regression.cjs','utf8')
  .replace("for(let seed=1;seed<=1;seed++){","for(let seed=1;seed<=20;seed++){")
  .replace("assert.strictEqual(totalRuns,12,'CI balance matrix must execute 12 finite full-table campaigns');","assert.strictEqual(totalRuns,240,'deep balance matrix must execute 240 finite full-table campaigns');")
  .replace("// Required CI soak: 12 full-table campaigns (7 rival AIs), one per difficulty/length combination.","// Deep balance soak: 240 full-table campaigns (7 rival AIs) across all difficulties and lengths.");
const vm=require('vm');
const Module=require('module');
const sandbox={require:Module.createRequire(process.cwd()+'/Syndikat/tests/deep-balance.cjs'),console,process,__dirname:process.cwd()+'/Syndikat/tests',__filename:process.cwd()+'/Syndikat/tests/deep-balance.cjs',Buffer,setTimeout,clearTimeout,setInterval,clearInterval};
vm.runInNewContext(src,sandbox,{filename:'Syndikat/tests/deep-balance-generated.cjs'});
