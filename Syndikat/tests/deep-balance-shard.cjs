const fs=require('fs');
const vm=require('vm');
const Module=require('module');

const difficulty=process.env.SYNDIKAT_DIFFICULTY||'normal';
const length=process.env.SYNDIKAT_LENGTH||'normal';
if(!['easy','normal','hard','boss'].includes(difficulty)||!['short','normal','long'].includes(length))throw new Error('invalid balance shard');

let src=fs.readFileSync('Syndikat/tests/regression.cjs','utf8');
src=src
  .replace("for(const difficulty of ['easy','normal','hard','boss']){","for(const difficulty of ['"+difficulty+"']){")
  .replace("for(const length of ['short','normal','long']){","for(const length of ['"+length+"']){")
  .replace("for(let seed=1;seed<=1;seed++){","for(let seed=1;seed<=20;seed++){")
  .replace("assert.strictEqual(totalRuns,12,'CI balance matrix must execute 12 finite full-table campaigns');","assert.strictEqual(totalRuns,20,'deep balance shard must execute 20 finite full-table campaigns');");
const sandbox={require:Module.createRequire(process.cwd()+'/Syndikat/tests/deep-balance-shard.cjs'),console,process,__dirname:process.cwd()+'/Syndikat/tests',__filename:process.cwd()+'/Syndikat/tests/deep-balance-shard.cjs',Buffer,setTimeout,clearTimeout,setInterval,clearInterval};
vm.runInNewContext(src,sandbox,{filename:'Syndikat/tests/deep-balance-generated.cjs'});
