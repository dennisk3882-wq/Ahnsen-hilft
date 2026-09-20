const {defineConfig}=require('playwright/test');
module.exports=defineConfig({testDir:__dirname,timeout:60000,workers:1,retries:0,reporter:[['line']],use:{trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[
 {name:'chromium',use:{browserName:'chromium'}},
 {name:'firefox',use:{browserName:'firefox'},testIgnore:[/online-.*\.spec/,/ui\.spec/]},
 {name:'webkit',use:{browserName:'webkit'},testIgnore:[/online-.*\.spec/]}
]});
