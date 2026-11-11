const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const KEY='salon_offline_database_v1',wait=()=>new Promise(r=>setTimeout(r,60));
async function mount({pro=false,record=null,ready=true}={}){
 const calls=[],errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const state={native:true,pro,ready,canPurchase:ready&&!pro,price:'NT$990',message:pro?'專業版已解鎖':'免費版'};
 const dom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://appassets.androidplatform.net/assets/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
   w.__SALON_ANDROID__=true;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
   w.navigator.locks={request:async(n,o,f)=>f({name:n})};w.confirm=()=>true;w.alert=()=>{};w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};
   if(record)w.localStorage.setItem(KEY,record);
   w.SalonNative={postMessage(message){const r=JSON.parse(message);calls.push(r);let result={...state};let error=null;
     if(r.method==='purchase')error='已取消購買，未變更功能';
     if(r.method==='driveConnect')result={token:'native',expiresAt:Date.now()+3600000};
     if(r.method==='driveUpload')result={id:'test-backup',name:'encrypted.json'};
     if(r.method==='driveList')result={files:[]};
     setTimeout(()=>w.__salonNativeReply({id:r.id,result,error}),0);
   }};
 }});
 const w=dom.window,d=w.document;
 await wait();await wait();
 const button=name=>{const b=[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===name);assert(b,'Missing button '+name);return b;};
 return {w,d,calls,errors,state,button,click:async name=>{button(name).click();await wait();},record:()=>w.localStorage.getItem(KEY),fill:async(input,value)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait();},close:()=>w.close()};
}
test('Android free edition can check out and reopen while paid routes stay locked',async()=>{
 let e=await mount(),record;
 try{
   [...e.d.querySelectorAll('button')].find(b=>b.textContent.includes('精緻剪髮')).click();await wait();await e.click('結帳收款');await e.click('現金');
   assert.equal(JSON.parse(e.record()).data.salon_offline_transactions[0].total,600);record=e.record();
   await e.click('薪資條');assert(e.d.querySelector('.license-panel'));assert(!e.d.body.textContent.includes('確認本期薪資'));
   await e.click('商品庫存');assert(e.d.querySelector('.license-panel'));
   await e.click('店家設定');await e.click('備份與維護');assert(e.d.querySelector('input[aria-label="還原帳務資料"]'));
   await e.click('個人雲端');assert(e.d.querySelector('.license-panel'));assert(!e.d.body.textContent.includes('Google OAuth 用戶端 ID'));
   assert.deepEqual(e.errors,[]);
 }finally{e.close();}
 e=await mount({record});try{assert.equal(JSON.parse(e.record()).data.salon_offline_transactions.length,1);await e.click('營運報表');assert(e.d.body.textContent.includes('每日營收'));assert.deepEqual(e.errors,[]);}finally{e.close();}
});
test('cancelled purchase never grants pro and restore reflects native verified status',async()=>{
 const e=await mount();try{await e.click('店家設定');await e.click('版本與購買');await e.click('一次解鎖專業版');assert(e.d.querySelector('[role="alert"]').textContent.includes('已取消'));await e.click('商品庫存');assert(e.d.querySelector('.license-panel'));
 e.state.pro=true;e.state.canPurchase=false;e.state.message='專業版已解鎖';await e.click('恢復購買');assert(!e.d.querySelector('.license-panel'));assert.deepEqual(e.errors,[]);
 }finally{e.close();}
});
test('unconfigured store never offers a payable button',async()=>{const e=await mount({ready:false});try{await e.click('店家設定');await e.click('版本與購買');assert(e.button('一次解鎖專業版').disabled);assert(!e.calls.some(c=>c.method==='purchase'));}finally{e.close();}});
test('native Drive backup transmits encrypted data, no client ID setup or raw business data',async()=>{
 const e=await mount({pro:true});try{
   await e.click('店家設定');await e.click('個人雲端');assert(!e.d.textContent?.includes('Google OAuth 用戶端 ID'));assert(!e.d.querySelector('details summary')?.textContent.includes('Google Drive 初次連線設定'));
   const inputs=e.d.querySelectorAll('input[type=password]');assert.equal(inputs.length,2);for(const input of inputs)await e.fill(input,'test-password-123');
   await e.click('連接 Google Drive');for(let n=0;n<20&&!e.calls.some(c=>c.method==='driveUpload');n++)await wait();
   const upload=e.calls.find(c=>c.method==='driveUpload');assert(upload,JSON.stringify(e.calls.map(c=>c.method))+' '+[...e.d.querySelectorAll('[role="status"],[role="alert"]')].map(x=>x.textContent).join(' / ')+' '+e.errors.join(' / '));assert.equal(upload.params.encrypted.format,'salon-encrypted-backup');assert(!('customers' in upload.params.encrypted));assert(!('password' in upload.params));assert(!JSON.stringify(upload).includes('test-password-123'));
   assert.deepEqual(e.errors,[]);
 }finally{e.close();}
});
