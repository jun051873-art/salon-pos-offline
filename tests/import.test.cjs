const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),es=require('esbuild');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'salon-import-'));
const source=fs.readFileSync(__dirname+'/../app.jsx','utf8').replace(/    const root = ReactDOM.createRoot[\s\S]*$/,'');
es.buildSync({stdin:{contents:'import React from "react"; import {createBusinessStore,STORE_KEY} from "./business-store.js";\n'+source+'\nexport {salaryDraft,correctionDraft,settleCorrection,backupConflicts,validateBackup,performanceData,appearanceExport,appearanceImport,calculatePayroll,checkoutInventory};',loader:'jsx',resolveDir:path.resolve(__dirname,'..')},bundle:true,platform:'node',format:'cjs',outfile:scratch+'/validator.cjs',nodePaths:[process.env.SALON_NODE_MODULES||path.resolve(__dirname,'../node_modules')]});
const {salaryDraft,correctionDraft,settleCorrection,backupConflicts,validateBackup,performanceData,appearanceExport,appearanceImport,calculatePayroll,checkoutInventory}=require(scratch+'/validator.cjs');
const basic=()=>({services:[{id:'cut',name:'測試剪髮',price:600,category:'剪髮',isProduct:false}],stylists:[{id:'staff',name:'測試人員'}],customers:[],transactions:[{id:'order',date:'2026-10-15T04:00:00.000Z',items:[{id:'cut',name:'測試剪髮',category:'剪髮',price:600,stylistId:'staff'}],total:600}],settings:{},pendingOrders:[],inventoryLogs:[],expenses:[]});
test('legacy null, missing, and empty drafts restore as empty without changing caller',()=>{for(const draft of [null,undefined,{}]){const input={...basic(),draft},before=JSON.stringify(input);const result=validateBackup(input);assert.deepEqual(result.draft,{});assert.equal(result.transactions[0].total,600);assert.equal(JSON.stringify(input),before);}});
test('invalid nonempty draft and invalid amounts still rejected',()=>{for(const draft of ['',[],42,{cart:'wrong'},{cart:[{id:'cut',name:'測試',price:-1}]}])assert.throws(()=>validateBackup({...basic(),draft}));const invalid=basic();invalid.transactions[0].total=999;assert.throws(()=>validateBackup(invalid),/總額/);});
test('historical transactions without payroll are preserved and remain unconfirmed',()=>{const result=validateBackup({...basic(),draft:null});const report=performanceData(result.transactions);assert.equal(report.totals.gross,600);assert.equal(report.totals.known,0);assert.equal(report.totals.unknown,1);assert.equal(result.transactions[0].payroll,undefined);});
test('private backup integrity, persisted roundtrip and application pages',{skip:!process.env.SALON_BACKUP_FIXTURE},async()=>{
 // Fixture stays outside the repository. Never embed customer or accounting data here.
 const bytes=fs.readFileSync(process.env.SALON_BACKUP_FIXTURE),input=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),before=JSON.stringify(input),result=validateBackup(input);
 for(const key of ['services','stylists','customers','transactions','inventoryLogs','pendingOrders'])assert.deepEqual(result[key],input[key]);
 assert.equal(result.expenses.length,input.expenses.length);assert.equal(result.expenses.reduce((n,x)=>n+x.amount,0),input.expenses.reduce((n,x)=>n+Number(x.amount),0));for(let n=0;n<input.expenses.length;n++){const old=input.expenses[n],next=result.expenses[n];for(const [key,value]of Object.entries(old))if(!['date','amount'].includes(key))assert.deepEqual(next[key],value);}
 const report=performanceData(result.transactions);assert.equal(report.totals.gross+report.totals.productRevenue,input.transactions.reduce((n,t)=>n+Number(t.total),0));assert.equal(JSON.stringify(input),before);assert.deepEqual(fs.readFileSync(process.env.SALON_BACKUP_FIXTURE),bytes);
 const {JSDOM,VirtualConsole}=require('jsdom');const html=fs.readFileSync(__dirname+'/../index.html','utf8'),errors=[];const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(!e.message.includes('CSS stylesheet')&&!e.message.includes('navigation'))errors.push(e.message);});
 const open=record=>new JSDOM(html,{url:'https://jun051873-art.github.io/salon-pos-offline/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(w){w.navigator.locks={request:async(n,o,fn)=>fn({name:n})};w.confirm=()=>true;w.alert=message=>errors.push(message);if(record)w.localStorage.setItem('salon_offline_database_v1',record);}});
 const wait=()=>new Promise(r=>setTimeout(r,50));let dom=open(),record;
 const click=async text=>{const b=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert(b,'button '+text);b.click();await wait();};
 try{await wait();await click('店家設定');await click('備份與維護');const inputEl=dom.window.document.querySelector('input[type=file]');Object.defineProperty(inputEl,'files',{value:[{text:async()=> '\uFEFF'+bytes.toString('utf8')}]});inputEl.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await wait();const form=dom.window.document.querySelector('.text-request'),confirmInput=form.querySelector('input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(confirmInput,'還原資料');confirmInput.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait();form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await wait();record=dom.window.localStorage.getItem('salon_offline_database_v1');assert(record);const restored=JSON.parse(record);assert.deepEqual(restored.data.salon_offline_transactions,result.transactions);assert.deepEqual(restored.data.salon_offline_customers,result.customers);assert.deepEqual(restored.data.salon_offline_draft,{});assert(restored.beforeRestore);assert.equal(errors.length,0,errors.join('\n'));}finally{dom.window.close();}
 dom=open(record);try{await wait();for(const name of ['顧客資料','查單管理','營運報表','薪資條','商品庫存','收銀開單']){await click(name);assert(!dom.window.document.body.textContent.includes('系統暫時無法開啟'));}const reopened=JSON.parse(dom.window.localStorage.getItem('salon_offline_database_v1'));assert.equal(reopened.data.salon_offline_transactions.length,input.transactions.length);assert.equal(errors.length,0,errors.join('\n'));}finally{dom.window.close();}
});

test('appearance whitelist removes private, cloud and payment fields even when nested in input',()=>{const input={shopName:'PRIVATE',customers:[{name:'PRIVATE'}],paymentMethods:['PRIVATE'],cloudKey:'PRIVATE',appearance:{accent:'#123456',fontSize:18,customers:['PRIVATE'],firebaseConfig:{apiKey:'PRIVATE'},walletLedger:['PRIVATE']}};const style=appearanceExport(input);assert(!JSON.stringify(style).includes('PRIVATE'));assert.equal(style.appearance.accent,'#123456');const imported=appearanceImport({...style,transactions:['PRIVATE'],appearance:{...style.appearance,password:'PRIVATE',opacity:1000,columns:999}});assert(!JSON.stringify(imported).includes('PRIVATE'));assert.equal(imported.opacity,100);assert.equal(imported.columns,3);assert.throws(()=>appearanceImport({settings:input}));assert.deepEqual(appearanceImport(style),style.appearance);});
test('service accounting remains 2000 minus 400 minus 100 with 750 commission',()=>{const r=calculatePayroll({id:'synthetic-dye',name:'測試染髮',price:2000,discount:0,stylistId:'synthetic-staff'},{materialMode:'percent',materialValue:20,commissionRate:50},[{id:'synthetic-helper',mode:'fixed',base:'gross',value:100}]);assert.equal(r.gross,2000);assert.equal(r.material,400);assert.equal(r.actual,1500);assert.equal(r.commission,750);});

 test('checkout stock revalidation rejects shortages and changed catalogue without mutation',()=>{
 const services=[{id:'p',name:'測試商品',isProduct:true,stock:1}],items=[{id:'p',name:'測試商品',isProduct:true}];
 const before=JSON.stringify(services);assert.equal(checkoutInventory(items,services)[0].stock,0);assert.equal(JSON.stringify(services),before);
 assert.throws(()=>checkoutInventory([...items,...items],services),/庫存不足/);
 for(const extra of [{archivedAt:'2026-11-04'},{productUse:'internal'},{isProduct:false},{stock:'bad'},{stock:0.5}])assert.throws(()=>checkoutInventory(items,[{...services[0],...extra}]));
 assert.throws(()=>checkoutInventory(items,[]),/停用或刪除/);
 for(const stock of [null,undefined])assert.equal(checkoutInventory(items,[{...services[0],stock}])[0].stock,stock);
 });

test('future backup schema rejected; overwrite guard detects same-count changed or missing accounting',()=>{
 assert.throws(()=>validateBackup({...basic(),schemaVersion:6}),/版本/);
 const current=basic(),same=JSON.parse(JSON.stringify(current));assert.deepEqual(backupConflicts(current,same),[]);
 same.transactions[0].total=500;assert.equal(backupConflicts(current,same).length,1);
 same.transactions=[{...current.transactions[0],id:'replacement'}];assert.equal(backupConflicts(current,same).length,1);
 same.transactions=[...current.transactions,{...current.transactions[0],id:'new'}];assert.deepEqual(backupConflicts(current,same),[]);
 current.settings.salarySlips=[{id:'s',paidAt:'2026-11-01',net:190}];assert.equal(backupConflicts(current,same).length,1);
});

test('helper advance deducted once across months and released only by voiding unpaid salary',()=>{
 const item={id:'cut',name:'剪髮',price:600,stylistId:'designer',category:'剪髮'};item.payroll=calculatePayroll(item,{materialMode:'fixed',materialValue:120,commissionRate:50},[{id:'helper',mode:'fixed',base:'gross',value:100}]);
 const tx=[{id:'t',date:'2026-11-05T12:00:00Z',items:[item],total:600}],staff={id:'helper',name:'小安'},expenses=[{id:'advance',date:'2026-11-05',type:'員工借支',staffId:'helper',amount:30},{id:'future',date:'2026-12-01',type:'員工借支',staffId:'helper',amount:10}];
 const d=salaryDraft(staff,'2026-11',tx,expenses,{},[]);assert.equal(d.gross,100);assert.equal(d.advance,30);assert.equal(d.net,70);assert.deepEqual(d.advanceIds,['advance']);
 const settings={salarySlips:[{...d,id:'salary'}]};const next=salaryDraft(staff,'2026-12',[],expenses,settings,[]);assert.deepEqual(next.advanceIds,['future']);
 settings.salarySlips[0].voidedAt='2026-11-06';assert.equal(salaryDraft(staff,'2026-11',tx,expenses,settings,[]).net,70);
 const designer=salaryDraft({id:'designer',name:'Eason'},'2026-11',tx,expenses,{},[]);assert.equal(designer.net,190);
});
test('monthly and hourly salary use explicit mode and historical work rate; voided or outside hours excluded',()=>{
 const logs=[{id:'w',staffId:'s',date:'2026-11-01',basePay:800},{id:'void',staffId:'s',date:'2026-11-02',basePay:900,voidedAt:'x'},{id:'old',staffId:'s',date:'2026-10-01',basePay:700}];
 const calc=staff=>salaryDraft({id:'s',name:'staff',...staff},'2026-11',[],[],{workLogs:logs},[]);
 assert.equal(calc({salaryMode:'hourly',hourlyRate:999}).net,800);assert.equal(calc({salaryMode:'monthly',salaryBase:30000}).net,30000);assert.equal(calc({baseSalary:24000}).net,0);
});
test('paid salary corrections preserve original, total 220 and cannot settle twice or over-recover',()=>{
 global.crypto=require('node:crypto').webcrypto;
 let settings={salarySlips:[{id:'s',staffId:'st',staffName:'Eason',month:'2026-11',branchId:'main',net:190,paidAt:'2026-11-06'}]},expenses=[{id:'paid',amount:190}];
 for(const [amount,reason]of [[50,'補發'],[-20,'收回']]){const s=settings.salarySlips[0],c=correctionDraft(s,amount,reason);s.corrections=[...(s.corrections||[]),c];const result=settleCorrection(settings,expenses,'s',c.id);settings=result.settings;expenses=result.expenses;assert.throws(()=>settleCorrection(settings,expenses,'s',c.id),/狀態/);}
 assert.equal(settings.salarySlips[0].net,190);assert.equal(expenses.reduce((n,e)=>n+e.amount,0),220);assert.throws(()=>correctionDraft(settings.salarySlips[0],-221,'超額'),/超過/);
});
