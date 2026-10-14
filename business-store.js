// All business tables share one atomic localStorage record. Only one tab may write.
export const STORE_KEY='salon_offline_database_v1';
export const LOCK_NAME='salon-pos-offline-writer-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
export function createBusinessStore({storage,locks,keys,validate,onFailure=()=>{},reclaim=()=>{},id=()=>Date.now()+'-'+Math.random()}){
 const listeners=new Set();let raw=storage.getItem(STORE_KEY),data={},beforeRestore=null,revision=null;
 let mode='starting',message='正在確認本機資料與開單視窗…',lastError='',started=false,release=null;
 const legacy=new Map(keys.map(key=>[key,storage.getItem(key)]));
 if(raw!==null){const parsed=JSON.parse(raw);if(parsed?.storageVersion!==1||!parsed.data||typeof parsed.data!=='object'||Array.isArray(parsed.data)||typeof parsed.revision!=='string')throw Error('本機資料格式錯誤，請先下載原始資料');
  for(const key of keys){if(!Object.hasOwn(parsed.data,key))throw Error('本機資料缺少 '+key);data[key]=validate(key,parsed.data[key]);}
  revision=parsed.revision;beforeRestore=parsed.beforeRestore||null;
 }
 const notify=()=>listeners.forEach(fn=>fn());
 const status=()=>mode==='writer'?lastError:message;
 const failure=(text,conflict=false)=>{lastError=text;if(conflict){mode='conflict';message=text;}notify();const e=Error(text);e.salonStorageFailure=true;onFailure(e);return e;};
 const fresh=()=>{
  if(storage.getItem(STORE_KEY)!==raw)throw failure('另一個視窗已更動資料。本視窗已停止寫入，請重新整理讀取最新資料。',true);
  // A pre-upgrade tab may still write individual tables. Never silently merge them.
  for(const [key,value]of legacy)if(storage.getItem(key)!==value)throw failure('舊版視窗已更動資料。請關閉舊版並下載原始資料，再重新開啟。',true);
 };
 const register=(key,defaultValue)=>{if(!keys.includes(key))throw Error('未知資料表');if(!Object.hasOwn(data,key)){const text=storage.getItem(key);legacy.set(key,text);data[key]=validate(key,text===null?clone(defaultValue):JSON.parse(text));}return data[key];};
 const assertWritable=()=>{if(mode!=='writer')throw failure(status()||'此視窗不能寫入');try{fresh();}catch(e){if(e.salonStorageFailure)throw e;throw failure('無法讀取本機儲存：'+e.message);}};
 const write=(changes,options={})=>{
  assertWritable();const next={...data};
  try{for(const [key,value]of Object.entries(changes)){if(!keys.includes(key))throw Error('未知資料表：'+key);next[key]=validate(key,clone(value));}}catch(e){throw failure('本次操作未儲存：'+e.message);}
  for(const key of keys)if(!Object.hasOwn(next,key))throw failure('資料尚未初始化完成');
  const nextBefore=options.beforeRestore===undefined?beforeRestore:clone(options.beforeRestore);
  if(!options.force&&JSON.stringify(next)===JSON.stringify(data)&&JSON.stringify(nextBefore)===JSON.stringify(beforeRestore)){lastError='';notify();return;}
  const nextRevision=String(id()),text=JSON.stringify({storageVersion:1,revision:nextRevision,data:next,beforeRestore:nextBefore});
  try{storage.setItem(STORE_KEY,text);}catch(e){
   if(e?.name==='QuotaExceededError'||e?.name==='NS_ERROR_DOM_QUOTA_REACHED'){reclaim();try{storage.setItem(STORE_KEY,text);}catch(retry){throw failure('本次操作未儲存。本機儲存空間不足，請下載備份；不要清除瀏覽器資料。');}}
   else throw failure('本次操作未儲存。'+(e?.name==='SecurityError'?'瀏覽器拒絕本機儲存，請使用一般視窗。':e.message));
  }
  // setItem is atomic: until it succeeds, both UI and prior record remain unchanged.
  raw=text;revision=nextRevision;data=next;beforeRestore=nextBefore;lastError='';
  // Reclaim migrated copies only after the new complete record has been committed.
  for(const key of keys){try{storage.removeItem(key);legacy.set(key,null);}catch(_){}}
  notify();
 };
 const start=()=>{
  if(started)return;started=true;
  if(!locks?.request){mode='unsupported';message='此瀏覽器無法保護多視窗寫入，已以唯讀開啟。請更新 Safari／Chrome 後重新開啟；仍可下載備份。';notify();return;}
  locks.request(LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
   if(mode==='paused')return;
   if(!lock){mode='readonly';message='另一個開單視窗正在使用。本視窗為唯讀；請關閉另一個視窗，再重新整理。';notify();return;}
   try{fresh();}catch(e){if(!e.salonStorageFailure){mode='readonly';message='無法讀取本機資料：'+e.message;notify();}return;}
   mode='writer';message='';lastError='';notify();
   await new Promise(resolve=>{release=resolve;});
  }).catch(e=>{mode='readonly';message='無法取得本機寫入權限：'+e.message+'。請重新開啟一般瀏覽器視窗。';notify();});
 };
 const pause=()=>{mode='paused';message='此視窗已暫停寫入，請重新整理後繼續。';notify();release?.();release=null;};
 return {register,get:key=>data[key],text:key=>JSON.stringify(data[key]),write,set:(key,updater)=>{const value=typeof updater==='function'?updater(clone(data[key])):updater;write({[key]:value});},start,pause,assertWritable,
  subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},statusSnapshot:status,isWritable:()=>mode==='writer',hasFailure:()=>!!status(),clearFailure:()=>{if(mode==='writer'){lastError='';notify();}},checkFresh:()=>{try{fresh();}catch(_){}},beforeRestore:()=>beforeRestore,revision:()=>revision};
}
