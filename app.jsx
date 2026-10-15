function RecoveryPoints(){const {showToast}=React.useContext(AppContext);const [points,setPoints]=useState([]);const refresh=()=>{try{const rows=JSON.parse(localStorage.getItem('salon_offline_recovery_points')||'[]');setPoints(Array.isArray(rows)?rows:[]);}catch(e){showToast('復原點無法讀取，請下載原始資料','error');}};return <details className="recovery-points mb-5" onToggle={e=>{if(e.currentTarget.open)refresh();}}><summary>關鍵操作前復原點（最近 3 次）</summary><p className="report-footnote">結帳、薪資收付款及庫存異動等關鍵操作前保存。只存在本機，不能替代外部備份；下載後可由下方還原。一般資料編輯不會每次建立復原點。</p>{points.map(p=><div className="consumption-row" key={p.id}><span>{localDateTime(p.at).replace('T',' ')}</span><button className="btn btn-secondary" onClick={()=>downloadJSON(p.data,'salon_offline_recovery_'+p.at.replace(/[:.]/g,'-')+'.json')}>下載此復原點</button></div>)}{!points.length&&<p className="text-sm">尚無復原點。</p>}</details>;}
function correctionDraft(slip,amount,reason){const n=Number(amount);if(!slip?.paidAt||slip.voidedAt)throw Error('僅能更正已付且未作廢的薪資條');if(amount===''||!Number.isFinite(n)||n===0)throw Error('請輸入非零的補發或收回金額');if(!String(reason||'').trim())throw Error('請填寫更正原因');const changes=slip.corrections||[];if(changes.some(x=>!x.paidAt&&!x.voidedAt))throw Error('請先處理上一筆未完成的更正');const actual=money(slip.net+changes.filter(x=>x.paidAt&&!x.voidedAt).reduce((s,x)=>s+Number(x.amount),0));if(money(actual+n)<0)throw Error('收回金額超過已支付總額');return {id:generateId(),amount:money(n),reason:String(reason).trim(),createdAt:new Date().toISOString()};}
function settleCorrection(settings,expenses,slipId,correctionId){const slip=(settings.salarySlips||[]).find(s=>s.id===slipId);const correction=slip?.corrections?.find(c=>c.id===correctionId);if(!slip?.paidAt||slip.voidedAt||!correction||correction.paidAt||correction.voidedAt)throw Error('更正狀態已變更，請重新查看');const paidAt=new Date().toISOString(),expenseId=generateId();return {settings:{...settings,salarySlips:settings.salarySlips.map(s=>s.id===slipId?{...s,corrections:s.corrections.map(c=>c.id===correctionId?{...c,paidAt,expenseId}:c)}:s)},expenses:[...expenses,{id:expenseId,date:localDate(paidAt),branchId:slip.branchId,staffId:slip.staffId,type:correction.amount>0?'薪資補發':'薪資收回',amount:correction.amount,salarySlipId:slip.id,salaryCorrectionId:correction.id,note:slip.month+' '+slip.staffName+'｜'+correction.reason}]};}
function verifySalaryLinks(data){const slips=data.settings.salarySlips||[],expenseMap=new Map(data.expenses.map(e=>[e.id,e])),active=slips.filter(s=>!s.voidedAt),allocations=new Set();for(const s of active){for(const [type,ids]of [['advance',s.advanceIds],['charge',s.chargeIds]])for(const id of ids){const key=type+':'+id;if(allocations.has(key))throw Error('薪資抵扣來源重複');allocations.add(key);const r=type==='advance'?expenseMap.get(id):data.inventoryLogs.find(x=>x.id===id);if(!r)throw Error('薪資抵扣來源遺失');if((r.staffId||r.relatedStaffId)!==s.staffId)throw Error('薪資抵扣人員不一致');}
 if(s.paidAt&&s.net>0){const e=expenseMap.get(s.paymentExpenseId);if(!e||e.salarySlipId!==s.id||e.salaryCorrectionId||money(Number(e.amount))!==s.net)throw Error('已付薪資與付款紀錄不一致');}
 if(s.corrections!==undefined){if(!Array.isArray(s.corrections))throw Error('薪資更正格式錯誤');const ids=new Set();for(const c of s.corrections){if(!c.id||ids.has(c.id)||!Number.isFinite(c.amount)||!c.amount||!c.reason)throw Error('薪資更正資料錯誤');ids.add(c.id);if(c.paidAt&&!c.voidedAt){const e=expenseMap.get(c.expenseId);if(!e||e.salarySlipId!==s.id||e.salaryCorrectionId!==c.id||e.amount!==c.amount)throw Error('薪資更正與收付款紀錄不一致');}}}}
 for(const e of data.expenses.filter(e=>e.salarySlipId)){const s=slips.find(s=>s.id===e.salarySlipId);if(!s)throw Error('付款紀錄找不到薪資條');if(e.salaryCorrectionId){if(!s.corrections?.some(c=>c.id===e.salaryCorrectionId&&c.expenseId===e.id&&c.paidAt))throw Error('付款紀錄找不到已完成更正');}else if(s.paymentExpenseId!==e.id||!s.paidAt)throw Error('薪資付款重複或連結錯誤');}
}
function voidOrderData(orderId,reason,c){const order=c.safeTransactions.find(t=>t.id===orderId);if(!order)throw Error('找不到訂單，或已作廢');if(!reason?.trim())throw Error('請填寫作廢原因');if(salaryOrderLocked(c.safeSettings,order))throw Error('訂單月份薪資已確認，不能直接作廢');const at=new Date().toISOString(),products=(order.items||[]).filter(i=>i.isProduct),counts={};for(const i of products)counts[i.id]=(counts[i.id]||0)+1;const transactions=c.safeTransactions.filter(t=>t.id!==orderId);const uniqueVisit=order.visitId||order.id;const remains=transactions.some(t=>t.customerId===order.customerId&&(t.visitId||t.id)===uniqueVisit);const customers=c.safeCustomers.map(x=>x.id===order.customerId?{...x,visits:Math.max(0,Number(x.visits||0)-(remains?0:1)),totalSpend:money(Math.max(0,Number(x.totalSpend||0)-Number(order.total||0)))}:x);return {transactions,customers,services:c.safeServices.map(p=>counts[p.id]&&p.stock!==null&&p.stock!==undefined?{...p,stock:Number(p.stock||0)+counts[p.id]}:p),inventoryLogs:[...products.map(i=>({id:generateId(),date:at,branchId:order.branchId||'',type:'作廢回沖',itemId:i.id,itemName:i.name,qty:1,cost:Number(i.cost||0),note:'訂單 '+orderId+'｜'+reason,operator:'本機管理者'})),...c.safeInventoryLogs],settings:{...c.safeSettings,voidedOrders:[{...JSON.parse(JSON.stringify(order)),voidedAt:at,voidReason:reason.trim()},...(c.safeSettings.voidedOrders||[])]}};}
function localRecoveryPoint(){const store=getBusinessStore(),data={schemaVersion:5,exportedAt:new Date().toISOString()};for(const [k,key]of Object.entries(DATA_KEYS))data[k]=store.get(key);data.draft=store.get('salon_offline_draft');return JSON.parse(JSON.stringify(data));}
function isStorageQuota(e){return e?.name==='QuotaExceededError'||e?.name==='NS_ERROR_DOM_QUOTA_REACHED';}
function storageFailure(e){return e?.name==='SecurityError'?'瀏覽器拒絕本機儲存，請確認使用一般視窗並允許網站儲存。':isStorageQuota(e)?'本機儲存空間不足，請下載備份；不要清除瀏覽器資料。':('寫入錯誤：'+(e?.message||'未知原因'));}
function saveRecoveryPoint(){
 try{
  const raw=localStorage.getItem('salon_offline_recovery_points');let previous=[];
  if(raw){try{previous=JSON.parse(raw);}catch(_){return false;}if(!Array.isArray(previous))return false;}
  const point={id:generateId(),at:new Date().toISOString(),data:localRecoveryPoint()};
  let points=[point,...previous].slice(0,3);
  while(points.length){
   const text=JSON.stringify(points);
   if(text.length>500000){points.pop();continue;}
   try{localStorage.setItem('salon_offline_recovery_points',text);return true;}catch(e){if(!isStorageQuota(e))return false;points.pop();}
  }
  return false;
 }catch(_){return false;}
}
function writeBusinessTables(writes,options={}){getBusinessStore().write(Object.fromEntries(writes.map(([key,text])=>[key,JSON.parse(text)])),options);}

function periodBounds(mode,start,end=''){
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&localDate(s+'T12:00:00')===s;
 const monthEnd=s=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))return '';const [y,m]=s.split('-').map(Number);return s+'-'+new Date(y,m,0).getDate();};
 let from='',to='';if(mode==='day'){from=to=start;}else if(mode==='month'){from=start+'-01';to=monthEnd(start);}else if(mode==='year'&&/^\d{4}$/.test(start)){from=start+'-01-01';to=start+'-12-31';}else if(mode==='range'){from=start;to=end;}else if(mode==='months'){from=start+'-01';to=monthEnd(end);}return validDate(from)&&validDate(to)&&from<=to?{from,to}:null;
}
function inPeriod(date,bounds){const d=String(date||'').slice(0,10);return !!bounds&&d>=bounds.from&&d<=bounds.to;}
function commitTables(changes){getBusinessStore().assertWritable();const writes=Object.entries(changes).map(([k,v])=>[k==='draft'?'salon_offline_draft':DATA_KEYS[k],JSON.stringify(v)]);saveRecoveryPoint();writeBusinessTables(writes);}
const productUseLabel=v=>({sale:'對客販售',internal:'店用消耗',both:'販售／店用'}[v]||'對客販售');
const stockThreshold=p=>Number(p.safetyStock??5);
function ProductMetaFields({value,onChange,services}){const set=(k,v)=>onChange({...value,[k]:v});return <div className="meta-fields"><label>商品種類<input className="input-field" list="stock-kind-options" placeholder="例如：洗髮精、居家保養、造型品" value={value.productKind||''} onChange={e=>set('productKind',e.target.value)}/><datalist id="stock-kind-options">{[...new Set(['洗髮精','居家保養','造型品','染劑',...services.map(p=>p.productKind).filter(Boolean)])].map(x=><option key={x} value={x}/>)}</datalist></label><label>品牌<input className="input-field" value={value.brand||''} onChange={e=>set('brand',e.target.value)}/></label><label>用途<select className="input-field" value={value.productUse||'sale'} onChange={e=>set('productUse',e.target.value)}>{['sale','internal','both'].map(x=><option key={x} value={x}>{productUseLabel(x)}</option>)}</select></label><label>安全庫存<input className="input-field" type="number" min="0" step="1" value={value.safetyStock??5} onChange={e=>set('safetyStock',e.target.value)}/></label></div>;}
function StaffPayFields({value,onChange,settings,services}){const set=(k,v)=>onChange({...value,[k]:v});const [sampleId,setSampleId]=useState('');const sample=services.find(s=>s.id===sampleId)||services.find(s=>!s.isProduct&&!s.archivedAt);let calc=null,error='';try{if(sample){const item={...sample,price:Number(sample.price)||2000,discount:0};const policy=resolvePayrollPolicy(item,settings,value);calc={...calculatePayroll(item,policy,[]),policy};}}catch(e){error=e.message;}
 return <div className="space-y-5"><section className="pay-choice"><h3>服務抽成</h3><div className="report-segment"><button aria-pressed={value.useGlobalCommission!==false} onClick={()=>set('useGlobalCommission',true)}>跟隨店家</button><button aria-pressed={value.useGlobalCommission===false} onClick={()=>set('useGlobalCommission',false)}>個人設定</button></div>{value.useGlobalCommission===false?<label>個人服務抽成 %<input type="number" min="0" max="100" className="input-field" value={value.commissionRate||0} onChange={e=>set('commissionRate',e.target.value)}/></label>:<div className="rate-chips">{payrollRules(settings).commissionMode==='uniform'?<span>全店統一 {payrollRules(settings).commissionRate}%</span>:settings.categories.filter(c=>services.some(s=>!s.isProduct&&s.category===c)).map(c=><span key={c}>{c} {settings.commissionRates?.[c]??0}%</span>)}</div>}<small>有單項專屬比例的服務，優先使用該項比例。</small></section>
 <section className="pay-choice"><h3>販賣獎金</h3><div className="report-segment"><button aria-pressed={!personalProductEnabled(value)} onClick={()=>set('useGlobalProductCommission',true)}>跟隨店家</button><button aria-pressed={personalProductEnabled(value)} onClick={()=>onChange({...value,useGlobalProductCommission:false,productCommissionRate:personalProductRate(value)})}>個人設定</button></div>{personalProductEnabled(value)?<label>個人販賣獎金 %<input className="input-field" type="number" min="0" max="100" value={personalProductRate(value)} onChange={e=>set('productCommissionRate',e.target.value)}/></label>:<div className="rate-chips">{[...new Set(services.filter(s=>s.isProduct).map(s=>s.category))].map(c=><span key={c}>{c} {settings.productCommissionRates?.[c]??settings.commissionRates?.[c]??0}%</span>)}</div>}</section>
 <section className="pay-choice"><h3>固定薪資與工時</h3><label>計薪方式<select className="input-field" value={value.salaryMode||'commission'} onChange={e=>set('salaryMode',e.target.value)}><option value="commission">僅抽成與獎金</option><option value="monthly">月底薪＋抽成與獎金</option><option value="hourly">已登記工時×時薪＋抽成與獎金</option></select></label>{value.salaryMode==='monthly'&&<label>月底薪（全月，不自動按天折算）<input className="input-field" type="number" min="0" value={value.salaryBase??0} onChange={e=>set('salaryBase',e.target.value)}/></label>}{value.salaryMode==='hourly'&&<label>預設時薪<input className="input-field" type="number" min="0" value={value.hourlyRate||0} onChange={e=>set('hourlyRate',e.target.value)}/></label>}<small>加給、預支與其他扣項，在每月薪資條確認；舊版底薪不會自動啟用。</small></section>
 <details className="pay-choice" open><summary>看看這項服務怎麼算</summary>{sample&&<select className="input-field" value={sample.id} onChange={e=>setSampleId(e.target.value)}>{services.filter(s=>!s.isProduct&&!s.archivedAt).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}{calc?<p className="calc-preview">服務 {formatCurrency(calc.gross)} − 材料 {formatCurrency(calc.material)} ＝ 實際業績 {formatCurrency(calc.actual)}<br/>× {calc.policy.commissionRate}% ＝ <strong>{formatCurrency(calc.commission)}</strong><small>{calc.policy.rateSource} · 此例未指定協助人員；實際開單會再扣協助費。</small></p>:<p>{error||'先建立服務項目，即可預覽計算。'}</p>}</details></div>;
}
function salaryDraft(staff,month,transactions,expenses,settings,inventoryLogs,adjustments=[]){
 const bounds=periodBounds('month',month);if(!bounds)throw Error('請選擇有效月份');
 const tx=transactions.filter(t=>inPeriod(localDate(t.date),bounds));const report=performanceData(tx,staff.id);const active=(settings.salarySlips||[]).filter(s=>!s.voidedAt);
 const used=new Set(active.flatMap(s=>s.advanceIds||[])),usedLogs=new Set(active.flatMap(s=>s.chargeIds||[]));
 const advances=expenses.filter(e=>!e.voidedAt&&(e.isAdvance||e.type===(settings.advanceExpenseType||'員工借支'))&&(e.staffId||e.relatedStaffId)===staff.id&&e.date<=bounds.to&&!used.has(e.id));
 const charges=inventoryLogs.filter(l=>l.staffCharge&&l.staffId===staff.id&&localDate(l.date)<=bounds.to&&!usedLogs.has(l.id));
 const hours=(settings.workLogs||[]).filter(l=>l.staffId===staff.id&&!l.voidedAt&&inPeriod(l.date,bounds));
 const base=staff.salaryMode==='monthly'?Number(staff.salaryBase||0):staff.salaryMode==='hourly'?hours.reduce((n,l)=>n+Number(l.basePay||0),0):0;
 const rows=[{name:'基本薪資',amount:money(base)},{name:'服務抽成',amount:report.totals.commission},{name:'販賣獎金',amount:report.totals.productCommission},{name:'協助收入',amount:report.totals.helperIncome},...adjustments.map(a=>({name:a.name.trim(),amount:money(a.amount)}))];
 const gross=money(rows.reduce((n,r)=>n+r.amount,0)),advance=money(advances.reduce((n,r)=>n+Number(r.amount),0)),charge=money(charges.reduce((n,r)=>n+Number(r.consumedCost||0),0));
 const unknown=report.totals.unknown+report.totals.productUnknown+tx.reduce((n,t)=>n+(t.items||[]).filter(i=>i.stylistId!==staff.id&&!confirmedPayroll(i)&&(i.assistantId===staff.id||(i.helpers||[]).some(h=>h.id===staff.id))).length,0);
 return {staffId:staff.id,staffName:staff.name,month,branchId:staff.homeBranchId||settings.activeBranchId||'main',rows,gross,advance,charge,net:money(gross-advance-charge),advanceIds:advances.map(x=>x.id),chargeIds:charges.map(x=>x.id),advances:advances.map(x=>({id:x.id,date:x.date,amount:x.amount,note:x.note})),charges:charges.map(x=>({id:x.id,date:localDate(x.date),amount:x.consumedCost,note:x.itemName})),unknown,report,workIds:hours.map(x=>x.id),transactionIds:tx.filter(t=>(t.items||[]).some(i=>i.stylistId===staff.id||i.payroll?.helpers?.some(h=>h.id===staff.id))).map(t=>t.id)};
}
function SalaryPanel(){const c=React.useContext(AppContext);const {safeSettings,setSettings,safeStylists,safeTransactions,safeExpenses,setExpenses,safeInventoryLogs,showToast,confirmAction}=c;const [staffId,setStaffId]=useState(safeStylists[0]?.id||''),[month,setMonth]=useState(getCurrentDateLocal().slice(0,7)),[adjustments,setAdjustments]=useState([]),[reviewed,setReviewed]=useState(false);const [correctionAmount,setCorrectionAmount]=useState(''),[correctionReason,setCorrectionReason]=useState('');const busy=React.useRef(false);const staff=safeStylists.find(s=>s.id===staffId);const slips=safeSettings.salarySlips||[];const saved=slips.find(s=>s.staffId===staffId&&s.month===month&&!s.voidedAt);let draft=null,error='';try{if(staff)draft=salaryDraft(staff,month,safeTransactions,safeExpenses,safeSettings,safeInventoryLogs,adjustments);}catch(e){error=e.message;}const row=saved||draft;
 const save=()=>{if(busy.current)return;try{if(!row||saved||!reviewed)throw Error('請先核對薪資項目並勾選確認');if(row.unknown)throw Error('此人員仍有待核對服務／販賣／協助，不能結算');if(adjustments.some(a=>!a.name.trim()||(a.amount===''||!Number.isFinite(Number(a.amount)))))throw Error('每筆加扣項都需原因與有效金額');if(row.net<0)throw Error('扣項超過應領，請先核對預支與領料，不能結算');busy.current=true;const stored=JSON.parse(getBusinessStore().text('salon_offline_settings'));if((stored.salarySlips||[]).some(s=>!s.voidedAt&&s.staffId===row.staffId&&s.month===row.month))throw Error('這個月份已有薪資條，請重新開啟');const next={...safeSettings,salarySlips:[{...row,id:generateId(),createdAt:new Date().toISOString(),status:'confirmed'},...slips]};commitTables({settings:next});setSettings(next);setReviewed(false);showToast('薪資條已確認，金額與來源已保存');}catch(e){showToast(e.message,'error');}finally{busy.current=false;}};
 const pay=()=>{if(!saved||saved.paidAt)return;confirmAction('登記薪資已付','確認已實際支付，而且尚未手動登記這筆薪資支出？系統將新增本次支出。',()=>{if(busy.current)return;try{busy.current=true;const latest=JSON.parse(getBusinessStore().text('salon_offline_settings'));const live=(latest.salarySlips||[]).find(s=>s.id===saved.id);if(!live||live.paidAt||live.voidedAt)throw Error('薪資狀態已變更，請重新開啟查看');const id=generateId(),paidAt=new Date().toISOString();const next={...safeSettings,salarySlips:slips.map(s=>s.id===saved.id?{...s,paidAt,paymentExpenseId:s.net>0?id:null}:s)};const exp=saved.net>0?[...safeExpenses,{id,date:getCurrentDateLocal(),type:'薪資',amount:saved.net,staffId:saved.staffId,branchId:saved.branchId,salarySlipId:saved.id,note:saved.month+' 薪資｜'+saved.staffName}]:safeExpenses;commitTables({settings:next,expenses:exp});setSettings(next);setExpenses(exp);showToast('薪資已付，支出已連動');}catch(e){showToast(e.message,'error');}finally{busy.current=false;}});};
 const cancel=()=>{if(!saved||saved.paidAt)return;const reason=prompt('重新結算原因（保留本次紀錄）')?.trim();if(!reason)return;try{const next={...safeSettings,salarySlips:slips.map(s=>s.id===saved.id?{...s,voidedAt:new Date().toISOString(),voidReason:reason}:s)};commitTables({settings:next});setSettings(next);setReviewed(false);}catch(e){showToast(e.message,'error');}};
 const amend=()=>{try{if(!saved)return;const correction=correctionDraft(saved,correctionAmount,correctionReason);const next={...safeSettings,salarySlips:slips.map(s=>s.id===saved.id?{...s,corrections:[...(s.corrections||[]),correction]}:s)};commitTables({settings:next});setSettings(next);setCorrectionAmount('');setCorrectionReason('');showToast('更正已記錄，尚未列入收付款');}catch(e){showToast(e.message,'error');}};
 const completeAmend=id=>confirmAction('確認實際收付款','已實際補發或收到退回款項，且尚未另行登記？確認後會新增一次收付款紀錄。',()=>{try{const latest=JSON.parse(getBusinessStore().text('salon_offline_settings'));if(JSON.stringify(latest.salarySlips)!==JSON.stringify(slips))throw Error('薪資資料已變更，請重新開啟');const next=settleCorrection(safeSettings,safeExpenses,saved.id,id);commitTables(next);setSettings(next.settings);setExpenses(next.expenses);showToast('更正收付款已登記');}catch(e){showToast(e.message,'error');}});
 const voidAmend=id=>{const reason=prompt('取消本筆未付款更正的原因')?.trim();if(!reason)return;try{const next={...safeSettings,salarySlips:slips.map(s=>s.id===saved.id?{...s,corrections:(s.corrections||[]).map(x=>x.id===id&&!x.paidAt?{...x,voidedAt:new Date().toISOString(),voidReason:reason}:x)}:s)};commitTables({settings:next});setSettings(next);}catch(e){showToast(e.message,'error');}};
 return <section className="salary-panel"><div className="report-inline-controls"><label>人員<select className="input-field" value={staffId} onChange={e=>{setStaffId(e.target.value);setAdjustments([]);setReviewed(false);}}>{safeStylists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>薪資月份<input className="input-field" type="month" value={month} onChange={e=>{setMonth(e.target.value);setAdjustments([]);setReviewed(false);}}/></label></div><p className="report-footnote">每人每月一張，合併各分店服務。尚未提供個人登入權限；請由管理者核對與保管。</p>{error&&<p role="alert">{error}</p>}{row&&<><div className="salary-paper"><header><h3>{row.staffName} · {month} 薪資條</h3><span>{saved?(saved.paidAt?'已付':'已確認／未付'):'草稿／尚未結算'}</span></header>{row.unknown>0&&<p className="report-warning">有 {row.unknown} 項待核對，以下僅為已確認部分，不能作為完整應領金額。</p>}<div className="salary-ledger">{row.rows.map((r,i)=><div key={i}><span>{r.name}</span><strong>{formatCurrency(r.amount)}</strong></div>)}<div><span>預支抵扣</span><strong>−{formatCurrency(row.advance)}</strong></div><div><span>個人領料抵扣</span><strong>−{formatCurrency(row.charge)}</strong></div><div className="salary-net"><span>{row.unknown?'已核對部分小計':'本期應付'}</span><strong>{formatCurrency(row.net)}</strong></div></div><details><summary>查看計算來源與抵扣明細</summary><p>虛業績 {formatCurrency(row.report.totals.gross)} · 實際業績 {reportKnown(row.report.totals.actual,row.report.totals)}</p><p>{row.workIds.length} 筆工時 · {row.transactionIds.length} 筆相關訂單</p>{[...(row.advances||[]),...(row.charges||[])].map(x=><p key={x.id}>{x.date} · {x.note||'抵扣'} · {formatCurrency(x.amount)}</p>)}<div className="matrix-scroll"><table className="salon-matrix detail-table"><thead><tr><th>日期／服務</th><th>虛業績</th><th>實際業績</th><th>抽成</th></tr></thead><tbody>{row.report.details.map(d=><tr key={d.id}><th>{localDate(d.date)} · {d.item.name}</th><td>{formatCurrency(lineTotal(d.item))}</td><td>{d.p?formatCurrency(d.p.actual):'待核對'}</td><td>{d.p?formatCurrency(d.p.commission):'待核對'}</td></tr>)}</tbody></table></div><small>確認後保存當次金額與服務明細，不隨新設定重算。</small></details></div>{!saved&&<><div className="salary-adjust">{adjustments.map((a,i)=><div key={i}><input className="input-field" placeholder="加扣原因，例如：職務加給" value={a.name} onChange={e=>{setAdjustments(adjustments.map((x,j)=>j===i?{...x,name:e.target.value}:x));setReviewed(false);}}/><input className="input-field" type="number" placeholder="加給正數、扣項負數" value={a.amount} onChange={e=>{setAdjustments(adjustments.map((x,j)=>j===i?{...x,amount:e.target.value}:x));setReviewed(false);}}/><button className="btn btn-secondary" onClick={()=>{setAdjustments(adjustments.filter((_,j)=>j!==i));setReviewed(false);}}>移除</button></div>)}<button className="btn btn-secondary" onClick={()=>{setAdjustments([...adjustments,{name:'',amount:''}]);setReviewed(false);}}>＋ 本月加給／扣項</button></div><label className="review-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>已核對服務、工時、預支與加扣項；金額完整</label></>}<div className="salary-actions">{!saved?<button className="btn btn-primary" disabled={!reviewed||!!row.unknown} onClick={save}>確認薪資條</button>:!saved.paidAt?<><button className="btn btn-primary" onClick={pay}>登記已付</button><button className="btn btn-secondary" onClick={cancel}>作廢並重新計算</button></>:<span>付款日期：{localDate(saved.paidAt)}</span>}<button className="btn btn-secondary" onClick={()=>downloadSalaryHTML(row,safeSettings.shopName)}>下載可列印薪資條</button><button className="btn btn-secondary" onClick={()=>downloadJSON(row,'薪資條_'+month+'_'+staffId+'.json')}>下載薪資紀錄</button></div></>}{saved?.paidAt&&<details className="salary-corrections"><summary>已付薪資更正／補發／收回</summary><p className="report-footnote">原薪資條保留。補發填正數，收回填負數；只有實際收付款才影響支出。此入口不修改原服務明細。</p><div className="meta-fields"><label>更正金額<input className="input-field" type="number" value={correctionAmount} onChange={e=>setCorrectionAmount(e.target.value)}/></label><label>更正原因<input className="input-field" value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)}/></label></div><button className="btn btn-secondary mt-3" onClick={amend}>登記更正</button>{(saved.corrections||[]).map(x=><div className="consumption-row" key={x.id}><div>{x.reason} · {formatCurrency(x.amount)}<small>{x.voidedAt?'已取消：'+x.voidReason:x.paidAt?'已完成收付款':'待收付款'}</small></div>{!x.voidedAt&&!x.paidAt&&<div><button className="btn btn-secondary" onClick={()=>completeAmend(x.id)}>{x.amount>0?'已補發':'已收回'}</button><button className="btn btn-secondary" onClick={()=>voidAmend(x.id)}>取消</button></div>}</div>)}<p className="mt-3">累計實付：{formatCurrency(saved.net+(saved.corrections||[]).filter(x=>x.paidAt&&!x.voidedAt).reduce((n,x)=>n+x.amount,0))}</p></details>}<details className="mt-4"><summary>已作廢薪資條紀錄</summary>{slips.filter(s=>s.staffId===staffId&&s.month===month&&s.voidedAt).map(s=><p key={s.id}>{s.createdAt.slice(0,10)} · {formatCurrency(s.net)} · {s.voidReason}</p>)}</details></section>;
}

function normalizeCustomer(c){return {...c,name:String(c.name??c.Name??'').trim(),phone:String(c.phone??c.Phone??'').trim(),gender:c.gender??c.Gender??'',notes:c.notes??c.Notes??'',tags:Array.isArray(c.tags)?c.tags:[],visits:Number(c.visits??c.Visits)||0,totalSpend:Number(c.totalSpend??c.TotalSpend)||0};}
const phoneDigits=value=>String(value||'').normalize('NFKC').replace(/\D/g,'').replace(/^886(?=9)/,'0');
function memberMatches(customer,query){const c=normalizeCustomer(customer),q=String(query||'').normalize('NFKC').trim().toLowerCase();if(!q)return true;return c.name.normalize('NFKC').toLowerCase().includes(q)||(/^[+\d\s()\-]+$/.test(q)&&!!phoneDigits(q)&&phoneDigits(c.phone).includes(phoneDigits(q)));}
function checkedCustomer(form,customers){const c=normalizeCustomer(form);if(!c.name)throw Error('請輸入會員姓名');const digits=phoneDigits(c.phone);if(c.phone&&digits.length<6)throw Error('電話至少需 6 碼，或留空');if(digits&&customers.some(x=>x.id!==c.id&&phoneDigits(normalizeCustomer(x).phone)===digits))throw Error('這個電話已有會員，請搜尋並選取原會員，避免重複建檔');return c;}
function MemberOrderPanel(){const {draft,setDraft,safeCustomers,setCustomers,safeStylists,safeSettings,showToast}=React.useContext(AppContext);const [query,setQuery]=useState(''),[creating,setCreating]=useState(false);const linked=draft.selectedCustomer?safeCustomers.find(c=>c.id===draft.selectedCustomer.id&&!c.archivedAt):null;const results=query.trim()?safeCustomers.filter(c=>!c.archivedAt&&memberMatches(c,query)):[];
 const choose=c=>{const next=normalizeCustomer(c);setDraft(p=>({...p,selectedCustomer:next,adHocCustomerName:'',adHocGender:next.gender||p.adHocGender,...(!p.cart?.length&&safeStylists.some(s=>s.id===next.preferredStylistId&&!s.archivedAt)?{selectedStylist:next.preferredStylistId}:{})}));setQuery('');setCreating(false);showToast('本單已掛上會員：'+next.name);};
 const create=data=>{try{const row=checkedCustomer({...data,id:generateId(),visits:0,totalSpend:0},safeCustomers);commitTables({customers:[row,...safeCustomers],draft:{...getBusinessStore().get('salon_offline_draft'),selectedCustomer:row,adHocCustomerName:'',adHocGender:row.gender||getBusinessStore().get('salon_offline_draft').adHocGender}});setQuery('');setCreating(false);showToast('會員已建立並掛上本單，結帳後記錄消費');}catch(e){showToast(e.message,'error');}};
 return <section className="member-order-panel"><div className="member-panel-title"><strong>本單顧客</strong><span>{linked?'已連動會員':'散客也能直接開單'}</span></div>{linked?<div className="linked-member"><div><strong>{linked.name}</strong><span>{linked.phone||'未填電話'}</span><small>累積 {formatCurrency(linked.totalSpend)} · {linked.visits} 次</small><small>本次結帳會記入這位會員</small></div><button className="btn btn-secondary" onClick={()=>setDraft(p=>({...p,selectedCustomer:null,adHocCustomerName:''}))}>換人</button></div>:<><label className="block text-sm">搜尋會員姓名／電話<input aria-label="搜尋會員姓名或電話" className="input-field mt-2" type="search" autoComplete="off" value={query} placeholder="輸入姓名或電話，再點選會員" onChange={e=>setQuery(e.target.value)}/></label>{query.trim()&&<div className="member-results" aria-live="polite">{results.length?<>{results.slice(0,20).map(c=><button type="button" key={c.id} onClick={()=>choose(c)}><span><strong>{c.name}</strong><small>{c.phone||'未填電話'} · {c.visits} 次</small></span><b>帶入本單 →</b></button>)}{results.length>20&&<p>還有其他結果，請輸入更多字縮小範圍。</p>}</>:<p>找不到符合的會員，可繼續用散客開單，或建立會員。</p>}</div>}<details className="guest-options"><summary>散客資料{draft.adHocCustomerName?' · '+draft.adHocCustomerName:'（選填）'}</summary><div className="guest-fields"><label>散客稱呼（選填）<input aria-label="散客稱呼" className="input-field mt-1" value={draft.adHocCustomerName||''} placeholder="例如：小林" onChange={e=>setDraft(p=>({...p,adHocCustomerName:e.target.value}))}/></label><label>客群<select aria-label="本單客群" className="input-field mt-1" value={draft.adHocGender||safeSettings.customerTypes[0]} onChange={e=>setDraft(p=>({...p,adHocGender:e.target.value}))}>{safeSettings.customerTypes.map(t=><option key={t}>{t}</option>)}</select></label></div></details><button className="member-create" onClick={()=>setCreating(true)}>＋ 建立會員</button></>}{creating&&<Modal title="建立會員並帶入本單" onClose={()=>setCreating(false)}><QuickCustomerForm initialData={{name:draft.adHocCustomerName||(/\d/.test(query)?'':query.trim()),phone:/^[+\d\s()\-]+$/.test(query)?query.trim():'',gender:draft.adHocGender||safeSettings.customerTypes[0],preferredStylistId:draft.selectedStylist||''}} stylists={safeStylists.filter(s=>!s.archivedAt)} customerTypes={safeSettings.customerTypes} customerTags={safeSettings.customerTags} onSave={create} onCancel={()=>setCreating(false)}/></Modal>}</section>;
}

const LOOK_PRESETS={premium:{name:'森林米白',accent:'#284c3e',paper:'#f5f4ef',radius:14},bright:{name:'明亮簡約',accent:'#334155',paper:'#f7f9fc',radius:10},ocean:{name:'海岸藍',accent:'#235b83',paper:'#edf4f8',radius:14},rose:{name:'乾燥玫瑰',accent:'#894d63',paper:'#faf2f4',radius:20},earth:{name:'暖陶土',accent:'#925538',paper:'#f8f2e9',radius:10},violet:{name:'霧紫灰',accent:'#695381',paper:'#f5f2f8',radius:20}};
const validHex=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
function readableInk(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#17212b':'#ffffff';}
function appearanceOf(settings){const base=LOOK_PRESETS[settings.uiTheme]||LOOK_PRESETS.premium,custom=settings.appearance||{};return {accent:validHex(custom.accent)?custom.accent:base.accent,paper:validHex(custom.paper)?custom.paper:base.paper,radius:[4,10,14,20].includes(Number(custom.radius))?Number(custom.radius):base.radius};}
function appearanceStyle(settings){const a=appearanceOf(settings);return {'--salon-accent':a.accent,'--salon-paper':a.paper,'--salon-radius':a.radius+'px','--salon-on-accent':readableInk(a.accent),'--salon-on-paper':readableInk(a.paper),'--salon-highlight-ink':readableInk(a.accent)==='#17212b'?'#26332d':a.accent};}
function AppearanceSettings(){const {safeSettings,setSettings}=React.useContext(AppContext);const a=appearanceOf(safeSettings);const change=(k,v)=>setSettings(p=>({...p,appearance:{...appearanceOf(p),[k]:v}}));return <section className="card p-6 space-y-5"><div><h3 className="font-bold text-xl">店名與外觀</h3><p className="text-sm text-slate-500 mt-1">先挑一種風格，再調整主色、底色與圓角；選好立即套用。</p></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label>店名<input aria-label="店名" className="input-field mt-2" value={safeSettings.shopName} onChange={e=>setSettings({...safeSettings,shopName:e.target.value})}/></label><label>VIP 累積消費門檻<input aria-label="VIP 累積消費門檻" type="number" min="0" className="input-field mt-2" value={safeSettings.vipThreshold??10000} onChange={e=>setSettings({...safeSettings,vipThreshold:Math.max(0,Number(e.target.value)||0)})}/></label></div><div className="look-presets">{Object.entries(LOOK_PRESETS).map(([id,p])=><button key={id} className={'look-preset '+(safeSettings.uiTheme===id&&!safeSettings.appearance?'chosen':'')} onClick={()=>setSettings(prev=>({...prev,uiTheme:id,appearance:null}))}><span style={{background:p.paper,borderRadius:p.radius}}><i style={{background:p.accent}}/></span>{p.name}</button>)}</div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><label className="look-color">主色<input aria-label="自訂主色" type="color" value={a.accent} onChange={e=>change('accent',e.target.value)}/><small>按鈕、選取狀態、重點數字</small></label><label className="look-color">頁面底色<input aria-label="自訂底色" type="color" value={a.paper} onChange={e=>change('paper',e.target.value)}/><small>報表與工作區背景</small></label><label>卡片與按鈕形狀<select aria-label="圓角形狀" className="input-field mt-2" value={a.radius} onChange={e=>change('radius',Number(e.target.value))}><option value="4">俐落方角</option><option value="10">微圓角</option><option value="14">柔和圓角</option><option value="20">大圓角</option></select></label></div><p className="text-xs text-slate-500">服務／商品、付款、客群、職位與支出分類仍依各自配色辨識，不被主色蓋掉。</p></section>;}
const reportPct=(n,d)=>d>0?(n/d*100).toFixed(1)+'%':'—';
const reportKnown=(value,t)=>t.unknown?(t.known?'已核對 '+formatCurrency(value):'待核對'):formatCurrency(value);
function comparisonData(transactions,stylists,group='category'){const all=performanceData(transactions,'all',group),people=new Map(stylists.map(s=>[s.id,s.name]));for(const t of transactions)for(const i of t.items||[]){if(i.stylistId&&!people.has(i.stylistId))people.set(i.stylistId,i.stylistName||'歷史人員');for(const h of i.payroll?.helpers||[])if(!people.has(h.id))people.set(h.id,h.name||'歷史協助人員');}const rows=[...people].map(([id,name])=>({id,name,report:performanceData(transactions,id,group)}));return {all,rows,columns:all.rows.map(r=>({id:r.id,name:r.name,category:r.category}))};}
function reportColor(settings,column,services=[],group='category'){const item=group==='service'?services.find(s=>s.id===column.id):null;const key=item?.color||settings.categoryColors?.[column.category||column.name]||'slate';return COLOR_THEMES[key]?.fill||'#64748b';}
function ServiceNumber({row,visits,onClick,color}){return <button className="service-number" onClick={onClick} style={{'--service-color':color}} disabled={!row}><strong>{formatCurrency(row?.gross||0)}</strong><span>{row?.visits||0} 客次 <b>· {reportPct(row?.visits||0,visits)}</b></span><small>{row?.quantity||0} 項服務</small></button>;}
function SimplePerformance({transactions,stylists,settings,services=[]}){
 const [expanded,setExpanded]=useState(false);
 const [person,setPerson]=useState('all'),[group,setGroup]=useState('category'),[detail,setDetail]=useState(null);
 const data=useMemo(()=>comparisonData(transactions,stylists,group),[transactions,stylists,group]);
 const columns=expanded?data.columns:[];
 const people=person==='all'?data.rows:data.rows.filter(r=>r.id===person);
 const display=person==='all'?[{id:'all',name:'全店合計',report:data.all},...people]:people;
 const detailReport=detail?performanceData(transactions,detail.person,group):null;
 const detailItems=detailReport?.details.filter(d=>!detail.column||(group==='category'?(d.item.category||'未分類'):(d.item.id||d.item.name||'未命名'))===detail.column.id)||[];
 const summary=(r)=>{const t=r.report.totals;return <><td className="matrix-total"><button onClick={()=>setDetail({person:r.id,name:r.name})}><strong>{formatCurrency(t.gross)}</strong><span>{r.report.visitCount} 總客次 · {t.quantity} 項</span><small>{r.id==='all'?'服務收費，不含販賣':'店家服務貢獻 '+reportPct(t.gross,data.all.totals.gross)}</small></button></td><td><strong>{reportKnown(t.actual,t)}</strong><small>{t.unknown?'另有 '+t.unknown+' 項待核對':'扣材料、協助費後'}</small></td><td className="matrix-pay"><strong>{reportKnown(t.commission,t)}</strong><small>設計師服務抽成</small>{t.helperIncome>0&&<span>協助收入 +{formatCurrency(t.helperIncome)}</span>}{t.productCommission>0&&<span>販賣獎金 +{formatCurrency(t.productCommission)}</span>}{t.productUnknown>0&&<span>販賣獎金待核對</span>}</td></>;};
 return <section className="card report-block"><div className="report-section-head"><div><h2>人員業績</h2><p>點姓名看服務金額、客次與比例。</p></div><div className="report-inline-controls"><select aria-label="查看設計師" className="input-field" value={person} onChange={e=>{setPerson(e.target.value);setExpanded(e.target.value!=='all');}}><option value="all">全店與所有人員</option>{data.rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><button className="btn btn-secondary" onClick={()=>setExpanded(!expanded)}>{expanded?'收起服務明細':'展開服務比較'}</button>{expanded&&<div className="report-segment"><button aria-pressed={group==='category'} onClick={()=>setGroup('category')}>服務分類</button><button aria-pressed={group==='service'} onClick={()=>setGroup('service')}>服務細項</button></div>}</div></div>
 {data.all.totals.unknown>0&&<p className="report-warning">有 {data.all.totals.unknown} 項舊服務待核對；虛業績、客次完整列入。標示「已核對」的金額不是完整總額。</p>}
 <div className="matrix-desktop"><div className="matrix-scroll" tabIndex="0" aria-label="人員服務比較表，可左右捲動"><table className="salon-matrix"><thead><tr><th scope="col">人員</th><th scope="col">虛業績／總客次</th><th scope="col">實際業績</th><th scope="col">抽成與其他收入</th>{columns.map(c=><th scope="col" key={c.id} style={{borderTop:'4px solid '+reportColor(settings,c,services,group)}}>{c.name}</th>)}<th scope="col">販賣（另計）</th></tr></thead><tbody>{display.map(r=><tr key={r.id} className={r.id==='all'?'store-row':''}><th scope="row"><button className="person-link" onClick={()=>{setPerson(r.id);setExpanded(true);}}>{r.name}</button></th>{summary(r)}{columns.map(c=><td key={c.id}><ServiceNumber row={r.report.rows.find(x=>x.id===c.id)} visits={r.report.visitCount} color={reportColor(settings,c,services,group)} onClick={()=>setDetail({person:r.id,name:r.name,column:c})}/></td>)}<td><strong>{formatCurrency(r.report.totals.productRevenue)}</strong><small>{r.report.totals.productQuantity} 件商品</small></td></tr>)}</tbody></table></div><p className="report-scroll-note" hidden={!expanded}>服務較多時可左右捲動，左側人員名稱會固定。</p></div>
 <div className="matrix-mobile">{display.map(r=><article className={'person-report '+(r.id==='all'?'store-person':'')} key={r.id}><div className="person-report-head"><h3>{r.name}</h3><span>{r.id==='all'?'全店服務合計':'店家服務貢獻 '+reportPct(r.report.totals.gross,data.all.totals.gross)}</span></div><div className="person-three"><button onClick={()=>setDetail({person:r.id,name:r.name})}><span>虛業績</span><strong>{formatCurrency(r.report.totals.gross)}</strong><small>{r.report.visitCount} 總客次 · {r.report.totals.quantity} 項</small></button><div><span>實際業績</span><strong>{reportKnown(r.report.totals.actual,r.report.totals)}</strong></div><div><span>設計師抽成</span><strong>{reportKnown(r.report.totals.commission,r.report.totals)}</strong></div></div><div className="person-services">{columns.map(c=><div key={c.id} style={{borderLeft:'4px solid '+reportColor(settings,c,services,group)}}><h4>{c.name}</h4><ServiceNumber row={r.report.rows.find(x=>x.id===c.id)} visits={r.report.visitCount} color={reportColor(settings,c,services,group)} onClick={()=>setDetail({person:r.id,name:r.name,column:c})}/></div>)}</div>{(r.report.totals.helperIncome>0||r.report.totals.productQuantity>0)&&<p className="person-extra">協助收入 {formatCurrency(r.report.totals.helperIncome)} · 販賣 {formatCurrency(r.report.totals.productRevenue)}（{r.report.totals.productQuantity} 件）· 販賣獎金 {r.report.totals.productUnknown?'待核對／已確認 '+formatCurrency(r.report.totals.productCommission):formatCurrency(r.report.totals.productCommission)}</p>}</article>)}</div>
 {!data.columns.length&&<p className="report-empty">此期間尚無服務紀錄。完成開單後，服務金額、客次與比例會出現在這裡。</p>}
 <details className="report-explanation"><summary>客次與占比怎麼算？</summary><p className="report-footnote">客次占比＝做這項服務的客次 ÷ 該人員總服務客次。例如 10 客次有 3 客次染髮，染髮占比就是 30%。同次洗＋剪＋染只算 1 總客次，各服務比例可合計超過 100%。</p></details><details className="report-explanation"><summary>三種金額怎麼看？</summary><p>虛業績＝折扣後的服務收費，代表服務貢獻；實際業績＝虛業績扣材料及協助費；設計師抽成＝實際業績乘適用比例。販賣另外計算；抽成尚未包含底薪或借支扣款。全店客次去重，不能直接相加各人客次。</p></details>
 {detail&&<Modal title={detail.name+'｜'+(detail.column?.name||'服務明細')} size="max-w-4xl" onClose={()=>setDetail(null)}><div className="matrix-scroll"><table className="salon-matrix detail-table"><thead><tr>{['日期／顧客','服務','虛業績','材料','協助費','實際業績','抽成'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{detailItems.map(d=><tr key={d.id}><th>{localDate(d.date)}<small>{d.customerName} · #{d.orderId.slice(0,6)}</small></th><td>{d.item.name}<small>{d.item.stylistName}</small></td><td>{formatCurrency(lineTotal(d.item))}</td><td>{d.p?formatCurrency(d.p.material):'待核對'}</td><td>{d.p?formatCurrency(d.p.helperTotal):'待核對'}</td><td>{d.p?formatCurrency(d.p.actual):'待核對'}</td><td>{d.p?formatCurrency(d.p.commission):'待核對'}</td></tr>)}</tbody></table></div>{!detailItems.length&&<p className="report-empty">沒有服務明細</p>}</Modal>}
 </section>;
}
function expenseSummary(expenses){const map=new Map();for(const e of expenses){const key=e.type||'未分類';const r=map.get(key)||{name:key,amount:0,count:0};r.amount=money(r.amount+Number(e.amount||0));r.count++;map.set(key,r);}return [...map.values()].sort((a,b)=>b.amount-a.amount);}

// Branch identity stays on each receipt; legacy records deliberately remain unassigned.
const branchesOf=s=>Array.isArray(s.branches)&&s.branches.length?s.branches:[{id:'main',name:'本店'}];
const branchMatch=(r,id)=>id==='all'||(r.branchId||'unassigned')===id;
const branchName=(s,id)=>branchesOf(s).find(b=>b.id===id)?.name||(id?'歷史分店':'未分店紀錄');
function BranchSelect({settings,value,onChange,all=false}) {return <select aria-label={all?'篩選分店':'營業分店'} className="input-field" value={value} onChange={e=>onChange(e.target.value)}>{all&&<option value="all">全部分店</option>}{branchesOf(settings).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}{all&&<option value="unassigned">未分店紀錄</option>}</select>;}
function BranchSettings(){const {safeSettings,setSettings,showToast}=React.useContext(AppContext);const [name,setName]=useState('');const list=branchesOf(safeSettings);const save=(next)=>setSettings(p=>({...p,branches:next}));return <section className="card p-6 space-y-4"><h2 className="text-xl font-bold">分店管理</h2><p className="text-sm text-slate-500">同一份系統內分店記帳與報表。庫存仍共用，跨裝置不會自動同步。舊紀錄保留「未分店」。</p>{list.map(b=><div className="flex justify-between gap-3" key={b.id}><strong>{b.name}</strong><button className="btn btn-secondary" onClick={()=>{const n=prompt('分店新名稱',b.name)?.trim();if(!n)return;if(list.some(x=>x.id!==b.id&&x.name===n))return showToast('分店名稱已存在','error');save(list.map(x=>x.id===b.id?{...x,name:n}:x));}}>改名</button></div>)}<div className="flex gap-2"><input aria-label="新分店名稱" className="input-field" value={name} placeholder="例如：中山店" onChange={e=>setName(e.target.value)}/><button className="btn btn-primary" onClick={()=>{const n=name.trim();if(!n||list.some(b=>b.name===n))return showToast('請填寫不重複的分店名稱','error');save([...list,{id:generateId(),name:n}]);setName('');}}>新增分店</button></div></section>;}
function membershipStats(all,selected){const first=new Map();for(const t of all){if(!t.customerId||!(t.items||[]).some(i=>!i.isProduct))continue;const d=localDate(t.date);if(d&&(!first.has(t.customerId)||d<first.get(t.customerId)))first.set(t.customerId,d);}const visits=new Map();for(const t of selected){if(!(t.items||[]).some(i=>!i.isProduct))continue;const key=t.visitId||t.id;if(!visits.has(key))visits.set(key,t);}let fresh=0,returning=0,guest=0;for(const t of visits.values()){if(!t.customerId)guest++;else if(localDate(t.date)>first.get(t.customerId))returning++;else fresh++;}return {fresh,returning,guest,total:visits.size,rate:fresh+returning?returning/(fresh+returning)*100:null};}
function ManagerOverview({transactions,allTransactions,periodTransactions,settings}){const d=performanceData(transactions),m=membershipStats(allTransactions,transactions);return <div className="space-y-5"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[['虛業績',formatCurrency(d.totals.gross)],['實際業績',formatCurrency(d.totals.actual)],['設計師抽成',formatCurrency(d.totals.commission)],['服務客次',d.visitCount]].map(([k,v])=><div key={k} className="card p-5"><div className="text-sm text-slate-500">{k}</div><strong className="text-2xl">{v}</strong></div>)}</div>{d.totals.unknown>0&&<p className="p-3 bg-amber-50">{d.totals.unknown} 項舊服務待核對，實際業績與抽成只合計已確認項目。</p>}<section className="card p-6"><h3 className="font-bold text-lg mb-3">會員回訪觀察</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[['首次記錄日會員客次',m.fresh],['回訪會員客次',m.returning],['未識別會員客次',m.guest],['會員回訪占比',m.rate===null?'—':m.rate.toFixed(1)+'%']].map(([k,v])=><div key={k}><span className="text-sm text-slate-500">{k}</span><strong className="block text-2xl">{v}</strong></div>)}</div><p className="mt-3 text-xs text-slate-500">以全店現有服務單的會員編號辨識；早於本次服務日期已有紀錄才算回訪。回訪占比＝回訪會員客次÷已識別會員客次。首次記錄不代表真正首次來店。</p></section><section className="card p-6 overflow-x-auto"><h3 className="font-bold text-lg mb-3">各分店比較 · 同查詢期間</h3><table className="w-full text-sm text-left"><thead><tr>{['分店','服務客次','項目數','虛業績','實際業績','抽成','待核對'].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{[...branchesOf(settings),{id:'unassigned',name:'未分店紀錄'}].map(b=>{const r=performanceData(periodTransactions.filter(t=>branchMatch(t,b.id)));return <tr key={b.id} className="border-t"><td className="p-3">{b.name}</td><td>{r.visitCount}</td><td>{r.totals.quantity}</td><td>{formatCurrency(r.totals.gross)}</td><td>{formatCurrency(r.totals.actual)}</td><td>{formatCurrency(r.totals.commission)}</td><td>{r.totals.unknown}</td></tr>;})}</tbody></table></section></div>;}
function makeWorkLog(form,staff,existing,settings){if(!staff)throw Error('請選擇人員');const hours=Number(form.hours),rate=Number(form.hourlyRate);if(!/^\d{4}-\d{2}-\d{2}$/.test(form.date)||localDate(form.date+'T12:00:00')!==form.date)throw Error('日期無效');if(!Number.isFinite(hours)||hours<=0||hours>24)throw Error('工時須大於 0 且不超過 24');if(form.hourlyRate===''||!Number.isFinite(rate)||rate<0)throw Error('請輸入有效時薪');const branch=branchesOf(settings).find(b=>b.id===form.branchId);if(!branch)throw Error('請選擇分店');const day=existing.filter(r=>!r.voidedAt&&r.staffId===staff.id&&r.date===form.date);if(day.some(r=>r.branchId===form.branchId))throw Error('此人員當天在這家分店已有工時；請先作廢原紀錄再重填');if(day.reduce((s,r)=>s+Number(r.hours),0)+hours>24)throw Error('跨分店當日工時合計不得超過 24');return {id:generateId(),staffId:staff.id,staffName:staff.name,branchId:branch.id,branchName:branch.name,date:form.date,hours,hourlyRate:rate,basePay:money(hours*rate),note:form.note||'',createdAt:new Date().toISOString()};}
function WorkHours({period,branch,bounds}){const {safeSettings,setSettings,safeStylists,showToast,confirmAction,storageError}=React.useContext(AppContext);const logs=safeSettings.workLogs||[];const [form,setForm]=useState({date:getCurrentDateLocal(),staffId:'',branchId:safeSettings.activeBranchId||'main',hours:'',hourlyRate:'',note:''});const field=(k,v)=>setForm(p=>({...p,[k]:v}));const selected=logs.filter(r=>(bounds?inPeriod(r.date,bounds):r.date.startsWith(period))&&branchMatch(r,branch));const live=selected.filter(r=>!r.voidedAt);const save=()=>{try{if(!getBusinessStore().isWritable())throw Error(storageError||'此視窗不能寫入');if((safeSettings.salarySlips||[]).some(s=>!s.voidedAt&&s.staffId===form.staffId&&form.date.startsWith(s.month)))throw Error('此月份薪資已確認，不能補入工時');const row=makeWorkLog(form,safeStylists.find(s=>s.id===form.staffId),logs,safeSettings);const next={...safeSettings,workLogs:[row,...logs]};setSettings(next);field('hours','');showToast('工時已儲存，時薪已固定');}catch(e){showToast(e.message,'error');}};return <div className="space-y-5"><section className="card p-6"><h3 className="font-bold text-xl mb-3">工時與時薪</h3><p className="text-sm text-slate-500 mb-4">兼職、支援人員可手動登記。每人每店每日一筆，保存當次時薪。此處為工時基本金額，服務抽成另看「業績與抽成」，尚非完整薪資結算。</p><div className="grid grid-cols-2 md:grid-cols-3 gap-3"><label>日期<input type="date" className="input-field" value={form.date} onChange={e=>field('date',e.target.value)}/></label><label>人員<select className="input-field" value={form.staffId} onChange={e=>{const s=safeStylists.find(x=>x.id===e.target.value);setForm(p=>({...p,staffId:e.target.value,hourlyRate:s?.hourlyRate??'',branchId:s?.homeBranchId||p.branchId}));}}><option value="">選擇人員</option>{safeStylists.map(s=><option value={s.id} key={s.id}>{s.name}{s.employmentType==='partTime'?'（兼職）':''}</option>)}</select></label><label>工作分店<BranchSelect settings={safeSettings} value={form.branchId} onChange={v=>field('branchId',v)}/></label><label>工時<input type="number" min="0" max="24" step="0.25" className="input-field" value={form.hours} onChange={e=>field('hours',e.target.value)}/></label><label>當次時薪<input type="number" min="0" className="input-field" value={form.hourlyRate} onChange={e=>field('hourlyRate',e.target.value)}/></label><label>備註<input className="input-field" value={form.note} onChange={e=>field('note',e.target.value)}/></label></div><button className="btn btn-primary mt-4" onClick={save}>儲存工時</button></section><section className="card p-6 overflow-x-auto"><h3 className="font-bold mb-3">{period} · {money(live.reduce((s,r)=>s+r.hours,0))} 小時 · 基本金額 {formatCurrency(live.reduce((s,r)=>s+r.basePay,0))}</h3><table className="w-full text-left text-sm"><thead><tr>{['日期','人員','分店','工時','時薪','基本金額','備註／狀態'].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{selected.map(r=><tr key={r.id} className={'border-t '+(r.voidedAt?'text-slate-400':'')}><td className="p-3">{r.date}</td><td>{r.staffName}</td><td>{branchName(safeSettings,r.branchId)}</td><td>{r.hours}</td><td>{formatCurrency(r.hourlyRate)}</td><td>{formatCurrency(r.basePay)}</td><td>{r.note} {r.voidedAt?'已作廢：'+r.voidReason:<button className="btn btn-secondary" onClick={()=>{if((safeSettings.salarySlips||[]).some(s=>!s.voidedAt&&(s.workIds||[]).includes(r.id)))return showToast('此工時已結算薪資，不能直接作廢','error');const reason=prompt('作廢原因（保留原紀錄）')?.trim();if(!reason)return;confirmAction('作廢工時','確認作廢這筆工時？',()=>{try{const next={...safeSettings,workLogs:logs.map(x=>x.id===r.id?{...x,voidedAt:new Date().toISOString(),voidReason:reason}:x)};setSettings(next);}catch(e){showToast('儲存失敗，未作廢','error');}});}}>作廢</button>}</td></tr>)}</tbody></table>{!selected.length&&<p className="py-6 text-slate-400">此期間與分店尚無工時紀錄</p>}</section></div>;}

// v23 remuneration engine. Every checkout item stores the policy and resulting ledger.
const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const DEFAULT_PAYROLL_RULES = Object.freeze({materialMode:'itemCost',materialValue:0,helperMode:'fixed',helperValue:0,helperBase:'afterMaterial',commissionMode:'category',commissionRate:50});
function payrollRules(settings) {return {...DEFAULT_PAYROLL_RULES,...settings.payrollRules};}
function assertPayrollNumber(value,label,max=Number.MAX_SAFE_INTEGER) {const n=Number(value);if(value===''||!Number.isFinite(n)||n<0||n>max)throw Error(label+'須為 0 至 '+max+' 之間的有效數字');return n;}
const itemCommissionEnabled=r=>!!(r?.commissionEnabled??(r?.enabled&&r?.commissionOverride));
const personalProductEnabled=s=>s?.useGlobalProductCommission===undefined?s?.useGlobalCommission===false:s.useGlobalProductCommission===false;
const personalProductRate=s=>s?.productCommissionRate??s?.commissionRate??0;
function resolvePayrollPolicy(item,settings,stylist) {
 const global=payrollRules(settings), own=item.payrollRule?.enabled?item.payrollRule:{};
 const rules={...global,...own};
 let rate,rateSource;
 if(item.isProduct) {rate=personalProductEnabled(stylist)?personalProductRate(stylist):(settings.productCommissionRates?.[item.category]??settings.commissionRates?.[item.category]??0);rateSource=personalProductEnabled(stylist)?'人員販賣比例':'販賣分類比例';}
 else if(itemCommissionEnabled(item.payrollRule)) {rate=item.payrollRule.commissionRate;rateSource='單項設定';}
 else if(stylist && stylist.useGlobalCommission===false) {rate=stylist.commissionRate||0;rateSource='人員個別設定';}
 else if(global.commissionMode==='uniform') {rate=global.commissionRate;rateSource='全店統一';}
 else {rate=settings.commissionRates?.[item.category]??0;rateSource='服務分類設定';}
 const isProduct=!!item.isProduct;
 return {materialMode:isProduct?(settings.deductCostBeforeCommission===false?'fixed':'itemCost'):rules.materialMode,
 materialValue:isProduct?0:Number(rules.materialValue),itemCost:Number(item.cost)||0,helperMode:rules.helperMode,helperValue:Number(rules.helperValue),helperBase:rules.helperBase,
 commissionRate:Number(rate),rateSource,source:own.enabled?'單項設定':'全店預設',effectiveAt:own.updatedAt||settings.payrollRules?.updatedAt||null,kind:isProduct?'product':'service'};
}
function itemHelpers(item,policy) {
 if(item.isProduct)return [];
 if(Array.isArray(item.helpers))return item.helpers;
 return item.assistantId?[{id:item.assistantId,name:item.assistantName||'協助人員',mode:policy.helperMode,value:policy.helperValue,base:policy.helperBase}]:[];
}
function calculatePayroll(item,policy,helpers=[]) {
 if(!validLine(item))throw Error('售價或折扣無效');
 const gross=money(lineTotal(item));
 if(!['percent','fixed','itemCost'].includes(policy.materialMode))throw Error('材料計算方式無效');
 const materialValue=assertPayrollNumber(policy.materialMode==='itemCost'?policy.itemCost:policy.materialValue,'材料設定',policy.materialMode==='percent'?100:Number.MAX_SAFE_INTEGER);
 const material=money(policy.materialMode==='percent'?gross*materialValue/100:materialValue);
 if(material>gross)throw Error('材料扣除超過服務收費，請調整價格或材料設定');
 const afterMaterial=money(gross-material),ids=new Set();
 if(item.isProduct && helpers.length)throw Error('商品販賣不套用服務協助費');
 const paidHelpers=helpers.map(h=>{
  if(!h.id||h.id===item.stylistId||ids.has(h.id))throw Error('協助人員不可重複，也不可與主服務人員相同');ids.add(h.id);
  if(!['fixed','percent'].includes(h.mode)||!['gross','afterMaterial'].includes(h.base))throw Error('協助費計算方式無效');
  const value=assertPayrollNumber(h.value,'協助費',h.mode==='percent'?100:Number.MAX_SAFE_INTEGER);
  const basis=h.base==='gross'?gross:afterMaterial;
  return {...h,value,basis,amount:money(h.mode==='percent'?basis*value/100:value)};
 });
 const helperTotal=money(paidHelpers.reduce((n,h)=>n+h.amount,0));
 if(helperTotal>afterMaterial)throw Error('材料與協助費合計超過收費，無法結帳');
 const actual=money(afterMaterial-helperTotal);
 const rate=assertPayrollNumber(policy.commissionRate,'設計師抽成比例',100);
 const commission=money(actual*rate/100);
 return {version:1,kind:item.isProduct?'product':'service',stylistId:item.stylistId||'',stylistName:item.stylistName||'未指定',gross,material,helperTotal,actual,commission,shopShare:money(actual-commission),helpers:paidHelpers,policy:{...policy},calculatedAt:new Date().toISOString()};
}
function confirmedPayroll(item) {
 const p=item.payroll;
 if(!p||p.version!==1||p.stylistId!==(item.stylistId||''))return null;
 try {const check=calculatePayroll(item,p.policy,p.helpers||[]);for(const k of ['gross','material','helperTotal','actual','commission','shopShare'])if(!Number.isFinite(p[k])||Math.abs(check[k]-p[k])>0.009)return null;return p;}catch(e){return null;}
}
function preparePayrollItems(items,settings,stylists) {
 return items.map(item=>{
  const stylist=stylists.find(s=>s.id===item.stylistId);
  if(!stylist)throw Error('「'+item.name+'」請指定有效的服務人員');
  const policy=item.payrollPolicy||resolvePayrollPolicy(item,settings,stylist);
  const helpers=itemHelpers(item,policy);
  if(helpers.some(h=>!stylists.some(s=>s.id===h.id)))throw Error('「'+item.name+'」的協助人員已停用，請重新選擇');
  const payroll=calculatePayroll(item,policy,helpers);
  return {...item,price:Number(item.price),discount:Number(item.discount)||0,payrollPolicy:{...policy},helpers:helpers.map(h=>({...h})),payroll};
 });
}
function performanceData(transactions,person='all',groupBy='service') {
 const rows=new Map(),details=[],visits=new Set(),helperVisits=new Set(),helperPeople=new Map();
 const totals={gross:0,material:0,helperTotal:0,actual:0,commission:0,shopShare:0,quantity:0,known:0,unknown:0,confirmedGross:0,productRevenue:0,productCommission:0,productQuantity:0,productUnknown:0,helperIncome:0,helperQuantity:0};
 for(const order of transactions)for(const [index,item] of (order.items||[]).entries()) {
  const p=confirmedPayroll(item),visit=order.visitId||order.id;
  if(p)for(const helper of p.helpers){
   if(person!=='all'&&helper.id!==person)continue;
   totals.helperIncome+=helper.amount;totals.helperQuantity++;helperVisits.add(visit);
   const r=helperPeople.get(helper.id)||{id:helper.id,name:helper.name,amount:0,quantity:0,visits:new Set()};r.amount+=helper.amount;r.quantity++;r.visits.add(visit);helperPeople.set(helper.id,r);
  }
  if(person!=='all'&&item.stylistId!==person)continue;
  if(item.isProduct){totals.productRevenue+=lineTotal(item);totals.productQuantity++;if(p)totals.productCommission+=p.commission;else totals.productUnknown++;continue;}
  visits.add(visit);const gross=money(lineTotal(item));
  const key=groupBy==='category'?(item.category||'未分類'):(item.id||item.name||'未命名');
  const row=rows.get(key)||{id:key,name:groupBy==='category'?(item.category||'未分類'):(item.name||'未命名'),category:item.category||'未分類',quantity:0,visits:new Set(),gross:0,material:0,helperTotal:0,actual:0,commission:0,known:0,unknown:0};
  row.quantity++;row.visits.add(visit);row.gross+=gross;totals.quantity++;totals.gross+=gross;
  if(p){for(const k of ['material','helperTotal','actual','commission']){row[k]+=p[k];totals[k]+=p[k];}totals.shopShare+=p.shopShare;totals.confirmedGross+=gross;row.known++;totals.known++;}
  else{row.unknown++;totals.unknown++;}
  rows.set(key,row);details.push({id:order.id+':'+index,orderId:order.id,date:order.date,customerName:order.customerName||'散客',item,p});
 }
 for(const k of Object.keys(totals))totals[k]=money(totals[k]);
 return {totals,visitCount:visits.size,helperVisitCount:helperVisits.size,rows:[...rows.values()].map(r=>({...r,visits:r.visits.size,gross:money(r.gross),actual:money(r.actual),commission:money(r.commission),material:money(r.material),helperTotal:money(r.helperTotal)})).sort((a,b)=>b.gross-a.gross),helpers:[...helperPeople.values()].map(r=>({...r,amount:money(r.amount),visits:r.visits.size})),details};
}

function PayrollRuleFields({value,onChange,prefix='制度'}) {
 const set=(k,v)=>onChange({...value,[k]:v});
 return <div className="grid grid-cols-1 md:grid-cols-2 gap-4 payroll-fields">
  <label>材料扣除方式<select aria-label={prefix+'材料方式'} className="input-field mt-1" value={value.materialMode} onChange={e=>set('materialMode',e.target.value)}><option value="itemCost">沿用項目成本（金額）</option><option value="percent">按虛業績百分比</option><option value="fixed">每項固定金額</option></select></label>
  {value.materialMode!=='itemCost'?<label>{value.materialMode==='percent'?'材料成本率（%）':'每項材料金額（元）'}<input aria-label={prefix+'材料數值'} type="number" min="0" max={value.materialMode==='percent'?100:undefined} step="0.01" className="input-field mt-1" value={value.materialValue} onChange={e=>set('materialValue',e.target.value)}/></label>:<p className="text-sm text-slate-500 self-end">使用各項目「原成本金額」，不把 20 元當成 20%。舊數值請先核對。</p>}
  <label>協助費方式<select aria-label={prefix+'協助費方式'} className="input-field mt-1" value={value.helperMode} onChange={e=>set('helperMode',e.target.value)}><option value="fixed">每位協助者固定金額</option><option value="percent">每位協助者按百分比</option></select></label>
  <label>{value.helperMode==='percent'?'每位協助者比例（%）':'每位協助者金額（元）'}<input aria-label={prefix+'協助費數值'} type="number" min="0" max={value.helperMode==='percent'?100:undefined} step="0.01" className="input-field mt-1" value={value.helperValue} onChange={e=>set('helperValue',e.target.value)}/></label>
  {value.helperMode==='percent'&&<label className="md:col-span-2">協助費百分比基準<select aria-label={prefix+'協助費基準'} className="input-field mt-1" value={value.helperBase} onChange={e=>set('helperBase',e.target.value)}><option value="afterMaterial">扣材料後、扣協助費前（建議）</option><option value="gross">扣材料前的虛業績</option></select></label>}
 </div>;
}
function PayrollRulesSettings() {
 const {safeSettings,setSettings,showToast,safeServices=[]}=React.useContext(AppContext);
 const [form,setForm]=useState(()=>({...payrollRules(safeSettings),serviceRates:{...safeSettings.commissionRates},productRates:{...safeSettings.commissionRates,...safeSettings.productCommissionRates},productDeduct:safeSettings.deductCostBeforeCommission!==false}));
 const productCategories=safeSettings.categories.filter(cat=>safeServices.some(s=>s.isProduct&&s.category===cat)||cat==='產品');
 const serviceCategories=safeSettings.categories.filter(cat=>!productCategories.includes(cat)||safeServices.some(s=>!s.isProduct&&s.category===cat));
 const [dirty,setDirty]=useState(false);
 const update=v=>{setForm(v);setDirty(true);};
 const save=()=>{try{
  if(form.materialMode!=='itemCost')assertPayrollNumber(form.materialValue,'材料設定',form.materialMode==='percent'?100:Number.MAX_SAFE_INTEGER);
  assertPayrollNumber(form.helperValue,'協助費',form.helperMode==='percent'?100:Number.MAX_SAFE_INTEGER);
  if(form.commissionMode==='uniform')assertPayrollNumber(form.commissionRate,'統一抽成',100);
  const serviceRates={...safeSettings.commissionRates},productRates={...safeSettings.productCommissionRates};
  for(const cat of serviceCategories)serviceRates[cat]=assertPayrollNumber(form.serviceRates[cat]??safeSettings.commissionRates[cat]??0,cat+'服務抽成',100);
  for(const cat of productCategories)productRates[cat]=assertPayrollNumber(form.productRates[cat]??safeSettings.productCommissionRates?.[cat]??safeSettings.commissionRates[cat]??0,cat+'販賣獎金',100);
  const {serviceRates:_,productRates:__,productDeduct,...rule}=form;
  setSettings(prev=>({...prev,commissionRates:serviceRates,productCommissionRates:productRates,deductCostBeforeCommission:productDeduct,payrollRules:{...rule,materialValue:Number(rule.materialValue)||0,helperValue:Number(rule.helperValue),commissionRate:Number(rule.commissionRate)||0,updatedAt:new Date().toISOString()}}));setDirty(false);showToast('抽成制度已儲存；之後新加入的項目適用，既有開單與歷史單保留原制度');
 }catch(e){showToast(e.message,'error');}};
 return <section id="owner-commission" className="card p-6 space-y-5">
 <div><div className="eyebrow">PERFORMANCE & COMMISSION</div><h3 className="text-xl font-bold">業績與抽成制度</h3><p className="text-sm text-slate-500 mt-2">虛業績 − 材料 − 協助費 ＝ 實際業績；實際業績 × 設計師比例 ＝ 抽成。</p></div>
 <PayrollRuleFields value={form} onChange={update} prefix="全店"/>
 <label className="block">服務抽成預設<select className="input-field mt-1" value={form.commissionMode} onChange={e=>update({...form,commissionMode:e.target.value})}><option value="category">依服務分類比例</option><option value="uniform">所有服務統一比例</option></select></label>
 {form.commissionMode==='uniform'?<label className="block">統一服務比例（%）<input aria-label="全店統一抽成" type="number" min="0" max="100" className="input-field" value={form.commissionRate} onChange={e=>update({...form,commissionRate:e.target.value})}/><p className="text-xs text-slate-500 mt-2">分類比例已收起並保留，切回分類制度才會使用。</p></label>:<div className="grid grid-cols-2 md:grid-cols-3 gap-3">{serviceCategories.map(cat=><label key={cat}>{cat}（%）<input aria-label={cat+'分類抽成'} className="input-field" type="number" min="0" max="100" value={form.serviceRates[cat]??safeSettings.commissionRates[cat]??0} onChange={e=>update({...form,serviceRates:{...form.serviceRates,[cat]:e.target.value}})}/></label>)}</div>}
 <p className="p-3 bg-amber-50 text-sm">服務比例採用順序：單項專屬比例 → 人員個別比例 → 此處全店預設。前一層有設定時，後一層不再套用。材料與協助費可在項目中另設，與比例例外分開控制。</p>
 <section className="border-t pt-5 space-y-3"><h4 className="font-bold">商品販賣獎金（獨立制度）</h4><p className="text-sm text-slate-500">服務統一比例不影響販賣。人員可另設個人販賣比例；未另設時依商品分類。</p><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{productCategories.map(cat=><label key={cat}>{cat} 販賣（%）<input aria-label={cat+'販賣獎金'} type="number" min="0" max="100" className="input-field" value={form.productRates[cat]??safeSettings.productCommissionRates?.[cat]??safeSettings.commissionRates[cat]??0} onChange={e=>update({...form,productRates:{...form.productRates,[cat]:e.target.value}})}/></label>)}</div>{!productCategories.length&&<p className="text-sm">新增商品後會顯示對應分類。</p>}<label className="flex gap-3"><input type="checkbox" checked={form.productDeduct} onChange={e=>update({...form,productDeduct:e.target.checked})}/>販賣獎金先扣商品成本（金額）</label></section>
 <div className="flex items-center gap-3"><button className="btn btn-primary" onClick={save}>儲存全店制度</button><span className="text-sm text-slate-500">{dirty?'有尚未儲存的修改':'本區修改後請按儲存'}</span></div>
 <p className="text-xs text-slate-500">未指定協助人員不扣協助費。服務、商品比例與扣成本選項在此一起儲存。既有草稿、掛單與歷史單不因儲存而重算。</p>
 </section>;
}

function PayrollBreakdown({item,ledger}) {
 if(!ledger)return <p className="payroll-note">舊單缺少當時制度，實際業績與抽成待核對；已保留原始收費。</p>;
 return <div className="ledger-breakdown">
  <div><span>{item.isProduct?'販賣金額':'虛業績'}</span><strong>{formatCurrency(ledger.gross)}</strong></div>
  <div><span>{item.isProduct?'商品成本扣除':'材料扣除'}{ledger.policy.materialMode==='percent'?'（'+ledger.policy.materialValue+'%）':''}</span><strong>−{formatCurrency(ledger.material)}</strong></div>
  {ledger.helpers.map(h=><div key={h.id}><span>{h.name} 協助費<small>{h.mode==='fixed'?'固定金額':(h.base==='gross'?'扣材料前':'扣材料後')+' '+h.value+'%'}</small></span><strong>−{formatCurrency(h.amount)}</strong></div>)}
  <div className="ledger-emphasis"><span>{item.isProduct?'販賣獎金基數':'實際業績'}</span><strong>{formatCurrency(ledger.actual)}</strong></div>
  <div className="ledger-emphasis"><span>{item.isProduct?'販賣獎金':'設計師抽成'}<small>{ledger.policy.rateSource} · {ledger.policy.commissionRate}%</small></span><strong>{formatCurrency(ledger.commission)}</strong></div>
  <div><span>店家分得<small>未扣店務支出，並非淨利</small></span><strong>{formatCurrency(ledger.shopShare)}</strong></div>
 </div>;
}
function LinePayrollEditor({item:originalItem,settings,stylists,services=[],onSave,onClose}) {
 const [item,setItem]=useState(()=>({...originalItem}));
 const policy=item.payrollPolicy||resolvePayrollPolicy(item,settings,stylists.find(s=>s.id===item.stylistId));
 const [helpers,setHelpers]=useState(()=>itemHelpers(item,policy).map(h=>({...h})));
 const available=stylists.filter(s=>s.id!==item.stylistId&&!helpers.some(h=>h.id===s.id));
 let ledger,error;try{ledger=calculatePayroll(item,policy,helpers);}catch(e){error=e.message;}
 const change=(id,key,value)=>setHelpers(prev=>prev.map(h=>h.id===id?{...h,[key]:value}:h));
 return <Modal title={item.name+'｜業績明細與協助'} size="max-w-2xl" onClose={onClose}><div className="space-y-5">
  <p className="text-sm text-slate-500">主服務人員：{item.stylistName||'未指定'}。{policy.source}，{policy.rateSource} {policy.commissionRate}%。</p>
  <label className="block">{item.isProduct?'販賣人員':'本項主服務人員'}<select aria-label="本項服務人員" className="input-field mt-1" value={item.stylistId||''} onChange={e=>{const st=stylists.find(s=>s.id===e.target.value);if(!st)return;const p=resolvePayrollPolicy(services.find(s=>s.id===item.id)||item,settings,st);setItem({...item,stylistId:st.id,stylistName:st.name,payrollPolicy:p});setHelpers(helpers.filter(h=>h.id!==st.id));}}><option value="" disabled>請指定人員</option>{stylists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><p className="text-xs text-slate-500 mt-2">變更人員時，本項改用目前適用制度；其他項目不受影響。本人不列為協助者。</p></label>
  {!item.isProduct&&<section className="space-y-3"><div className="flex justify-between items-center"><h3 className="font-bold">協助人員</h3><button className="btn btn-secondary" disabled={!available.length} onClick={()=>{const s=available[0];setHelpers([...helpers,{id:s.id,name:s.name,mode:policy.helperMode,value:policy.helperValue,base:policy.helperBase}]);}}>新增協助人員</button></div>
  {helpers.length===0&&<p className="text-sm text-slate-500">沒有協助人員，不扣協助費。</p>}
  {helpers.map(h=><div key={h.id} className="helper-row"><div className="flex justify-between gap-2"><select aria-label="協助人員姓名" className="input-field" value={h.id} onChange={e=>{const s=stylists.find(x=>x.id===e.target.value);setHelpers(helpers.map(x=>x.id===h.id?{...x,id:s.id,name:s.name}:x));}}>{stylists.filter(s=>s.id===h.id||(s.id!==item.stylistId&&!helpers.some(x=>x.id===s.id))).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="btn btn-danger" onClick={()=>setHelpers(helpers.filter(x=>x.id!==h.id))}>移除</button></div><div className="grid grid-cols-2 gap-3 mt-3"><label>計費方式<select aria-label={h.name+'計費方式'} className="input-field mt-1" value={h.mode} onChange={e=>change(h.id,'mode',e.target.value)}><option value="fixed">固定金額（元）</option><option value="percent">百分比（%）</option></select></label><label>數值<input aria-label={h.name+'協助費數值'} className="input-field mt-1" type="number" min="0" max={h.mode==='percent'?100:undefined} value={h.value} onChange={e=>change(h.id,'value',e.target.value)}/></label></div>{h.mode==='percent'&&<select aria-label={h.name+'計算基準'} className="input-field mt-3" value={h.base} onChange={e=>change(h.id,'base',e.target.value)}><option value="afterMaterial">扣材料後、扣協助費前</option><option value="gross">扣材料前的虛業績</option></select>}</div>)}
  <p className="text-sm text-slate-500">多人協助的百分比以同一個基準獨立計算，不依序扣除。此處金額只調整本次服務。</p></section>}
  {error?<div role="alert" className="payroll-error">{error}</div>:<PayrollBreakdown item={item} ledger={ledger}/>}
  <button disabled={!!error} className="btn btn-primary w-full" onClick={()=>onSave({...item,helpers:helpers.map(h=>({...h,value:Number(h.value)})),payrollPolicy:{...policy},assistantId:helpers[0]?.id||'',assistantName:helpers[0]?.name||''})}>確認本項明細</button>
 </div></Modal>;
}
function PerformanceReport({transactions,stylists,period}) {
 const [person,setPerson]=useState('all'),[group,setGroup]=useState('service'),[detail,setDetail]=useState(null);
 const people=new Map(stylists.map(s=>[s.id,s.name]));
 for(const t of transactions)for(const item of t.items||[]){if(item.stylistId&&!people.has(item.stylistId))people.set(item.stylistId,(item.stylistName||'歷史人員')+'（已停用）');for(const h of item.payroll?.helpers||[])if(!people.has(h.id))people.set(h.id,(h.name||'歷史協助人員')+'（已停用）');}
 const report=useMemo(()=>performanceData(transactions,person,group),[transactions,person,group]);const t=report.totals;
 const pct=(n,d)=>d?(n/d*100).toFixed(1)+'%':'—';
 const knownMoney=(value,known,unknown)=>known?formatCurrency(value)+(unknown?' *':''):(unknown?'待核對':formatCurrency(0));
 const staffRows=person==='all'?[...people].map(([id,name])=>({id,name,...performanceData(transactions,id).totals,visits:performanceData(transactions,id).visitCount})).filter(r=>r.quantity||r.helperQuantity||r.productQuantity):[];
 return <div className="space-y-5 performance-report">
  <section className="performance-heading"><div><div className="eyebrow">SERVICE PERFORMANCE</div><h2>{person==='all'?'全店業績與抽成':(people.get(person)||'人員')+'｜個人業績'}</h2><p>{period} · 以服務發生日歸屬</p></div><label>報表範圍<select aria-label="業績報表範圍" className="input-field mt-1" value={person} onChange={e=>setPerson(e.target.value)}><option value="all">全店</option>{[...people].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></section>
  <div className="performance-metrics">
   <div><span>虛業績</span><strong>{formatCurrency(t.gross)}</strong><small>服務收費，不含販賣</small></div>
   <div><span>實際業績{t.unknown?'（已確認部分）':''}</span><strong>{knownMoney(t.actual,t.known,t.unknown)}</strong><small>扣材料及協助費後</small></div>
   <div><span>設計師抽成{t.unknown?'（已確認部分）':''}</span><strong>{knownMoney(t.commission,t.known,t.unknown)}</strong><small>實際業績 × 適用比例</small></div>
   <div><span>服務來店客次</span><strong>{report.visitCount}<em> 次</em></strong><small>{t.quantity} 項服務 · 重複來店分次計</small></div>
  </div>
  {t.unknown>0&&<div className="payroll-note">{t.unknown} 項舊服務缺少制度快照。虛業績與客次照常列入；實際業績、材料、協助費和抽成只加總 {t.known} 項已確認服務（虛業績 {formatCurrency(t.confirmedGross)}）。* 表示尚有未確認金額，不可當作完整結算。</div>}
  <section className="card p-5"><div className="report-strip"><div>材料扣除<strong>{knownMoney(t.material,t.known,t.unknown)}</strong></div><div>服務扣除的協助費<strong>{knownMoney(t.helperTotal,t.known,t.unknown)}</strong></div><div>個人／全店協助收入<strong>{formatCurrency(t.helperIncome)}</strong></div><div>販賣金額（另計）<strong>{formatCurrency(t.productRevenue)}</strong></div><div>販賣獎金（已確認）<strong>{t.productUnknown&&t.productQuantity===t.productUnknown?'待核對':formatCurrency(t.productCommission)}</strong></div></div><p className="text-sm text-slate-500 mt-3">抽成、協助收入與販賣獎金分開列示；這不是含底薪、津貼及借支扣款的實領薪資表。{t.productUnknown>0&&'另有 '+t.productUnknown+' 項販賣獎金待核對。'}</p></section>
  <section className="card overflow-hidden"><div className="p-5 flex flex-wrap gap-3 justify-between items-center"><h3 className="font-bold text-lg">服務結構</h3><div className="flex gap-2"><button className={'btn '+(group==='service'?'btn-primary':'btn-secondary')} onClick={()=>setGroup('service')}>各服務項目</button><button className={'btn '+(group==='category'?'btn-primary':'btn-secondary')} onClick={()=>setGroup('category')}>依分類</button></div></div>
   <div className="overflow-x-auto"><table className="performance-table"><thead><tr><th>服務</th><th>服務客次</th><th>項目數量</th><th>項數占比</th><th>客次占比</th><th>虛業績占比</th><th>虛業績</th><th>實際業績</th><th>抽成金額</th></tr></thead><tbody>{report.rows.map(r=><tr key={r.id}><td><strong>{r.name}</strong>{group==='service'&&<small>{r.category}</small>}</td><td>{r.visits}</td><td>{r.quantity}</td><td>{pct(r.quantity,t.quantity)}</td><td>{pct(r.visits,report.visitCount)}</td><td>{pct(r.gross,t.gross)}</td><td>{formatCurrency(r.gross)}</td><td>{knownMoney(r.actual,r.known,r.unknown)}</td><td>{knownMoney(r.commission,r.known,r.unknown)}</td></tr>)}{!report.rows.length&&<tr><td colSpan="9" className="text-center">此期間沒有本人主服務／全店服務紀錄。</td></tr>}</tbody><tfoot><tr><td>合計／不重複客次</td><td>{report.visitCount}</td><td>{t.quantity}</td><td>{t.quantity?'100%':'—'}</td><td>{report.visitCount?'100%':'—'}</td><td>{t.gross?'100%':'—'}</td><td>{formatCurrency(t.gross)}</td><td>{knownMoney(t.actual,t.known,t.unknown)}</td><td>{knownMoney(t.commission,t.known,t.unknown)}</td></tr></tfoot></table></div>
   <p className="p-5 text-sm text-slate-500">同次洗、剪、染＝1 次來店、3 項服務。項數占比＝該服務數量 ÷ 全部服務數量。每列客次占比＝使用該服務的客次 ÷ 本表不重複服務客次，多服務並用時各列比例合計可能超過 100%。目前舊單以一張訂單視為一次來店。</p>
  </section>
  {person==='all'&&<section className="card overflow-hidden"><h3 className="font-bold text-lg p-5">人員比較</h3><div className="overflow-x-auto"><table className="performance-table"><thead><tr><th>人員</th><th>服務客次</th><th>服務項數</th><th>虛業績</th><th>實際業績</th><th>設計師抽成</th><th>協助收入</th><th>販賣獎金</th></tr></thead><tbody>{staffRows.map(r=><tr key={r.id}><td><button className="font-bold underline underline-offset-4" onClick={()=>setPerson(r.id)}>{r.name}</button></td><td>{r.visits}</td><td>{r.quantity}</td><td>{formatCurrency(r.gross)}</td><td>{knownMoney(r.actual,r.known,r.unknown)}</td><td>{knownMoney(r.commission,r.known,r.unknown)}</td><td>{formatCurrency(r.helperIncome)}</td><td>{r.productUnknown&&r.productUnknown===r.productQuantity?'待核對':formatCurrency(r.productCommission)+(r.productUnknown?' *':'')}</td></tr>)}</tbody></table></div><p className="p-5 text-sm text-slate-500">同一位客人由多人分別完成不同服務時，全店客次會去重，不直接相加人員客次。本頁未依工時換算，不用總業績直接判定兼職表現。</p></section>}
  <details className="card p-5"><summary className="font-bold cursor-pointer">協助服務明細｜{t.helperQuantity} 項，{report.helperVisitCount} 客次</summary><div className="overflow-x-auto mt-4"><table className="performance-table"><thead><tr><th>協助人員</th><th>客次</th><th>協助項數</th><th>協助收入</th></tr></thead><tbody>{report.helpers.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.visits}</td><td>{r.quantity}</td><td>{formatCurrency(r.amount)}</td></tr>)}</tbody></table></div></details>
  <details className="card p-5"><summary className="font-bold cursor-pointer">展開逐項計算與來源單據（{report.details.length} 項）</summary><div className="overflow-x-auto mt-4"><table className="performance-table"><thead><tr><th>日期／訂單</th><th>顧客／服務</th><th>設計師</th><th>虛業績</th><th>材料</th><th>協助費</th><th>實際業績</th><th>抽成</th><th>計算明細</th></tr></thead><tbody>{report.details.map(d=><tr key={d.id}><td>{localDate(d.date)}<small>#{d.orderId.slice(0,8)}</small></td><td>{d.customerName}<small>{d.item.name}</small></td><td>{d.item.stylistName||people.get(d.item.stylistId)||'未指定'}</td><td>{formatCurrency(lineTotal(d.item))}</td><td>{d.p?formatCurrency(d.p.material):'待核對'}</td><td>{d.p?formatCurrency(d.p.helperTotal):'待核對'}</td><td>{d.p?formatCurrency(d.p.actual):'待核對'}</td><td>{d.p?formatCurrency(d.p.commission):'待核對'}</td><td><button className="btn btn-secondary" onClick={()=>setDetail(d)}>查看</button></td></tr>)}</tbody></table></div></details>
  {detail&&<Modal title={detail.item.name+'｜計算明細'} onClose={()=>setDetail(null)}><p className="text-sm text-slate-500 mb-4">#{detail.orderId} · {detail.customerName}</p><PayrollBreakdown item={detail.item} ledger={detail.p}/>{detail.p&&<p className="text-sm text-slate-500 mt-4">依本項保存的制度計算，非目前設定。{detail.p.policy.effectiveAt?'制度儲存時間：'+localDateTime(detail.p.policy.effectiveAt):''}</p>}</Modal>}
 </div>;
}

const SettingsView = () => {
const [settingsPage,setSettingsPage]=useState("appearance");
const {settings,setSettings,showToast,safeServices,safeStylists,safeCustomers,safeTransactions,safeSettings,safeInventoryLogs,safeExpenses,safePendingOrders,setServices,setStylists,setCustomers,setTransactions,setExpenses,setPendingOrders,setInventoryLogs,draft,confirmAction,getThemeClasses}=React.useContext(AppContext);

    const [isEditingItem, setIsEditingItem] = useState(false);
    const [itemForm, setItemForm] = useState({});
    const [itemSearch, setItemSearch] = useState('');

    const _exportBackup = () => {
        try {
            const backupData = { schemaVersion: 5, exportedAt: new Date().toISOString(), services: safeServices, stylists: safeStylists, customers: safeCustomers, transactions: safeTransactions, settings: safeSettings, inventoryLogs: safeInventoryLogs, expenses: safeExpenses, pendingOrders: safePendingOrders, draft };
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = `salon_offline_backup_${getCurrentDateLocal()}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); showToast('備份下載已啟動');
        } catch (error) { console.error(error); alert('備份失敗'); }
    };

    const _importBackup = async (event) => {
        const file=event.target.files[0]; event.target.value=''; if(!file)return;
        try { const parsed=validateBackup(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
            if (!confirm(`還原將取代目前資料：${parsed.transactions.length} 筆訂單、${parsed.customers.length} 位顧客。系統會先保存一份還原前快照。確定繼續？`)) return;
            const before={services:safeServices,stylists:safeStylists,customers:safeCustomers,transactions:safeTransactions,settings:safeSettings,inventoryLogs:safeInventoryLogs,expenses:safeExpenses,pendingOrders:safePendingOrders,draft};
            restoreSnapshot(parsed,parsed.draft||{},before); window.location.reload();
        }catch(e){ alert('未還原：'+e.message); }
    };

    const handleSaveItem = () => {
        if(itemCommissionEnabled(itemForm.payrollRule)&&!itemForm.isProduct){try{assertPayrollNumber(itemForm.payrollRule.commissionRate,'單項抽成',100);}catch(e){return showToast(e.message,'error');}}
        if(itemForm.payrollRule?.enabled && !itemForm.isProduct) {
          try {const r=itemForm.payrollRule;if(r.materialMode!=='itemCost')assertPayrollNumber(r.materialValue,'材料設定',r.materialMode==='percent'?100:Number.MAX_SAFE_INTEGER);assertPayrollNumber(r.helperValue,'協助費',r.helperMode==='percent'?100:Number.MAX_SAFE_INTEGER);}
          catch(e){return showToast(e.message,'error');}
        }
        if (!itemForm.name?.trim() || itemForm.price === '' || !Number.isFinite(Number(itemForm.price)) || Number(itemForm.price)<0 || !Number.isFinite(Number(itemForm.cost||0)) || Number(itemForm.cost||0)<0) { alert('請輸入名稱及有效的非負價格、成本'); return; }
        if(itemForm.isProduct && (!Number.isInteger(Number(itemForm.stock||0)) || Number(itemForm.stock||0)<0)) return alert('庫存須為非負整數');
        const previousItem=safeServices.find(x=>x.id===itemForm.id);
        if(previousItem&&!!previousItem.isProduct!==!!itemForm.isProduct&&[(draft.cart||[]),...safePendingOrders.map(o=>o.cart||[])].some(items=>items.some(i=>i.id===itemForm.id)))return showToast('此項目仍在草稿或掛單，請先完成單據再變更服務／商品類型','error');
        const newItem = { ...itemForm, payrollRule:itemForm.payrollRule?{...itemForm.payrollRule,updatedAt:new Date().toISOString()}:undefined, name:itemForm.name.trim(), price: Number(itemForm.price), cost: Number(itemForm.cost || 0), stock: itemForm.isProduct ? (itemForm.id&&safeServices.find(x=>x.id===itemForm.id)?.isProduct?safeServices.find(x=>x.id===itemForm.id).stock:Number(itemForm.stock||0)) : null };
        if (newItem.id) setServices(safeServices.map(s => s.id === newItem.id ? newItem : s));
        else setServices([...safeServices, { ...newItem, id: generateId() }]);
        setIsEditingItem(false); setItemForm({}); showToast('項目已儲存');
    };

    const handleDeleteItem = id => {
        const target=safeServices.find(s=>s.id===id);if(!target)return;
        if(target.archivedAt){setServices(p=>p.map(s=>s.id===id?{...s,archivedAt:null}:s));return showToast('項目已恢復');}
        if([(draft.cart||[]),...safePendingOrders.map(o=>o.cart||[])].some(items=>items.some(i=>i.id===id)))return showToast('此項目還在草稿或掛單，請先完成單據','error');
        confirmAction('停用項目','停用後不出現在開單選單；商品庫存與歷史資料保留，可隨時恢復。',()=>{setServices(p=>p.map(s=>s.id===id?{...s,archivedAt:new Date().toISOString()}:s));showToast('項目已停用');});
    };

    const filteredItemList = safeServices.filter(s => (s.name||'').includes(itemSearch) || (s.category||'').includes(itemSearch));

    return (
        <div className="settings-page p-6 max-w-6xl mx-auto space-y-6 pb-20" data-section={settingsPage}>
<nav className="settings-tabs" aria-label="設定分類">{[['appearance','店家與外觀'],['items','服務與商品'],['rules','付款與客群'],['commission','抽成規則'],['branches','分店'],['maintenance','備份與維護']].map(([id,label])=><button key={id} aria-pressed={settingsPage===id} onClick={()=>setSettingsPage(id)}>{label}</button>)}</nav>
<div className="settings-pane" data-pane="appearance"><AppearanceSettings /></div>
            {/* 營業項目管理列表 */}
            <div data-pane="items" id="owner-items" className="card p-8 scroll-mt-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h3 className="font-bold text-xl text-slate-800">營業項目管理</h3>
                        <p className="text-xs text-slate-400 mt-1">管理店內提供之洗剪染燙服務及販售之實體產品</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-48">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                            <input className="input-field pl-10 py-1.5 text-sm" placeholder="搜尋項目..." value={itemSearch} onChange={e=>setItemSearch(e.target.value)}/>
                        </div>
                        <button onClick={() => { setItemForm({ category: safeSettings.categories[0] || '', price: '', cost: '', isProduct: false }); setIsEditingItem(true); }} className="btn btn-primary text-sm whitespace-nowrap"><Plus size={16}/> 新增項目</button>
                    </div>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b text-slate-500 font-bold">
                            <tr>
                                <th className="p-4">項目名稱</th>
                                <th className="p-4">分類</th>
                                <th className="p-4">項目顏色</th>
                                <th className="p-4 text-right">售價</th>
                                <th className="p-4 text-right">成本</th>
                                <th className="p-4 text-center">庫存管理</th>
                                <th className="p-4 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredItemList.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-bold text-slate-800">{item.name}{item.archivedAt&&<span className="ml-2 text-xs text-slate-400">已停用</span>}</td>
                                    <td className="p-4"><span className={`text-xs px-2.5 py-1 rounded-full font-bold ${getThemeClasses(safeSettings.categoryColors[item.category] || 'slate', 'badge')}`}>{item.category}</span></td>
                                    <td className="p-4"><div className="flex items-center gap-2"><span className={`w-5 h-5 rounded-full border-2 border-white shadow ${COLOR_THEMES[item.color || safeSettings.categoryColors[item.category] || 'slate']?.bg.replace('-50','-500') || 'bg-slate-500'}`}></span><span className="text-xs font-bold text-slate-500">{COLOR_THEMES[item.color || safeSettings.categoryColors[item.category] || 'slate']?.label || '預設'}</span></div></td>
                                    <td className="p-4 text-right font-bold text-slate-700">${item.price}</td>
                                    <td className="p-4 text-right text-slate-500">${item.cost || 0}</td>
                                    <td className="p-4 text-center">{item.isProduct ? <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-bold">啟用 (實體商品)</span> : <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs font-bold">現場服務</span>}</td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1">
                                            <button title="編輯項目 / 顏色" onClick={() => { setItemForm(item); setIsEditingItem(true); }} className="px-3 py-2 text-slate-600 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-xs flex items-center gap-1"><Edit size={14}/> 編輯</button>
                                            <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredItemList.length === 0 && (
                                <tr><td colSpan="7" className="p-8 text-center text-slate-400">尚未建立任何服務 or 商品項目</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div data-pane="rules" id="owner-preferences" className="card p-6 scroll-mt-6">
              <div className="mb-6"><h3 className="font-bold text-xl">店內規則</h3><p className="text-sm text-slate-500 mt-2">可新增、改名、排序與配色。改名會同步相關紀錄；已使用的分類需保留，確保報表完整。</p></div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <OptionManager field="categories" title="服務與商品分類" colorField="categoryColors"/>
                <OptionManager field="paymentMethods" title="付款方式" colorField="paymentColors"/>
                <OptionManager field="customerTypes" title="客戶分類" colorField="genderColors"/>
                <OptionManager field="customerTags" title="客戶標籤" colorField="tagColors"/>
                <OptionManager field="staffRoles" title="員工職位" colorField="roleColors"/>
                <OptionManager field="expenseTypes" title="支出分類" colorField="expenseColors"/>
              </div>
            </div>
            <div data-pane="branches"><BranchSettings /></div><div data-pane="commission"><PayrollRulesSettings /></div>

            {/* 系統維護 */}
            <div data-pane="maintenance" id="owner-maintenance" className="card p-8">
                <h3 className="font-bold text-xl mb-6 text-slate-800">系統維護</h3><RecoveryPoints/><p className="text-sm text-slate-500 mb-4">本版本使用獨立的本機資料空間，不會讀取店用版本資料。資料儲存在目前瀏覽器。換檔案位置、瀏覽器或電腦前，請先下載備份；HTML 檔本身不包含你的客戶與帳務資料。</p><label className="flex items-center gap-3 mb-4"><input type="checkbox" checked={safeSettings.autoBackup} onChange={e=>setSettings({...safeSettings,autoBackup:e.target.checked})}/>每次結帳後下載資料備份（瀏覽器可能要求允許下載）</label>
                <div className="flex gap-4 flex-wrap">
                    <button className="btn btn-secondary" onClick={()=>{const raw=getBusinessStore().beforeRestore()||JSON.parse(localStorage.getItem('salon_offline_before_restore')||'null');if(!raw)return showToast('目前沒有還原前快照','error');downloadJSON(raw,'salon_offline_before_restore.json');}}>下載還原前快照</button><button onClick={_exportBackup} className="btn btn-primary"><Download size={18}/> 備份資料 (下載)</button>
                    <label className="btn btn-secondary cursor-pointer"><Upload size={18}/> 還原資料<input type="file" className="hidden" accept=".json,application/json" onChange={_importBackup}/></label>
                    <button onClick={() => confirmAction('重置系統', '這將清空所有資料！', () => { if(prompt('請輸入「清空沙龍資料」確認')!=='清空沙龍資料')return; resetBusinessData(); window.location.reload(); })} className="btn btn-danger ml-auto"><RefreshCw size={18}/> 重置系統 (清空)</button>
                </div>
            </div>

            {/* 雲端自動連動區塊 */}
<section data-pane="maintenance" className="card p-6"><h3 className="font-bold text-xl mb-4">手機與平板使用</h3><p>iPhone／iPad：用 Safari 開啟，點「分享」→「加入主畫面」。若有「作為網頁 App 開啟」，請保持開啟。之後由主畫面圖示進入，便不會顯示瀏覽器網址列。</p><p className="mt-2">Android：從 Chrome 選單選擇「加入主畫面」或「安裝應用程式」。</p><p className="mt-2">資料只儲存在目前裝置，不會跨裝置同步。主畫面與瀏覽器可能使用不同儲存空間，切換前請下載備份，再於新入口還原。</p><p className="mt-2">網頁入口仍需網路載入，這份尚未提供離線啟動或商店安裝包。</p></section>


            {/* 項目編輯彈窗 */}
            {isEditingItem && (
                <Modal title={itemForm.id ? '編輯項目' : '新增項目'} onClose={()=>setIsEditingItem(false)} size="max-w-2xl">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500 mb-1 block">名稱</label><input className="input-field shadow-sm bg-white" value={itemForm.name||''} onChange={e=>setItemForm({...itemForm, name: e.target.value})} placeholder="例如: 精緻洗髮"/></div>
                            <div><label className="text-xs font-bold text-slate-500 mb-1 block">分類</label><select className="input-field shadow-sm bg-white" value={itemForm.category} onChange={e=>setItemForm({...itemForm, category: e.target.value})}>{safeSettings.categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div className="col-span-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between mb-3"><label className="text-sm font-black text-slate-700 block">項目專屬顏色</label><span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white border text-slate-500">可覆蓋分類色</span></div><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" onClick={()=>setItemForm({...itemForm,color:''})}>跟隨分類色</button>{Object.entries(COLOR_THEMES).map(([k,t])=><button type="button" key={k} onClick={()=>setItemForm({...itemForm,color:k})} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${(itemForm.color || safeSettings.categoryColors[itemForm.category])===k?'border-slate-900 ring-2 ring-slate-200':'border-slate-200'} ${t.badge}`}>{t.label}</button>)}</div></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500 mb-1 block">售價</label><input type="number" className="input-field shadow-sm bg-white" value={itemForm.price||0} onChange={e=>setItemForm({...itemForm, price: e.target.value})}/></div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">{itemForm.isProduct?'商品單位成本（元）':'材料成本金額（元）'}</label>
                                <input 
                                    type="number" 
                                    className="input-field shadow-sm bg-white" 
                                    value={itemForm.cost || 0} 
                                    onChange={e => setItemForm({...itemForm, cost: Number(e.target.value)})} 
                                    placeholder="例如：400 元"
                                    disabled={!itemForm.isProduct&&((itemForm.payrollRule?.enabled?itemForm.payrollRule:payrollRules(safeSettings)).materialMode!=='itemCost')}
                                />{!itemForm.isProduct&&((itemForm.payrollRule?.enabled?itemForm.payrollRule:payrollRules(safeSettings)).materialMode!=='itemCost')&&<p className="text-xs text-slate-500 mt-1">目前使用百分比或固定材料規則，此欄不參與計算，原值保留。</p>}
                            </div>
                        </div>
                        <div className="border-t pt-4 mt-2">
                            <label className="flex items-center gap-3 p-3 bg-slate-50 border rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                                <input type="checkbox" className="w-5 h-5 accent-indigo-600" checked={itemForm.isProduct||false} onChange={e=>setItemForm({...itemForm, isProduct: e.target.checked})}/>
                                <div><div className="font-bold text-slate-700">此項為商品販賣（不列入服務業績）</div><p className="text-xs text-slate-500">勾選後使用商品獎金與庫存；洗剪染燙服務請勿勾選。</p></div>
                            </label>
                        </div>
                        {!itemForm.isProduct&&<section className="border-t pt-4 space-y-4"><label className="flex gap-3 font-bold"><input type="checkbox" checked={!!itemForm.payrollRule?.enabled} onChange={e=>setItemForm({...itemForm,payrollRule:{...payrollRules(safeSettings),...itemForm.payrollRule,commissionEnabled:itemCommissionEnabled(itemForm.payrollRule),enabled:e.target.checked}})}/>此服務另設材料／協助費</label>{itemForm.payrollRule?.enabled?<PayrollRuleFields value={{...payrollRules(safeSettings),...itemForm.payrollRule}} onChange={r=>setItemForm({...itemForm,payrollRule:{...r,enabled:true}})} prefix="單項"/>:<p className="text-sm text-slate-500">材料及協助費沿用全店制度。</p>}<label className="flex gap-3 items-center"><input type="checkbox" checked={itemCommissionEnabled(itemForm.payrollRule)} onChange={e=>setItemForm({...itemForm,payrollRule:{...itemForm.payrollRule,commissionEnabled:e.target.checked,commissionOverride:e.target.checked,commissionRate:itemForm.payrollRule?.commissionRate??50}})}/>此服務另設設計師比例（優先於人員與全店）</label>{itemCommissionEnabled(itemForm.payrollRule)&&<input aria-label="單項設計師抽成" className="input-field" type="number" min="0" max="100" value={itemForm.payrollRule?.commissionRate??50} onChange={e=>setItemForm({...itemForm,payrollRule:{...itemForm.payrollRule,commissionRate:e.target.value}})}/>}</section>}
                        {itemForm.isProduct&&<label className="block">目前庫存數量（件）<input className="input-field" type="number" min="0" step="1" disabled={!!itemForm.id&&!!safeServices.find(x=>x.id===itemForm.id)?.isProduct} value={itemForm.stock??0} onChange={e=>setItemForm({...itemForm,stock:e.target.value})}/><p className="text-xs text-slate-500">新商品可輸入期初數量；已建檔商品請到商品庫存進貨或盤點，以保留紀錄。</p></label>}
                        <button onClick={handleSaveItem} className="btn btn-primary w-full py-4 mt-2 shadow-md">儲存項目</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};
const CustomerView = () => {
const {safeCustomers,showToast,setCustomers,confirmAction,safeStylists,safeSettings,getThemeClasses,safeTransactions,draft,setDraft,safePendingOrders,setPendingOrders,setActiveTab}=React.useContext(AppContext);

                const [searchTerm, setSearchTerm] = useState('');
                const [showArchived,setShowArchived]=useState(false);
                const [viewingCustomer, setViewingCustomer] = useState(null);
                const [isEditing, setIsEditing] = useState(false);
                const [editForm, setEditForm] = useState({});
                const [filterStylist, setFilterStylist] = useState('all');

                const filtered = safeCustomers.filter(c => {
                    const matchSearch = memberMatches(c,searchTerm)&&!!c.archivedAt===showArchived;
                    const matchStylist = filterStylist === 'all' || c.preferredStylistId === filterStylist;
                    return matchSearch && matchStylist;
                });

                const handleSave = () => {
                    try{const form=checkedCustomer(editForm,safeCustomers);const row=form.id?{...safeCustomers.find(c=>c.id===form.id),...form}:{...form,id:generateId(),visits:0,totalSpend:0};
                    commitTables({customers:form.id?safeCustomers.map(c=>c.id===row.id?row:c):[...safeCustomers,row],draft:draft.selectedCustomer?.id===row.id?{...draft,selectedCustomer:row}:draft,pendingOrders:safePendingOrders.map(o=>o.selectedCustomer?.id===row.id?{...o,selectedCustomer:row,custName:row.name}:o)});
                    if(viewingCustomer?.id===row.id)setViewingCustomer(row);setIsEditing(false);showToast('會員資料已更新，開單與掛單同步');}catch(e){showToast(e.message,'error');}
                };
                const handleDeleteCustomer = (id) => {
                    if(draft.selectedCustomer?.id===id||safePendingOrders.some(o=>o.selectedCustomer?.id===id))return showToast('此會員仍在開單或掛單，請先完成單據或更換顧客','error');
                    confirmAction('停用會員','停用後不出現在開單搜尋，歷史消費保留，可從已停用名單恢復。',()=>{setCustomers(p=>p.map(c=>c.id===id?{...c,archivedAt:new Date().toISOString()}:c));setViewingCustomer(null);showToast('會員已停用，歷史資料保留');});
                };
                const useCustomer=c=>{if(c.archivedAt)return;if(draft.selectedCustomer?.id!==c.id&&draft.cart?.length&&!confirm('將目前開單掛到 '+c.name+'？項目與金額保留。'))return;setDraft(p=>({...p,selectedCustomer:c,adHocCustomerName:'',adHocGender:c.gender||p.adHocGender}));setActiveTab('pos');};

                const getAvatarColor = (name) => {
                    const colors = ['bg-red-100 text-red-600', 'bg-orange-100 text-orange-600', 'bg-amber-100 text-amber-600', 'bg-emerald-100 text-emerald-600', 'bg-teal-100 text-teal-600', 'bg-cyan-100 text-cyan-600', 'bg-blue-100 text-blue-600', 'bg-indigo-100 text-indigo-600', 'bg-violet-100 text-violet-600', 'bg-fuchsia-100 text-fuchsia-600', 'bg-pink-100 text-pink-600', 'bg-rose-100 text-rose-600'];
                    let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length];
                };

                return (
                    <div className="customers-page p-6 h-full overflow-y-auto">
                        <div className="max-w-6xl mx-auto">
                            <div className="customer-page-header flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                                <span className="text-sm text-slate-500 whitespace-nowrap">{filtered.length} 位顧客</span>
                                <div className="customer-tools">
                                    <select className="input-field w-36 font-bold text-slate-700" value={filterStylist} onChange={(e) => setFilterStylist(e.target.value)}>
                                        <option value="all">全部設計師</option>
                                        <option value="">(未指定)</option>
                                        {safeStylists.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                    </select>
<div className="search-wide relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="text" className="input-field pl-10 py-2" placeholder="搜尋姓名或電話..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/></div>                                    <button onClick={()=>{setEditForm({tags:[],gender:safeSettings.customerTypes[0]}); setIsEditing(true);}} className="btn btn-primary whitespace-nowrap"><UserPlus size={18}/> 新增顧客</button>
                                </div>
                            </div>
                            <div className="flex gap-2 mb-4"><button className="btn btn-secondary" onClick={()=>setShowArchived(false)}>使用中會員</button><button className="btn btn-secondary" onClick={()=>setShowArchived(true)}>已停用會員</button></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filtered.map(c => {
                                    const isVip = (c.tags||[]).includes('VIP') || (c.totalSpend || 0) >= (safeSettings.vipThreshold ?? 10000);
                                    const stylistName = safeStylists.find(s => s.id === c.preferredStylistId)?.name || '未指定';
                                    const gender = c.gender || '女';
                                    const themeKey = safeSettings.genderColors[gender] || 'slate';
                                    const cardClass = getThemeClasses(themeKey, 'card_filled');

                                    return (
                                        <div key={c.id} style={{backgroundColor:(COLOR_THEMES[themeKey]?.fill||'#64748b')+'0d',borderColor:(COLOR_THEMES[themeKey]?.fill||'#64748b')+'33'}} onClick={()=>setViewingCustomer(c)} className={`card p-5 relative group cursor-pointer transition-all border border-transparent hover:border-slate-300 ${cardClass}`}>
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3"><div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl bg-white text-slate-600`}>{(c.name||'?').charAt(0)}</div><div><h3 className="font-bold text-lg text-slate-800 flex items-center gap-1">{c.name}{isVip && <span className="text-sm" title="VIP">👑</span>}</h3><p className="text-sm text-slate-500 font-mono">{c.phone}</p></div></div>
                                            </div>
                                            <div className="mb-3"><span className="text-xs bg-white/50 text-slate-600 px-2 py-1 rounded flex items-center gap-1 w-fit border border-slate-200"><UserCog size={12}/> 專屬: <span className="font-bold text-slate-800">{stylistName}</span></span></div>
                                            <div className="grid grid-cols-2 gap-2 bg-white/40 p-3 rounded-xl border border-slate-200/50 mb-3"><div className="text-center"><div className="text-xs text-slate-500 mb-1">累積消費</div><div className="font-black text-slate-800">{formatCurrency(c.totalSpend || 0)}</div></div><div className="text-center border-l border-slate-300"><div className="text-xs text-slate-500 mb-1">來店次數</div><div className="font-black text-slate-800">{c.visits || 0} 次</div></div></div>
                                            <div className="flex flex-wrap gap-1 mb-3">{(c.tags||[]).map(tag=><span key={tag} className={`px-2 py-1 rounded text-xs ${getThemeClasses(safeSettings.tagColors[tag]||'amber','badge')}`}>{tag}</span>)}</div>
                                            <button className="btn btn-primary w-full mt-3" onClick={e=>{e.stopPropagation();if(c.archivedAt){setCustomers(p=>p.map(x=>x.id===c.id?{...x,archivedAt:null}:x));}else useCustomer(c);}}>{c.archivedAt?'恢復會員':'帶入開單'}</button><div className="absolute top-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><button onClick={(e)=>{e.stopPropagation(); setEditForm(c); setIsEditing(true);}} className="p-1.5 bg-white border shadow-sm rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-200"><Edit size={16}/></button><button onClick={(e)=>{e.stopPropagation(); handleDeleteCustomer(c.id);}} className="p-1.5 bg-white border shadow-sm rounded-lg text-slate-400 hover:text-red-500 hover:border-red-200"><Trash2 size={16}/></button></div>
                                        </div>
                                    );
                                })}
                            </div>
                            {filtered.length === 0 && <div className="text-center text-slate-400 py-20 bg-white rounded-xl border border-dashed">查無相關顧客資料</div>}
                        </div>
                        {isEditing && (<Modal title={editForm.id ? '編輯顧客資料' : '新增顧客'} onClose={()=>setIsEditing(false)}><div className="space-y-5"><div className="grid grid-cols-2 gap-5"><div><label className="text-xs font-bold text-slate-500 mb-1 block">姓名</label><input className="input-field" value={editForm.name||''} onChange={e=>setEditForm({...editForm, name:e.target.value})}/></div><div><label className="text-xs font-bold text-slate-500 mb-1 block">電話</label><input className="input-field" value={editForm.phone||''} onChange={e=>setEditForm({...editForm, phone:e.target.value})}/></div></div><div className="customer-profile-fields"><select aria-label="客群" className="input-field" value={editForm.gender || safeSettings.customerTypes[0] || ''} onChange={e=>setEditForm({...editForm, gender:e.target.value})}>{editForm.gender && !safeSettings.customerTypes.includes(editForm.gender) && <option value={editForm.gender}>{editForm.gender}（已停用）</option>}{safeSettings.customerTypes.map(g=><option key={g} value={g}>{g}</option>)}</select><div className="flex-1"><label className="text-xs font-bold text-slate-500 mb-1 block">專屬設計師</label><select className="input-field" value={editForm.preferredStylistId || ''} onChange={e=>setEditForm({...editForm, preferredStylistId: e.target.value})}><option value="">未指定</option>{safeStylists.map(s => <option key={s.id} value={s.id} disabled={!!s.archivedAt}>{s.name}{s.archivedAt?'（已停用）':''}</option>)}</select></div></div><div><label className="text-xs font-bold text-slate-500 mb-2 block">客戶標籤</label><div className="flex flex-wrap gap-2 mb-3">{safeSettings.customerTags.map(tag=><button type="button" key={tag} onClick={()=>setEditForm({...editForm,tags:(editForm.tags||[]).includes(tag)?(editForm.tags||[]).filter(x=>x!==tag):[...(editForm.tags||[]),tag]})} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${(editForm.tags||[]).includes(tag)?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-500 border-slate-200'}`}>{tag}</button>)}</div></div><div><label className="text-xs font-bold text-slate-500 mb-1 block">備註事項</label><textarea className="input-field" rows="3" value={editForm.notes||''} onChange={e=>setEditForm({...editForm, notes:e.target.value})}/></div><button onClick={handleSave} className="btn btn-primary w-full py-3">儲存資料</button></div></Modal>)}
                        {viewingCustomer && !isEditing && (<Modal title={`${viewingCustomer.name} 的消費紀錄`} onClose={()=>setViewingCustomer(null)} size="max-w-2xl"><div className="space-y-6"><div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center border border-slate-200"><div><div className="text-sm text-slate-500">會員電話</div><div className="font-bold font-mono text-lg">{viewingCustomer.phone}</div></div><div className="text-right"><div className="text-sm text-slate-500">歷史總消費</div><div className="font-black text-2xl text-indigo-600">{formatCurrency(viewingCustomer.totalSpend || 0)}</div></div></div><div className="text-sm text-slate-500">專屬設計師: <span className="font-bold text-slate-800">{safeStylists.find(s=>s.id===viewingCustomer.preferredStylistId)?.name || '未指定'}</span></div><div className="text-sm text-slate-500">備註：{viewingCustomer.notes||'無'}</div><div className="border-t pt-4"><h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Settings size={18}/> 近期消費明細</h4><div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">{safeTransactions.filter(t=>t.customerId===viewingCustomer.id).length===0?(<div className="text-center text-slate-400 py-8">尚無消費紀錄</div>):(safeTransactions.filter(t=>t.customerId===viewingCustomer.id).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>(<div key={t.id} className="border p-3 rounded-xl hover:bg-slate-50 transition-colors flex justify-between items-center"><div><div className="font-bold text-slate-700">{new Date(t.date).toLocaleDateString('zh-TW')} <span className="text-xs text-slate-400 font-normal">{new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div><div className="text-sm text-slate-500 mt-1 flex gap-2">{(t.items||[]).map((i,idx)=><span key={idx} className="bg-slate-100 px-2 py-0.5 rounded text-xs">{i.name}</span>)}</div></div><div className="text-right"><div className="font-bold text-slate-800">{formatCurrency(t.total)}</div><div className="text-xs text-slate-400">{safeStylists.find(s=>s.id===t.mainStylistId)?.name || '未知設計師'}</div></div></div>)))}</div></div><div className="flex gap-2 pt-2">{!viewingCustomer.archivedAt&&<button className="btn btn-primary" onClick={()=>useCustomer(viewingCustomer)}>帶入開單</button>}<button onClick={()=>{setEditForm(viewingCustomer); setIsEditing(true);}} className="btn btn-secondary flex-1">編輯資料</button><button onClick={()=>handleDeleteCustomer(viewingCustomer.id)} className="btn btn-danger flex-1">停用會員</button></div></div></Modal>)}
                    </div>
                );
            };
const StaffView = () => {
const {setStylists,safeStylists,showToast,confirmAction,safeSettings,safeServices,draft,setDraft,safePendingOrders,setPendingOrders}=React.useContext(AppContext);

                const [staffTab,setStaffTab]=useState("basic"),[showWorkHours,setShowWorkHours]=useState(false);
                const [isEditing, setIsEditing] = useState(false);
                const [editForm, setEditForm] = useState({});

                const handleSave = () => { 
                    // 1. 必填檢查
                    if (!editForm.name || editForm.name.trim() === '') {
                        alert('請輸入人員姓名！(Name is required)');
                        return;
                    }

                    try{assertPayrollNumber(editForm.salaryBase??0,'月底薪');assertPayrollNumber(editForm.hourlyRate??0,'時薪');if(editForm.useGlobalCommission===false)assertPayrollNumber(editForm.commissionRate,'個人服務抽成',100);if(personalProductEnabled(editForm))assertPayrollNumber(personalProductRate(editForm),'個人販賣比例',100);}catch(e){return showToast(e.message,'error');}
                    try{const changes={stylists:editForm.id?safeStylists.map(st=>st.id===editForm.id?editForm:st):[...safeStylists,{...editForm,id:generateId()}]};
                    if(editForm.id){const renameItem=i=>({...i,stylistName:i.stylistId===editForm.id?editForm.name:i.stylistName,assistantName:i.assistantId===editForm.id?editForm.name:i.assistantName,...(i.helpers?{helpers:i.helpers.map(h=>h.id===editForm.id?{...h,name:editForm.name}:h)}:{})});changes.draft={...draft,cart:(draft.cart||[]).map(renameItem)};changes.pendingOrders=safePendingOrders.map(o=>({...o,cart:(o.cart||[]).map(renameItem)}));}commitTables(changes);}catch(e){return showToast(e.message,'error');}
                    setIsEditing(false);
                    showToast('人員資料已儲存'); 
                };

                const deleteStaff = id=>{if([draft,...safePendingOrders].some(o=>(o.cart||[]).some(i=>i.stylistId===id||(i.helpers||[]).some(h=>h.id===id)||i.assistantId===id)))return showToast('此人員仍在草稿或掛單，請先完成或調整服務人員','error');confirmAction('停用人員','保留歷史業績與工時，之後開單不再提供此人員。',()=>setStylists(p=>p.map(s=>s.id===id?{...s,archivedAt:new Date().toISOString()}:s)));};
                
                return (
                    <div className="p-6 md:p-10 h-full overflow-y-auto">
                        <div className="max-w-6xl mx-auto">
                            <div className="flex justify-between items-center mb-8">
                                <button className="btn btn-secondary" onClick={()=>setShowWorkHours(true)}>工時登記</button>
                                <button onClick={()=>{setEditForm({role:safeSettings.staffRoles[0], baseSalary:0, positionBonus:0, attendanceBonus:0, commissionRate:0, useGlobalCommission:true, useGlobalProductCommission:true, productCommissionRate:0}); setStaffTab('basic'); setIsEditing(true);}} className="btn btn-primary"><Plus size={18}/> 新增人員</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {safeStylists.map(s => {
                                    const roleKey = s.role || '設計師';
                                    const theme = (safeSettings.roleColors && safeSettings.roleColors[roleKey]) 
                                        ? COLOR_THEMES[safeSettings.roleColors[roleKey]] 
                                        : COLOR_THEMES['slate'];
                                    
                                    const accentClass = theme ? `${theme.accent} bg-white` : 'border-l-slate-300 bg-white';
                                    const badgeClass = theme ? theme.badge : 'bg-slate-100 text-slate-600';
                                    
                                    const displayName = s.name || '未命名';
                                    const displayInitial = displayName.length > 0 ? displayName.charAt(0) : '?';

                                    return (
                                        <div key={s.id} className={`card p-6 relative group border-l-4 ${accentClass}`}>
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-xl">
                                                    {displayInitial}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-xl">{displayName}</h3>
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${badgeClass}`}>{s.role || '設計師'}{s.archivedAt?'（已停用）':''}</span>
                                                </div>
                                            </div>
                                            <div className="text-sm text-slate-500 font-medium">{s.employmentType==='partTime'?'兼職':s.employmentType==='support'?'支援人員':'正職'}{s.salaryMode==='hourly'?' · 時薪 '+formatCurrency(s.hourlyRate||0):s.salaryMode==='monthly'?' · 月底薪 '+formatCurrency(s.salaryBase||0):' · 抽成制'}</div>
                                            <div className="absolute top-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                <button onClick={()=>{setEditForm({...s,useGlobalProductCommission:!personalProductEnabled(s),productCommissionRate:personalProductRate(s)}); setStaffTab('basic'); setIsEditing(true);}} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><Edit size={18}/></button>
                                                <button onClick={()=>s.archivedAt?setStylists(p=>p.map(x=>x.id===s.id?{...x,archivedAt:null}:x)):deleteStaff(s.id)} title={s.archivedAt?'恢復人員':'停用人員'} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">{s.archivedAt?'恢復':<Trash2 size={18}/>}</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {showWorkHours&&<Modal title="工時登記" size="max-w-4xl" onClose={()=>setShowWorkHours(false)}><StaffHoursPanel/></Modal>}{isEditing && (
                            <Modal title={editForm.id ? '編輯人員' : '新增人員'} size="max-w-2xl" onClose={()=>setIsEditing(false)}>
                                <div className="staff-edit space-y-4"><nav className="settings-tabs"><button aria-pressed={staffTab==='basic'} onClick={()=>setStaffTab('basic')}>基本資料</button><button aria-pressed={staffTab==='pay'} onClick={()=>setStaffTab('pay')}>薪酬設定</button></nav><div hidden={staffTab!=='basic'}>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">姓名 (必填)</label><input className="input-field border-l-4 border-l-red-400" placeholder="請輸入姓名" value={editForm.name||''} onChange={e=>setEditForm({...editForm, name: e.target.value})}/></div>
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">職位</label><select className="input-field" value={editForm.role||safeSettings.staffRoles[0]||''} onChange={e=>setEditForm({...editForm, role: e.target.value})}>{editForm.role&&!safeSettings.staffRoles.includes(editForm.role)&&<option value={editForm.role}>{editForm.role}（已停用）</option>}{safeSettings.staffRoles.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3"><label>聯絡電話<input className="input-field" type="tel" value={editForm.phone||''} onChange={e=>setEditForm({...editForm,phone:e.target.value})}/></label><label>電子信箱<input className="input-field" type="email" value={editForm.email||''} onChange={e=>setEditForm({...editForm,email:e.target.value})}/></label></div><label className="block">人員備註<textarea className="input-field" value={editForm.notes||''} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/></label>
                                    <div className="border-t pt-4 mt-2">
                                        <div className="grid grid-cols-2 gap-3 mb-4"><label>任用類型<select className="input-field" value={editForm.employmentType||'fullTime'} onChange={e=>setEditForm({...editForm,employmentType:e.target.value})}><option value="fullTime">正職</option><option value="partTime">兼職</option><option value="support">支援人員</option></select></label><label>所屬分店<BranchSelect settings={safeSettings} value={editForm.homeBranchId||'main'} onChange={id=>setEditForm({...editForm,homeBranchId:id})}/></label></div>{editForm.id&&<details className="text-sm text-slate-500"><summary className="cursor-pointer">舊薪資資料（唯讀，尚未接入薪資結算）</summary><p className="mt-2">月底薪 {formatCurrency(editForm.baseSalary||0)} · 職務加給 {formatCurrency(editForm.positionBonus||0)} · 全勤 {formatCurrency(editForm.attendanceBonus||0)}</p><p className="mt-2">原資料保留，不自動加進業績、抽成或時薪金額。時薪請到「薪酬設定」調整，實際工時使用「工時登記」。</p></details>}
                                    </div>
</div><div hidden={staffTab!=='pay'}><StaffPayFields value={editForm} onChange={setEditForm} settings={safeSettings} services={safeServices}/></div>
                                    <button onClick={handleSave} className="btn btn-primary w-full staff-save">儲存人員資料</button>
                                </div>
                            </Modal>
                        )}
                    </div>
                );
            };
const POSView = () => {
const {safeStylists:allStylists,safeSettings,getThemeClasses,showToast,safeCustomers,safeServices,setPendingOrders,safePendingOrders,storageError,safeTransactions,safeInventoryLogs,safeExpenses,setServices,setInventoryLogs,setCustomers,setTransactions,setDraft,confirmAction}=React.useContext(AppContext);

            const safeStylists=allStylists.filter(s=>!s.archivedAt);
            const [cart, setCart] = useDraftField('cart', []);
            const [selectedCategory, setSelectedCategory] = useDraftField('selectedCategory', '全部');
            const [selectedStylist, setSelectedStylist] = useDraftField('selectedStylist', safeStylists[0]?.id || '');
            const [selectedCustomerSnapshot, setSelectedCustomer] = useDraftField('selectedCustomer', null);
            const selectedCustomer=selectedCustomerSnapshot?(safeCustomers.find(c=>c.id===selectedCustomerSnapshot.id)||normalizeCustomer(selectedCustomerSnapshot)):null;

            const [adHocCustomerName, setAdHocCustomerName] = useDraftField('adHocCustomerName', '');
            const [adHocGender, setAdHocGender] = useDraftField('adHocGender', safeSettings.customerTypes[0] || '');
            const [showCheckout, setShowCheckout] = useState(false);
            const [showPending, setShowPending] = useState(false);
            const [checkoutDate, setCheckoutDate] = useDraftField('checkoutDate', getCurrentDateTimeLocal());

            const checkoutLock = React.useRef(false);
            useEffect(()=>{if(storageError)return;if(!safeSettings.customerTypes.includes(adHocGender))setAdHocGender(safeSettings.customerTypes[0]||'');if(selectedCategory!=='全部'&&!safeSettings.categories.includes(selectedCategory))setSelectedCategory('全部');},[safeSettings.customerTypes.join('|'),safeSettings.categories.join('|'),storageError]);
            const [serviceSearch,setServiceSearch] = useState('');
            const [editingPayroll,setEditingPayroll]=useState(null);
            const cartLedgerPreview=useMemo(()=>{try{return {items:preparePayrollItems(cart,safeSettings,safeStylists),error:''};}catch(e){return {items:[],error:e.message};}},[cart,safeSettings,safeStylists]);
            const previewService=cartLedgerPreview.items.filter(i=>!i.isProduct).reduce((r,i)=>({gross:money(r.gross+i.payroll.gross),actual:money(r.actual+i.payroll.actual),commission:money(r.commission+i.payroll.commission)}),{gross:0,actual:0,commission:0});
            
            const getCategoryColor = (cat, itemColor) => {
                const themeKey = itemColor || safeSettings.categoryColors[cat] || 'slate';
                return getThemeClasses(themeKey, 'card');
            };

            const handleMainStylistChange = (e) => {setSelectedStylist(e.target.value);if(cart.length)showToast('已變更新項目預設設計師，現有項目維持原歸屬');};
            const applyStylistToCart = () => {
                const st=safeStylists.find(s=>s.id===selectedStylist);if(!st||!cart.length)return;
                if(!confirm('將目前全部項目改由 '+st.name+' 負責？抽成改用目前設定，並排除本人協助。'))return;
                const next=cart.map(item=>{if(item.stylistId===st.id)return item;const policy=resolvePayrollPolicy(safeServices.find(s=>s.id===item.id)||item,safeSettings,st);const helpers=itemHelpers(item,item.payrollPolicy||policy).filter(h=>h.id!==st.id);return {...item,stylistId:st.id,stylistName:st.name,payrollPolicy:policy,helpers,assistantId:helpers[0]?.id||'',assistantName:helpers[0]?.name||''};});
                setCart(next);showToast('已更新全單服務歸屬');
            };

            const filteredServices = useMemo(() => {
                let items = safeServices.filter(s => !s.archivedAt && !s.isInternal && s.productUse!=='internal' && s.name.toLowerCase().includes(serviceSearch.trim().toLowerCase()));
                if (selectedCategory !== '全部') items = items.filter(s => s.category === selectedCategory);
                return items;
            }, [safeServices, selectedCategory, serviceSearch]);

            const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + lineTotal(item), 0), [cart]);

            const addToCart = (service) => {
                if(service.productUse==='internal')return showToast('店用消耗請從庫存領用','error');
                if (service.isProduct && service.stock !== null) {
                    const inCart = cart.filter(i => i.id === service.id).length;
                    if ((service.stock - inCart) <= 0) { showToast('庫存不足！', 'error'); return; }
                }
                const stylistObj = safeStylists.find(s => s.id === selectedStylist);

                
               // 這裡一定要用 generateId() 產生唯一的 cartId，React 才知道這是一張永遠的單
    const newItem = { 
        cartId: generateId(),
        branchId: safeSettings.activeBranchId || branchesOf(safeSettings)[0].id,
        id: service.id, 
        name: service.name, 
        price: service.price, 
        cost: service.cost || 0,
        payrollPolicy: resolvePayrollPolicy(service,safeSettings,stylistObj), 
        category: service.category,
        color: service.color, 
        stock: service.stock, 
        isProduct: service.isProduct, 
        stylistId: selectedStylist, 
        stylistName: stylistObj?.name || '未指定', 
        assistantId: '', 
        assistantName: '',
        helpers: [], 
        discount: 0 
    };
    setCart(current=>[...current,newItem]);
};

            const handlePendingOrder = () => {
                if(!cart.length)return;const note=prompt('掛單備註（例如：染髮等待中）');if(note===null)return;
                try{const current=localRecoveryPoint();if(JSON.stringify(current.draft.cart||[])!==JSON.stringify(cart))throw Error('開單已變更，請重新確認後掛單');
                const row={id:generateId(),time:new Date().toISOString(),cart,selectedCustomer,adHocCustomerName,adHocGender,selectedStylist,checkoutDate,note,custName:selectedCustomer?.name||adHocCustomerName||'散客',branchId:cart[0]?.branchId||safeSettings.activeBranchId||'main'};
                commitTables({pendingOrders:[...current.pendingOrders,row],draft:{}});showToast('已掛單，開單資料已保存');}catch(e){showToast(e.message,'error');}
            };
            const restoreOrder = o => {
                if(cart.length&&!confirm('目前開單會被取出的掛單取代，確定繼續？'))return;
                const bid=o.branchId||o.cart[0]?.branchId;if(bid&&bid!==(safeSettings.activeBranchId||'main'))return showToast('請先切換到掛單所屬分店：'+branchName(safeSettings,bid),'error');
                if(!bid&&!confirm('這是未分店的舊掛單，確認歸入目前營業分店？'))return;
                try{const current=localRecoveryPoint(),live=current.pendingOrders.find(p=>p.id===o.id);if(!live||JSON.stringify(live)!==JSON.stringify(o))throw Error('掛單已變更，請重新查看');
                const nextDraft={cart:o.cart.map(i=>({...i,branchId:bid||safeSettings.activeBranchId||'main'})),selectedCustomer:o.selectedCustomer||null,adHocCustomerName:o.adHocCustomerName||'',adHocGender:o.adHocGender||safeSettings.customerTypes[0],selectedStylist:o.selectedStylist||o.cart[0]?.stylistId||safeStylists[0]?.id||'',checkoutDate:o.checkoutDate||getCurrentDateTimeLocal()};
                // Preserve an existing working draft as a parked order instead of discarding it.
                const parked=cart.length?[{...current.draft,cart,id:generateId(),time:new Date().toISOString(),selectedCustomer,adHocCustomerName,adHocGender,selectedStylist,checkoutDate,custName:selectedCustomer?.name||adHocCustomerName||'散客',note:'取單前自動保留',branchId:cart[0]?.branchId||safeSettings.activeBranchId||'main'}]:[];
                commitTables({pendingOrders:[...current.pendingOrders.filter(p=>p.id!==o.id),...parked],draft:nextDraft});setShowPending(false);showToast(cart.length?'已取單；原開單已保留為掛單':'單據已取出');}catch(e){showToast(e.message,'error');}
            };

            const handleCheckout = (paymentMethod) => {
                if (cart.length === 0 || checkoutLock.current) return;
                if(selectedCustomer&&!safeCustomers.some(c=>c.id===selectedCustomer.id&&!c.archivedAt))return showToast('本單會員已停用，請重新選擇顧客','error');
                const checkoutBranch=cart[0]?.branchId||safeSettings.activeBranchId||'main';
                if(cart.some(i=>i.branchId&&i.branchId!==checkoutBranch))return showToast('開單包含不同分店，請拆單處理','error');
                if(!cart[0]?.branchId&&!confirm('這是舊版草稿，確認歸入目前營業分店？'))return;
                let accountedItems;
                try {accountedItems=preparePayrollItems(cart,safeSettings,safeStylists);if(salaryOrderLocked(safeSettings,{date:checkoutDate,items:accountedItems}))throw Error('此人員月份已確認薪資，不能補入訂單；請先處理薪資更正');}catch(e){showToast(e.message,'error');return;}
                if (!getBusinessStore().isWritable()) return showToast(storageError||'此視窗不能寫入','error');
                if (!Number.isFinite(new Date(checkoutDate).getTime())) return showToast('請選擇有效的結帳日期','error');
                if (!safeSettings.paymentMethods.includes(paymentMethod)) return showToast('付款方式已停用','error');

                if (cart.some(i=>!validLine(i))) return showToast('金額須為非負數，折扣不得超過售價','error');
                const required = {}; cart.filter(i=>i.isProduct).forEach(i=>required[i.id]=(required[i.id]||0)+1);
                for (const [id,qty] of Object.entries(required)) { const product=safeServices.find(s=>s.id===id); if (!product || (product.stock!==null && Number(product.stock)<qty)) return showToast('商品庫存不足，請調整開單項目','error'); }
                checkoutLock.current=true;
                
               const finalCustName = selectedCustomer ? selectedCustomer.name : (adHocCustomerName || '散客');
const finalCustId = selectedCustomer ? selectedCustomer.id : null;
const finalGender = selectedCustomer ? selectedCustomer.gender : adHocGender;

                const newOrder = {
                    branchId: checkoutBranch, branchName:branchName(safeSettings,checkoutBranch),
                    id: generateId(), 
                    date: new Date(checkoutDate).toISOString(), 
                    items: accountedItems,
                    visitId: generateId(),
                    payrollVersion: 1, 
                    total: cartTotal, 
                    paymentMethod, 
                    mainStylistId: accountedItems[0]?.stylistId || selectedStylist, 
                    customerId: finalCustId,      
                    customerName: finalCustName,  
                    customerGender: finalGender,
                    createdAt: new Date().toISOString() 
                };

                const updatedServices = safeServices.map(s => {
                    const cartItems = cart.filter(i => i.id === s.id);
                    if (s.isProduct && s.stock !== null && cartItems.length > 0) { 
                        return { ...s, stock: Math.max(0, s.stock - cartItems.length) }; 
                    }
                    return s;
                });
                const newLogs = cart.filter(i=>i.isProduct).map(i=>({ id: generateId(), date: new Date().toISOString(), type: '銷售', itemName: i.name, qty: 1, cost: i.cost, note: `訂單 #${newOrder.id.slice(0,6)}`, operator: 'System' }));
                const updatedCustomers = safeCustomers.map(c=>c.id===finalCustId ? {...c,visits:normalizeCustomer(c).visits+1,totalSpend:money(normalizeCustomer(c).totalSpend+cartTotal)}:c);
                const nextSnapshot = {services:updatedServices,stylists:safeStylists,customers:updatedCustomers,transactions:[newOrder,...safeTransactions],settings:safeSettings,inventoryLogs:[...newLogs,...safeInventoryLogs],expenses:safeExpenses,pendingOrders:safePendingOrders};
                try { persistSnapshot(nextSnapshot, {}); } catch(e) { checkoutLock.current=false; showToast('尚未完成結帳：'+e.message,'error'); return; }
                setShowCheckout(false);
                setTimeout(()=>{checkoutLock.current=false;},300);
                if (safeSettings.autoBackup) {
                    setTimeout(() => {
                        try {
                            const backupData = { ...nextSnapshot, schemaVersion: 5, exportedAt: new Date().toISOString() };
                            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = "salon_offline_backup_auto.json";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                        } catch(e) { console.error(e); }
                    }, 1000);
                }

                if (finalCustId) {
                    showToast(`💰 結帳開單成功！已計入會員【${finalCustName || '會員'}】消費`);
                } else {
                    showToast('💰 結帳開單成功！（現場散客單）');
                }
            };

            return (
                <div className="pos-layout flex flex-col lg:flex-row h-full gap-4 p-4 overflow-hidden relative">
                    {editingPayroll&&<LinePayrollEditor item={editingPayroll} settings={safeSettings} stylists={safeStylists} services={safeServices} onClose={()=>setEditingPayroll(null)} onSave={updated=>{setCart(prev=>prev.map(i=>i.cartId===updated.cartId?updated:i));setEditingPayroll(null);showToast('本項人員與業績明細已更新');}}/>}
                    {showPending && (
                        <Modal title="暫存單據 (掛單)" onClose={()=>setShowPending(false)} size="max-w-lg">
                            {safePendingOrders.length === 0 ? <p className="text-center text-slate-400 py-4">無暫存單據</p> : safePendingOrders.map(o => (
                                <div key={o.id} className="border p-3 rounded-xl flex justify-between items-center bg-slate-50 mb-2">
                                    <div><div className="font-bold text-slate-800">{o.custName} <span className="text-xs font-normal text-slate-500">({new Date(o.time).toLocaleTimeString()})</span></div><div className="text-sm text-slate-600">{o.note}</div></div>
                                    <div className="flex gap-2"><button onClick={()=>confirmAction('刪除掛單', '確定？', ()=>setPendingOrders(safePendingOrders.filter(x=>x.id!==o.id)))} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                                    <button onClick={() => restoreOrder(o)} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"><PlayCircle size={18}/> 取單</button>                                                 </div>
                                </div>
                            ))}
                        </Modal>
                    )}

                    {showCheckout && (
                        <Modal title="確認結帳收款" onClose={() => setShowCheckout(false)} size="max-w-lg">
                            <div className="space-y-4 text-center">
                                {cartLedgerPreview.error?<div role="alert" className="payroll-error">{cartLedgerPreview.error}，請返回「業績／協助」檢查。</div>:<div className="checkout-payroll"><div><span>服務虛業績</span><strong>{formatCurrency(previewService.gross)}</strong></div><div><span>實際業績</span><strong>{formatCurrency(previewService.actual)}</strong></div><div><span>設計師抽成</span><strong>{formatCurrency(previewService.commission)}</strong></div></div>}
                                <p className="text-sm text-slate-500">以上只計服務。下方應收總額包含商品；結帳會保存每項制度與協助分配。</p>
                                <div className="bg-slate-50 p-4 rounded-xl border">
                                    <span className="text-xs text-slate-400 font-bold block mb-1">應收總金額</span>
                                    <span className="text-3xl font-black text-indigo-600 font-mono">{formatCurrency(cartTotal)}</span>
                                </div>
                                <div className="text-left text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border space-y-1">
                                    <div>客名：<span className="font-bold text-slate-700">{selectedCustomer ? selectedCustomer.name : (adHocCustomerName || '散客')}</span></div>
                                    <div>整單負責人：<span className="font-bold text-slate-700">{safeStylists.find(s=>s.id===cart[0]?.stylistId)?.name || '未指定'}</span></div>
                                </div>
                                <div className="space-y-2 pt-2">
                                    <label className="text-xs font-bold text-slate-400 text-left block">請選擇付款方式</label>
                                   <div className="grid grid-cols-2 gap-2">
    {/* 定義支付方式與顏色對照 */}
    {safeSettings.paymentMethods.map((name, idx) => ({ name, color: getThemeClasses(safeSettings.paymentColors[name] || ['amber','violet','red','emerald','blue'][idx%5], 'badge'), unusedColor: ['bg-amber-100 text-amber-900 border-amber-200','bg-violet-100 text-violet-900 border-violet-200','bg-red-100 text-red-900 border-red-200','bg-emerald-100 text-emerald-900 border-emerald-200','bg-blue-100 text-blue-900 border-blue-200'][idx % 5] })).map((item) => (
        <button 
            key={item.name} 
            onClick={() => handleCheckout(item.name)}
            className={`py-3 rounded-xl border font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${item.color}`}
        >
            {item.name === '現金' && <Banknote size={16}/>}
            {item.name === '轉帳' && <Smartphone size={16}/>}
            {(item.name === '信用卡' || item.name === '街口支付' || item.name === 'LINE Pay') && <CreditCard size={16}/>}
            {item.name}
        </button>
    ))}
</div>
                                </div>
                                <button onClick={() => setShowCheckout(false)} className="btn btn-secondary w-full py-2.5 mt-2 text-sm">取消返回</button>
                            </div>
                        </Modal>
                    )}

                    {/* 左側主面板：搜尋與項目選單 */}
                    <div className="pos-services flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b space-y-3 bg-white"><div className="service-tools"><input aria-label="搜尋服務或商品" className="input-field" placeholder="搜尋服務或商品…" value={serviceSearch} onChange={e=>setServiceSearch(e.target.value)}/><label className="stylist-picker">設計師<select className="input-field py-2" value={selectedStylist} onChange={handleMainStylistChange}>
                                        {safeStylists.map(s => <option key={s.id} value={s.id} disabled={!!s.archivedAt}>{s.name}{s.archivedAt?'（已停用）':''}</option>)}
                                    </select></label></div>
                            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">{['全部', ...safeSettings.categories].map(c => (<button key={c} onClick={()=>setSelectedCategory(c)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap border transition-all ${selectedCategory===c?'bg-slate-800 text-white border-slate-800 shadow-md':'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{c}</button>))}</div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                {filteredServices.map(s => { 
                                    const inCartCount = cart.filter(i => i.id === s.id).length; 
                                    const remaining = s.isProduct && s.stock !== null && s.stock !== undefined ? Number(s.stock) - inCartCount : null; 
                                    const noStock = remaining !== null && remaining <= 0; 
                                    const colorClass = getCategoryColor(s.category, s.color);
                                    
                                    return (
                                        <button key={s.id} onClick={() => addToCart(s)} disabled={noStock} className={`text-left p-4 rounded-xl border transition-all group relative overflow-hidden ${colorClass} ${noStock ? 'opacity-50 grayscale cursor-not-allowed' : 'active:scale-95 shadow-sm hover:shadow-md'}`}>
                                            <div className="flex justify-between mb-2">
                                                <span className="text-[10px] bg-white/80 px-2 py-0.5 rounded text-slate-500 font-bold backdrop-blur-sm">{s.category}</span>
                                                {remaining !== null && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${remaining<=5?'bg-red-100 text-red-500':'bg-emerald-100 text-emerald-600'}`}>存 {remaining}</span>}
                                            </div>
                                            <h3 className="font-bold text-slate-800 mb-1 truncate text-lg">{s.name}</h3>
                                            <div className="text-slate-700 font-black text-lg">{formatCurrency(s.price)}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* 右側面板：結帳清單 */}
                    <div className="pos-order w-full lg:w-96 bg-white rounded-2xl shadow-xl flex flex-col h-[45vh] lg:h-full border border-slate-200">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50/50">
                            <span className="font-bold flex items-center gap-2 text-slate-700"><Scissors size={18}/> 結帳清單</span>
                            <div className="flex gap-2">
                                <button onClick={()=>setShowPending(true)} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold flex items-center gap-1 hover:bg-indigo-200"><PauseCircle size={12}/> 取單 ({safePendingOrders.length})</button>
                                <span className="text-xs bg-slate-200 px-2 py-1 rounded-full text-slate-600 font-bold">{cart.length} 項目</span>
                            </div>
                        </div>
                        
                       <MemberOrderPanel />
                        <details className="order-options"><summary>本單選項</summary><div className="option-content"><div className="px-4 pt-3"><label className="text-xs font-bold text-slate-400 mb-1 block">訂單日期</label><input type="datetime-local" className="input-field" value={checkoutDate} onChange={e => setCheckoutDate(e.target.value)} /></div>{cart.length>0&&<button className="btn btn-secondary" onClick={applyStylistToCart}>全單改為所選設計師</button>}</div></details>
                        
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                           
                      {/* 這裡把外層 button 改成 div，防止點擊「修改」或「刪除」時觸發整張卡片的點擊事件 */}
 {cart.map((item, idx) => {
    const catColorKey = item.color || safeSettings.categoryColors[item.category] || 'slate';
    const itemBorderClass = getThemeClasses(catColorKey, 'accent');

    return (
        <div key={item.cartId || idx} className={`p-3 border border-slate-200 rounded-xl relative group bg-white border-l-4 ${itemBorderClass}`}>
            <div className="flex justify-between font-bold text-sm mb-1">
                <span className="text-slate-800">{item.name}<small className="block text-slate-500 font-normal mt-1">{item.stylistName||'未指定'}{itemHelpers(item,item.payrollPolicy||resolvePayrollPolicy(item,safeSettings)).length>0&&' · 協助：'+itemHelpers(item,item.payrollPolicy||resolvePayrollPolicy(item,safeSettings)).map(h=>h.name).join('、')}</small></span>
                <span className="text-slate-700 font-black font-mono">{formatCurrency(item.price)}</span>
            </div>
            
            <div className="flex justify-end gap-2 mt-2">
                <button type="button" className="btn btn-secondary text-sm" onClick={()=>setEditingPayroll(item)}>業績／協助</button>
                {/* 絕對不會閃跳的修改金額按鈕 */}
                <button 
                    type="button"
                    className="p-1.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const val = prompt('請輸入新售價:', item.price);
                        if (val !== null && val.trim() !== '') {
                            const newPrice = Number(val);
                            if (Number.isFinite(newPrice) && newPrice >= 0) {
                                setCart(prev => prev.map(c => c.cartId === item.cartId ? { ...c, price: newPrice } : c));
                            }
                        }
                    }}
                >
                    <Edit size={14}/>
                </button>
                
                {/* 絕對不會閃跳的刪除按鈕 */}
                <button 
                    type="button"
                    className="p-1.5 text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCart(prev => prev.filter(c => c.cartId !== item.cartId));
                    }}
                >
                    <Trash2 size={14}/>
                </button>
            </div>
        </div>
    );
})}

{cart.length === 0 && <div className="text-center text-slate-400 py-10 flex flex-col items-center"><Scissors className="w-12 h-12 opacity-20 mb-2"/><p>尚未加入項目</p></div>}
                        </div>

                        <div className="p-4 border-t bg-white rounded-b-2xl">
                            <div className="flex justify-between items-end mb-4"><span className="text-slate-500 font-bold">總計</span><span className="text-3xl font-black text-slate-800">{formatCurrency(cartTotal)}</span></div>
                            <div className="flex gap-2"><button onClick={handlePendingOrder} disabled={cart.length === 0} className="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-50 disabled:opacity-50">掛單</button><button onClick={() => setShowCheckout(true)} disabled={cart.length === 0} className="flex-[2] btn-primary py-3 rounded-xl font-bold shadow-lg disabled:opacity-50">結帳收款</button></div>
                        </div>
                    </div>
                </div>
            );
        };
const InventoryView = () => {
const {safeServices,setServices,showToast,safeStylists,setExpenses,safeExpenses,setInventoryLogs,safeInventoryLogs,safeSettings,getThemeClasses}=React.useContext(AppContext);

                const [mode, setMode] = useState('list');
const [kindFilter,setKindFilter]=useState('all'),[vendorFilter,setVendorFilter]=useState('all'),[useFilter,setUseFilter]=useState('all'),[stockFilter,setStockFilter]=useState('all'),[paidPurchase,setPaidPurchase]=useState(false),[staffCharge,setStaffCharge]=useState(false);
                const [targetItem, setTargetItem] = useState(null);
                const [productEditing,setProductEditing]=useState(null);
                const saveProduct=()=>{try{const f=productEditing;if(!f.name?.trim())throw Error('請填寫品名');assertPayrollNumber(f.price,'售價');assertPayrollNumber(f.cost??0,'成本');if(!Number.isInteger(Number(f.safetyStock??5))||Number(f.safetyStock??5)<0)throw Error('安全庫存須為非負整數');if(!safeSettings.categories.includes(f.category))throw Error('請選擇分類');setServices(p=>p.map(i=>i.id===f.id?{...i,name:f.name.trim(),price:Number(f.price),cost:Number(f.cost||0),category:f.category,color:f.color||'',supplier:(f.supplier||'').trim(),sku:f.sku||'',brand:(f.brand||'').trim(),productKind:(f.productKind||'').trim(),productUse:f.productUse||'sale',safetyStock:Number(f.safetyStock??5)}:i));setProductEditing(null);showToast('商品已更新，新加入開單的項目會使用新設定');}catch(e){showToast(e.message,'error');}};
                const [qty, setQty] = useState(1);
                const [cost, setCost] = useState(0);
                const [note, setNote] = useState('');
                const [supplier, setSupplier] = useState(''); // 新增：進貨廠商狀態
                const [internalUseType, setInternalUseType] = useState('shop'); // 新增：店用(shop) 或 設計師(designer)
                const [selectedStaffId, setSelectedStaffId] = useState(''); // 新增：領用設計師 ID
                const [adjustType, setAdjustType] = useState('inc');
                const [searchTerm, setSearchTerm] = useState(''); 
                const [isAddingNewProduct, setIsAddingNewProduct] = useState(false); // 新增：在此頁直接建品項的開關
                const [newProductForm, setNewProductForm] = useState({ name: '', price: '', cost: '', category: safeSettings.categories.includes('產品')?'產品':safeSettings.categories[0] });

                // 過濾商品 (只顯示產品類，並支援搜尋)
const allProducts=safeServices.filter(p=>!p.archivedAt&&p.isProduct);
const products=allProducts.filter(p=>([p.name,p.category,p.sku,p.supplier,p.brand,p.productKind].filter(Boolean).join(' ').toLowerCase().includes(searchTerm.toLowerCase()))&&(kindFilter==='all'||(p.productKind||'未分類')===kindFilter)&&(vendorFilter==='all'||(p.supplier||'未填廠商')===vendorFilter)&&(useFilter==='all'||(p.productUse||'sale')===useFilter)&&(stockFilter==='all'||(stockFilter==='zero'?Number(p.stock)===0:Number(p.stock)<=stockThreshold(p))));
                // 處理在本地直接新增產品
                const handleQuickAddProduct = () => {
                    if (!newProductForm.name.trim() || newProductForm.price==='' || !Number.isFinite(Number(newProductForm.price)) || Number(newProductForm.price)<0 || !Number.isFinite(Number(newProductForm.cost||0)) || Number(newProductForm.cost||0)<0) {
                        alert('請輸入商品名稱與售價！');
                        return;
                    }
                    if(!Number.isInteger(Number(newProductForm.safetyStock??5))||Number(newProductForm.safetyStock??5)<0)return showToast('安全庫存須為非負整數','error');
                    const newProd = {
                        id: generateId(),
                        name: newProductForm.name,
                        price: Number(newProductForm.price),
                        cost: Number(newProductForm.cost || 0),
                        category: newProductForm.category,
                        stock: 0, // 初始庫存為 0，後續用進貨入庫
                        isProduct: true, productKind:(newProductForm.productKind||'').trim(),brand:(newProductForm.brand||'').trim(),supplier:(newProductForm.supplier||'').trim(),productUse:newProductForm.productUse||'sale',safetyStock:Number(newProductForm.safetyStock??5)
                    };
                    setServices([...safeServices, newProd]);
                    setIsAddingNewProduct(false);
                    setNewProductForm({ name: '', price: '', cost: '', category: safeSettings.categories.includes('產品')?'產品':safeSettings.categories[0] });
                    showToast(`商品 [${newProd.name}] 建立成功！`);
                };
                
                const handleInventoryAction = (actionType) => {
                    if(!targetItem)return;
                    if(!Number.isInteger(Number(qty))||Number(qty)<=0)return showToast('數量須為大於零的整數','error');
                    if(actionType==='restock'&&(!Number.isFinite(Number(cost))||Number(cost)<0))return showToast('進貨成本須為非負金額','error');
                    if(actionType==='internal'&&internalUseType==='designer'&&!safeStylists.some(s=>s.id===selectedStaffId))return showToast('請指定領用人員','error');
                    const current=safeServices.find(p=>p.id===targetItem.id);if(!current||current.archivedAt)return showToast('商品已變更，請重新選擇','error');
                    let newStock=Number(current.stock)||0,logType='',nextExpenses=safeExpenses;const logId=generateId();
                    if(actionType==='restock'){newStock+=Number(qty);logType='進貨';if(paidPurchase)nextExpenses=[...safeExpenses,{id:generateId(),date:getCurrentDateLocal(),branchId:safeSettings.activeBranchId||'main',type:'進貨付款',amount:money(Number(cost)*Number(qty)),inventoryLogId:logId,note:(supplier||'未填廠商')+'｜'+current.name+' × '+qty}];}
                    else if(actionType==='internal'){newStock-=Number(qty);logType='領用';}
                    else if(actionType==='adjust'){newStock+=adjustType==='inc'?Number(qty):-Number(qty);logType=adjustType==='inc'?'盤點+':'盤點-';}
                    else return;
                    if(newStock<0)return showToast('庫存不足','error');
                    const log={id:logId,itemId:current.id,branchId:safeSettings.activeBranchId||'main',date:new Date().toISOString(),type:logType,itemName:current.name,qty:Number(qty),cost:actionType==='restock'?Number(cost):Number(current.cost||0),consumedCost:actionType==='internal'?money(Number(current.cost||0)*Number(qty)):0,staffId:actionType==='internal'&&internalUseType==='designer'?selectedStaffId:'',staffCharge:actionType==='internal'&&internalUseType==='designer'&&staffCharge,paymentRecorded:actionType==='restock'&&paidPurchase,supplier:actionType==='restock'?supplier:current.supplier||'',note:note||(actionType==='internal'?(internalUseType==='designer'?'人員領用':'店內公用'):''),operator:'本機管理者'};
                    const nextServices=safeServices.map(p=>p.id===current.id?{...p,stock:newStock,...(actionType==='restock'?{cost:Number(cost),supplier:supplier.trim()||p.supplier||''}:{})}:p),nextLogs=[log,...safeInventoryLogs];
                    try{commitTables({services:nextServices,inventoryLogs:nextLogs,expenses:nextExpenses});setServices(nextServices);setInventoryLogs(nextLogs);setExpenses(nextExpenses);}catch(e){return showToast(e.message,'error');}
                    setPaidPurchase(false);setStaffCharge(false);
                    // 重置彈出視窗狀態
                    setTargetItem(null); setQty(1); setCost(0); setNote(''); setSupplier(''); setSelectedStaffId(''); setInternalUseType('shop');
                    setMode('list'); showToast(`${logType}完成`);
                };

                return (
                    <div className="inventory-page p-6 h-full overflow-y-auto">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            <div className="flex gap-4 w-full md:w-auto">
                                <button onClick={()=>setMode('list')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${mode==='list'?'bg-slate-800 text-white shadow-lg':'bg-white text-slate-600'}`}><Box size={18}/> 庫存總覽</button>
                                <button onClick={()=>setMode('logs')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${mode==='logs'?'bg-slate-800 text-white shadow-lg':'bg-white text-slate-600'}`}><Table size={18}/> 異動紀錄</button>
                            </div>
                            
                            {mode === 'list' && (
                                <div className="flex gap-2 w-full md:w-auto justify-end">
                                    <div className="relative w-full md:w-64">
                                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                                        <input type="text" className="input-field pl-10 py-2" placeholder="搜尋商品..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/> 
                                    </div>
                                    <button onClick={() => setIsAddingNewProduct(true)} className="btn btn-primary text-sm whitespace-nowrap"><Plus size={16}/> 新增商品</button>
                                </div>
                            )}
                        </div>

{mode==='list'&&<div className="inventory-filters"><div className="report-segment">{[['all','全部'],['low','低庫存'],['zero','缺貨']].map(([id,label])=><button key={id} aria-pressed={stockFilter===id} onClick={()=>setStockFilter(id)}>{label} {allProducts.filter(p=>id==='all'||(id==='zero'?Number(p.stock)===0:Number(p.stock)<=stockThreshold(p))).length}</button>)}</div><select aria-label="商品種類篩選" className="input-field" value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="all">全部種類</option>{[...new Set(allProducts.map(p=>p.productKind||'未分類'))].map(k=><option key={k}>{k}</option>)}</select><select aria-label="廠商篩選" className="input-field" value={vendorFilter} onChange={e=>setVendorFilter(e.target.value)}><option value="all">全部廠商</option>{[...new Set(allProducts.map(p=>p.supplier||'未填廠商'))].map(k=><option key={k}>{k}</option>)}</select><select aria-label="商品用途篩選" className="input-field" value={useFilter} onChange={e=>setUseFilter(e.target.value)}><option value="all">全部用途</option>{['sale','internal','both'].map(k=><option key={k} value={k}>{productUseLabel(k)}</option>)}</select><button className="btn btn-secondary" onClick={()=>{setStockFilter('all');setKindFilter('all');setVendorFilter('all');setUseFilter('all');setSearchTerm('');}}>清除篩選</button><small>{products.length} 項結果</small></div>}
                        {/* 列表模式 */}
                        {mode === 'list' && (
                            <div className="stock-list"><div className="stock-heading"><span>商品／廠商</span><span>種類</span><span>庫存</span><span>售價</span><span>成本</span><span>操作</span></div>
                                {products.map(p => {
                                    const isLowStock = p.stock <= stockThreshold(p); 
                                    const themeKey = safeSettings.categoryColors[p.category] || 'slate';
                                    const badgeClass = getThemeClasses(themeKey, 'badge');

                                    return (
<div key={p.id} className="stock-row">
<div className="stock-name"><button className="stock-title" title="編輯商品資料" onClick={()=>setProductEditing({...p})}>{p.name}</button><small>{p.brand||p.supplier||'未填廠商'} · {productUseLabel(p.productUse)}</small></div><div className="stock-kind">{p.productKind||'未分類'}</div>
<div className={isLowStock?'stock-count low':'stock-count'}><small>庫存</small><strong>{p.stock}</strong>{isLowStock&&<small>低庫存</small>}</div>
<div className="stock-price"><small>售價</small><strong>{formatCurrency(p.price)}</strong></div><div className="stock-cost"><small>成本單價</small><strong>{formatCurrency(p.cost||0)}</strong></div>
<div className="stock-actions"><button className="btn btn-secondary" onClick={()=>{setTargetItem(p);setMode('restock');setCost(p.cost);setSupplier(p.supplier||'');}}>進貨</button>
<details className="more-menu"><summary>更多 ⋯</summary><div><button onClick={()=>{setTargetItem(p);setMode('internal');}}>領用</button><button onClick={()=>{setTargetItem(p);setMode('adjust');setAdjustType('inc');}}>盤點</button></div></details></div></div>
                                    );
                                })}
                                {products.length === 0 && (
                                    <div className="col-span-full text-center py-20 bg-white rounded-xl border border-dashed text-slate-400 flex flex-col items-center gap-2">
                                        <Box size={40} className="opacity-20"/>
                                        <p>目前庫存內無任何商品，點擊右上角立刻「新增商品」吧！</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 紀錄模式 */}
                        {mode === 'logs' && (
                            <div className="card overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b"><tr><th className="p-4">時間</th><th className="p-4">類型</th><th className="p-4">品項</th><th className="p-4 text-right">數量</th><th className="p-4">詳細備註（廠商/領用明細）</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {safeInventoryLogs.map(l => (
                                            <tr key={l.id} className="hover:bg-slate-50">
                                                <td className="p-4 text-slate-500">{new Date(l.date).toLocaleString()}</td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold 
                                                        ${l.type==='進貨'?'bg-emerald-100 text-emerald-700':
                                                          l.type==='銷售'?'bg-blue-100 text-blue-700':
                                                          l.type==='領用'?'bg-orange-100 text-orange-700':
                                                          'bg-slate-200 text-slate-700'}`}>
                                                        {l.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 font-bold">{l.itemName}</td>
                                                <td className="p-4 text-right font-bold font-mono">{l.qty}</td>
                                                <td className="p-4 text-slate-600 text-xs font-medium">{l.note || '-'}</td>
                                            </tr>
                                        ))}
                                        {safeInventoryLogs.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">尚無任何出入庫紀錄</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {productEditing&&<Modal title="商品品項設定" onClose={()=>setProductEditing(null)}><div className="space-y-4"><label>品名<input className="input-field" value={productEditing.name} onChange={e=>setProductEditing({...productEditing,name:e.target.value})}/></label><div className="grid grid-cols-2 gap-3"><label>售價<input className="input-field" type="number" min="0" value={productEditing.price} onChange={e=>setProductEditing({...productEditing,price:e.target.value})}/></label><label>單位成本<input className="input-field" type="number" min="0" value={productEditing.cost||0} onChange={e=>setProductEditing({...productEditing,cost:e.target.value})}/></label></div><ProductMetaFields value={productEditing} onChange={setProductEditing} services={safeServices}/><label>帳務分類<select className="input-field" value={productEditing.category} onChange={e=>setProductEditing({...productEditing,category:e.target.value})}>{safeSettings.categories.map(c=><option key={c}>{c}</option>)}</select></label><label>辨識顏色<select className="input-field" value={productEditing.color||''} onChange={e=>setProductEditing({...productEditing,color:e.target.value})}><option value="">跟隨分類</option>{Object.entries(COLOR_THEMES).map(([id,c])=><option key={id} value={id}>{c.label}</option>)}</select></label><label>商品編號（選填）<input className="input-field" value={productEditing.sku||''} onChange={e=>setProductEditing({...productEditing,sku:e.target.value})}/></label><label>常用供應商（選填）<input className="input-field" value={productEditing.supplier||''} onChange={e=>setProductEditing({...productEditing,supplier:e.target.value})}/></label><p className="text-xs text-slate-500">庫存 {productEditing.stock??'未追蹤'} 件。數量請用進貨／盤點調整；既有單據保留原價格與成本。</p><button className="btn btn-primary w-full" onClick={saveProduct}>儲存品項</button></div></Modal>}
                        {/* 視窗：快速在商品庫存建檔 */}
                        {isAddingNewProduct && (
                            <Modal title="全新商品建檔入庫" onClose={() => setIsAddingNewProduct(false)} size="max-w-sm">
                                <div className="space-y-4">
                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">商品名稱</label><input type="text" className="input-field bg-white" placeholder="例如: 摩洛哥優油 100ml" value={newProductForm.name} onChange={e => setNewProductForm({...newProductForm, name: e.target.value})}/></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">設定售價</label><input type="number" className="input-field bg-white" placeholder="0" value={newProductForm.price} onChange={e => setNewProductForm({...newProductForm, price: e.target.value})}/></div>
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">初始成本</label><input type="number" className="input-field bg-white" placeholder="0" value={newProductForm.cost} onChange={e => setNewProductForm({...newProductForm, cost: e.target.value})}/></div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-1 block">商品所屬分類</label>
                                        <select className="input-field bg-white font-bold" value={newProductForm.category} onChange={e => setNewProductForm({...newProductForm, category: e.target.value})}>
                                            {safeSettings.categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <ProductMetaFields value={newProductForm} onChange={setNewProductForm} services={safeServices}/><label>供應廠商<input className="input-field" value={newProductForm.supplier||''} onChange={e=>setNewProductForm({...newProductForm,supplier:e.target.value})}/></label><div className="bg-emerald-50 text-emerald-700 text-xs p-3 rounded-lg font-medium">※ 在此建立完成後，商品會直接在列表上顯示，您可以立即點擊「進貨」補上現有庫存。</div>
                                    <button onClick={handleQuickAddProduct} className="btn btn-primary w-full py-3 shadow-md mt-2">確認商品建檔</button>
                                </div>
                            </Modal>
                        )}

                        {/* 視窗：全新進貨模式 */}
                        {mode === 'restock' && targetItem && (
                            <Modal title="商品進貨入庫" onClose={()=>{setMode('list'); setTargetItem(null);}} size="max-w-sm">
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><span className="text-xs text-slate-400 block font-bold mb-0.5">品項名稱</span><span className="font-bold text-lg text-slate-800">{targetItem.name}</span></div>
                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">進貨廠商 (可留空)</label><input type="text" className="input-field bg-white" placeholder="輸入廠商名稱或大盤商" value={supplier} onChange={e=>setSupplier(e.target.value)}/></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">進貨數量</label><input type="number" className="input-field bg-white text-lg font-bold" value={qty} onChange={e=>setQty(e.target.value)} placeholder="1"/></div>
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">這次進貨單價(成本)</label><input type="number" className="input-field bg-white text-lg font-bold" value={cost} onChange={e=>setCost(e.target.value)}/></div>
                                    </div>
                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">備註說明</label><input type="text" className="input-field bg-white" placeholder="選填，例如批號或效期" value={note} onChange={e=>setNote(e.target.value)}/></div>
                                    <label className="review-check"><input type="checkbox" checked={paidPurchase} onChange={e=>setPaidPurchase(e.target.checked)}/>已付款，同時登記進貨支出</label><p className="text-xs text-slate-500">若已在支出表登記，請勿重複勾選。未付款只入庫。</p><button onClick={()=>handleInventoryAction('restock')} className="w-full py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg mt-2">確認入庫並更新成本</button>
                                </div>
                            </Modal>
                        )}

                        {/* 視窗：全新現場領用模式 */}
                        {mode === 'internal' && targetItem && (
                            <Modal title="現場物料領用" onClose={()=>{setMode('list'); setTargetItem(null);}} size="max-w-sm">
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><span className="text-xs text-slate-400 block font-bold mb-0.5">領用品項</span><span className="font-bold text-lg text-slate-800">{targetItem.name}</span><div className="text-xs text-slate-500 mt-1">當前庫存：{targetItem.stock} | 單件成本：${targetItem.cost}</div></div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-2 block">領用對象</label>
                                        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg mb-3">
                                            <button onClick={()=>setInternalUseType('shop')} className={`py-2 rounded-md text-xs font-bold transition-all ${internalUseType==='shop'?'bg-white text-slate-800 shadow-sm':'text-slate-400'}`}>店內公用</button>
                                            <button onClick={()=>setInternalUseType('designer')} className={`py-2 rounded-md text-xs font-bold transition-all ${internalUseType==='designer'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>設計師領用</button>
                                        </div>
                                    </div>
                                    {internalUseType === 'designer' && (
                                        <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 animate-fade-in">
                                            <label className="text-xs font-bold text-indigo-700 mb-1 block">指定領用人員</label>
                                            <select className="input-field bg-white font-bold" value={selectedStaffId} onChange={e=>setSelectedStaffId(e.target.value)}>
                                                <option value="">-- 請選擇設計師/助理 --</option>
                                                {safeStylists.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">領用數量</label><input type="number" className="input-field bg-white font-bold" value={qty} onChange={e=>setQty(e.target.value)}/></div>
                                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">合計扣除成本</label><div className="input-field bg-slate-100 font-mono font-bold text-slate-600">${targetItem.cost * qty}</div></div>
                                    </div>
                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">用途說明 / 備註</label><input type="text" className="input-field bg-white" placeholder="例如：鏡台前公用、教育訓練" value={note} onChange={e=>setNote(e.target.value)}/></div>
                                    {internalUseType==='designer'&&<label className="review-check"><input type="checkbox" checked={staffCharge} onChange={e=>setStaffCharge(e.target.checked)}/>由此人負擔成本，列入薪資抵扣</label>}<p className="text-xs text-slate-500">領用只扣庫存並記耗用，不再新增付款支出。</p><button onClick={()=>handleInventoryAction('internal')} className="w-full py-3 rounded-xl font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-lg mt-2">確認扣庫並記入公用支出</button>
                                </div>
                            </Modal>
                        )}

                        {/* 視窗：簡易盤點微調模式 */}
                        {mode === 'adjust' && targetItem && (
                            <Modal title="庫存盤點與誤差微調" onClose={()=>{setMode('list'); setTargetItem(null);}} size="max-w-sm">
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><span className="font-bold text-base text-slate-800">{targetItem.name}</span><div className="text-xs text-slate-500">目前帳面庫存：{targetItem.stock}</div></div>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg"><button onClick={()=>setAdjustType('inc')} className={`py-2 rounded-md text-sm font-bold transition-all ${adjustType==='inc'?'bg-white text-emerald-600 shadow-sm':'text-slate-400'}`}>+ 盤盈(增加)</button><button onClick={()=>setAdjustType('dec')} className={`py-2 rounded-md text-sm font-bold transition-all ${adjustType==='dec'?'bg-white text-red-500 shadow-sm':'text-slate-400'}`}>- 盤虧(減少)</button></div>
                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">修正數量</label><input type="number" className="input-field bg-white text-lg" value={qty} onChange={e=>setQty(e.target.value)}/></div>
                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">盤點原因</label><input type="text" className="input-field bg-white" value={note} onChange={e=>setNote(e.target.value)} placeholder="例如：過期損壞、漏刷補單"/></div>
                                    <button onClick={()=>handleInventoryAction('adjust')} className={`w-full py-3 rounded-xl font-bold text-white shadow-lg mt-2 ${adjustType==='inc'?'bg-slate-700 hover:bg-slate-800':'bg-red-500 hover:bg-red-600'}`}>確認盤點修正</button>
                                </div>
                            </Modal>
                        )}
                    </div>
                );
            };
const ReportView = () => {
 const {setActiveTab,safeTransactions,safeExpenses,safeStylists,safeServices,safeSettings,safeInventoryLogs=[],setSettings,showToast,setExpenses,confirmAction}=React.useContext(AppContext);
 const [filterBranch,setFilterBranch]=useState('all'),[reportMode,setReportMode]=useState('month'),[queryDate,setQueryDate]=useState(getCurrentDateLocal().slice(0,7)),[expenseType,setExpenseType]=useState('all'),[showExpenseModal,setShowExpenseModal]=useState(false),[showHours,setShowHours]=useState(false);
 const [newExpense,setNewExpense]=useState({date:getCurrentDateLocal(),type:safeSettings.expenseTypes.includes('雜支')?'雜支':safeSettings.expenseTypes[0],amount:'',note:'',staffId:'',branchId:safeSettings.activeBranchId||'main'});
 const [reportPage,setReportPage]=useState('overview');
 const [endDate,setEndDate]=useState(getCurrentDateLocal());
 const handleModeChange=mode=>{setReportMode(mode);const length=['day','range'].includes(mode)?10:['month','months'].includes(mode)?7:4;setQueryDate(getCurrentDateLocal().slice(0,length));setEndDate(getCurrentDateLocal().slice(0,length));};
 const bounds=periodBounds(reportMode,queryDate,endDate),validPeriod=!!bounds;
 const reportTx=useMemo(()=>safeTransactions.filter(t=>inPeriod(localDate(t.date),bounds)&&branchMatch(t,filterBranch)),[safeTransactions,queryDate,endDate,reportMode,filterBranch,validPeriod]);
 const reportExp=useMemo(()=>safeExpenses.filter(e=>!e.voidedAt&&inPeriod(e.date,bounds)&&branchMatch(e,filterBranch)),[safeExpenses,queryDate,endDate,reportMode,filterBranch,validPeriod]);
 const performance=performanceData(reportTx),totalRevenue=money(reportTx.reduce((s,t)=>s+Number(t.total||0),0)),totalExpense=money(reportExp.reduce((s,e)=>s+Number(e.amount||0),0)),categories=expenseSummary(reportExp);
 const consumed=safeInventoryLogs.filter(l=>l.type==='領用'&&inPeriod(localDate(l.date),bounds)&&branchMatch(l,filterBranch));
 const filteredExp=reportExp.filter(e=>expenseType==='all'||e.type===expenseType);
 const addExpense=()=>{const amount=Number(newExpense.amount);if(!newExpense.amount||!Number.isFinite(amount)||amount<=0)return showToast('請輸入大於零的金額','error');if(!safeSettings.expenseTypes.includes(newExpense.type))return showToast('請選擇支出分類','error');if(!/^\d{4}-\d{2}-\d{2}$/.test(newExpense.date)||localDate(newExpense.date+'T12:00:00')!==newExpense.date)return showToast('請選擇有效日期','error');const isAdvance=newExpense.type===(safeSettings.advanceExpenseType||'員工借支');if(isAdvance&&!safeStylists.some(s=>s.id===newExpense.staffId))return showToast('借支必須指定人員','error');const branch=branchesOf(safeSettings).find(b=>b.id===(newExpense.branchId||safeSettings.activeBranchId||'main'));if(!branch)return showToast('請選擇分店','error');setExpenses([...safeExpenses,{...newExpense,id:generateId(),amount:money(amount),isAdvance,branchId:branch.id,branchName:branch.name,staffId:newExpense.staffId||''}]);setShowExpenseModal(false);setNewExpense(p=>({...p,amount:'',note:'',staffId:''}));showToast('支出已登記；報表依日期與分店顯示');};
 const openExpense=()=>{setNewExpense(p=>({...p,date:reportMode==='day'&&validPeriod?queryDate:getCurrentDateLocal(),branchId:filterBranch!=='all'&&filterBranch!=='unassigned'?filterBranch:safeSettings.activeBranchId||'main'}));setShowExpenseModal(true);};
 return <div className="simple-report"><nav className="report-view-nav" aria-label="報表內容">{[['overview','業績總覽'],['expenses','支出明細'],['receipts','收款與耗用']].map(([id,label])=><button key={id} aria-pressed={reportPage===id} onClick={()=>setReportPage(id)}>{label}</button>)}</nav><header className="report-toolbar"><div><p>{bounds?bounds.from+' ～ '+bounds.to:'請選有效日期區間'} · {filterBranch==='all'?'全部分店':filterBranch==='unassigned'?'未分店紀錄':branchName(safeSettings,filterBranch)}</p></div><div className="report-inline-controls"><div className="report-segment">{[['day','日報'],['month','月報'],['year','年報'],['range','日期區間'],['months','月份區間']].map(([id,name])=><button key={id} aria-pressed={reportMode===id} onClick={()=>handleModeChange(id)}>{name}</button>)}</div><input aria-label="報表日期" className="input-field report-date" type={['day','range'].includes(reportMode)?'date':['month','months'].includes(reportMode)?'month':'number'} value={queryDate} onChange={e=>setQueryDate(e.target.value)}/>{['range','months'].includes(reportMode)&&<><span>至</span><input aria-label="報表結束日期" className="input-field report-date" type={reportMode==='months'?'month':'date'} value={endDate} onChange={e=>setEndDate(e.target.value)}/></>}{branchesOf(safeSettings).length>1||safeTransactions.some(t=>!t.branchId)?<BranchSelect settings={safeSettings} value={filterBranch} onChange={setFilterBranch} all/>:null}</div></header>
 {!validPeriod&&<p className="report-warning" role="alert">請選擇有效日期，開始日期不可晚於結束日期。</p>}{reportPage==='overview'&&<><div className="store-finances"><article className="finance-main"><span>店家總業績</span><strong>{formatCurrency(totalRevenue)}</strong><small>服務 {formatCurrency(performance.totals.gross)} ＋ 販賣 {formatCurrency(performance.totals.productRevenue)}</small><div>{reportTx.length} 張結帳單</div></article><article><span>已登記支出</span><strong>{formatCurrency(totalExpense)}</strong><small>{reportExp.length} 筆 · 請切換「支出明細」</small></article><article><span>服務總客次／客單價</span><strong>{performance.visitCount} 次</strong><small>服務平均 {formatCurrency(performance.visitCount?performance.totals.gross/performance.visitCount:0)}／客次</small></article><article><span>帳面收支差額</span><strong>{formatCurrency(money(totalRevenue-totalExpense))}</strong><small>總業績 − 已登記支出<br/>未入帳薪資、成本未扣，並非淨利</small></article></div>
 <SimplePerformance transactions={reportTx} stylists={safeStylists} settings={safeSettings} services={safeServices}/></>}
 {reportPage==='expenses'&&<><details open className="card report-block"><summary className="report-secondary-title">支出分類與明細 · {formatCurrency(totalExpense)}</summary><div className="report-section-head"><div><h2>支出花在哪裡</h2><p>薪資、房租、材料、雜物分開看。點分類可查看紀錄。</p></div><button className="btn btn-primary" onClick={openExpense}>＋ 登記支出</button></div><div className="expense-categories"><button className={'expense-category '+(expenseType==='all'?'selected':'')} onClick={()=>setExpenseType('all')}><span>全部支出</span><strong>{formatCurrency(totalExpense)}</strong><small>{reportExp.length} 筆</small></button>{categories.map(c=><button className={'expense-category '+(expenseType===c.name?'selected':'')} key={c.name} style={{borderTop:'4px solid '+(COLOR_THEMES[safeSettings.expenseColors?.[c.name]||'rose']?.fill||'#e11d48')}} onClick={()=>setExpenseType(c.name)}><span>{c.name}</span><strong>{formatCurrency(c.amount)}</strong><small>{c.count} 筆 · 占支出 {reportPct(c.amount,totalExpense)}</small></button>)}</div>{!reportExp.length&&<p className="report-empty">尚無支出。按「登記支出」選分類與金額即可。</p>}
 <details className="expense-detail" open={expenseType!=='all'||undefined}><summary>{expenseType==='all'?'查看全部支出明細':expenseType+'明細'}（{filteredExp.length} 筆）</summary><div className="matrix-scroll"><table className="salon-matrix detail-table"><thead><tr>{['日期','分類／人員','說明','金額','操作'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filteredExp.map(e=><tr key={e.id}><th>{e.date}</th><td>{e.type}<small>{safeStylists.find(s=>s.id===(e.staffId||e.relatedStaffId))?.name||''}</small></td><td>{e.note||'—'}<small>{branchName(safeSettings,e.branchId)}</small></td><td>{formatCurrency(e.amount)}</td><td><button className="btn btn-secondary" onClick={()=>{if(e.salarySlipId||e.inventoryLogId||(safeSettings.salarySlips||[]).some(s=>!s.voidedAt&&(s.advanceIds||[]).includes(e.id)))return showToast('此支出已連動進貨或薪資，不能直接刪除','error');confirmAction('刪除支出','確認刪除此筆支出？',()=>setExpenses(safeExpenses.filter(x=>x.id!==e.id)));}}>刪除</button></td></tr>)}</tbody></table></div></details><p className="report-footnote">薪資請登記實際支付金額；報表中的抽成與工時試算不會自動重複列為支出。新領用僅記耗用，不列付款；舊版領料支出保留，請核對是否與進貨重複。</p></details>
</>}{reportPage==='receipts'&&<><details open className="card report-block"><summary className="report-secondary-title">耗用成本（非付款支出） · {formatCurrency(consumed.reduce((n,l)=>n+Number(l.consumedCost||0),0))}</summary><p className="report-footnote">依領用當時成本記錄；服務抽成的材料扣除另計，這裡不重複扣除收支。</p>{consumed.map(l=><div className="consumption-row" key={l.id}><span>{localDate(l.date)} · {l.itemName} × {l.qty}</span><span>{l.staffCharge?'個人負擔':'店內耗用'} · {l.consumedCost===undefined?'舊紀錄待核對':formatCurrency(l.consumedCost)}</span></div>)}{!consumed.length&&<p>此期間沒有領用紀錄。</p>}</details>
 <details open className="card report-block"><summary className="report-secondary-title">收款方式</summary><div className="expense-categories">{[...new Set(reportTx.map(t=>t.paymentMethod||'其他'))].map(method=><div className="expense-category" key={method} style={{borderTop:'4px solid '+(COLOR_THEMES[safeSettings.paymentColors?.[method]||'slate']?.fill||'#64748b')}}><span>{method}</span><strong>{formatCurrency(reportTx.filter(t=>(t.paymentMethod||'其他')===method).reduce((s,t)=>s+Number(t.total||0),0))}</strong></div>)}</div></details>
</>}
 {showExpenseModal&&<Modal title="登記支出" onClose={()=>setShowExpenseModal(false)}><div className="space-y-4"><label>日期<input type="date" className="input-field" value={newExpense.date} onChange={e=>setNewExpense({...newExpense,date:e.target.value})}/></label><label>支出分店<BranchSelect settings={safeSettings} value={newExpense.branchId||safeSettings.activeBranchId||'main'} onChange={v=>setNewExpense({...newExpense,branchId:v})}/></label><label>分類<select className="input-field" value={newExpense.type} onChange={e=>setNewExpense({...newExpense,type:e.target.value,staffId:''})}>{safeSettings.expenseTypes.map(t=><option key={t}>{t}</option>)}</select></label><button className="btn btn-secondary" onClick={()=>{const name=prompt('新增支出分類，例如：薪資、雜物、教育訓練')?.trim();if(!name)return;if(!safeSettings.expenseTypes.includes(name))setSettings(p=>({...p,expenseTypes:[...(p.expenseTypes||safeSettings.expenseTypes),name]}));setNewExpense(p=>({...p,type:name}));}}>＋ 新增分類</button><label>金額<input className="input-field" type="number" min="0" step="0.01" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})}/></label><label>相關人員{newExpense.type===(safeSettings.advanceExpenseType||'員工借支')?'（借支必填）':'（選填）'}<select className="input-field" value={newExpense.staffId} onChange={e=>setNewExpense({...newExpense,staffId:e.target.value})}><option value="">未指定</option>{safeStylists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>說明<input className="input-field" placeholder="例如：九月薪資、購買清潔用品" value={newExpense.note} onChange={e=>setNewExpense({...newExpense,note:e.target.value})}/></label><button className="btn btn-primary w-full" onClick={addExpense}>儲存支出</button></div></Modal>}
 </div>;
};

const OrderView = () => {
const {safeTransactions,confirmAction,transactions,customers,setCustomers,safeServices,setServices,setInventoryLogs,safeInventoryLogs,setTransactions,showToast,safeCustomers,safeStylists,safeSettings,setSettings,getThemeClasses}=React.useContext(AppContext);

                const [searchTerm, setSearchTerm] = useState('');
                const [dateMode, setDateMode] = useState('month');
                const [queryDate, setQueryDate] = useState(getCurrentDateLocal().slice(0, 7));
                const [editingOrder, setEditingOrder] = useState(null);
                const [filterStylist, setFilterStylist] = useState('all');
                const [filterBranch,setFilterBranch]=useState('all');

               const handleModeChange = (mode) => {
    setDateMode(mode);
    const now = new Date();
    // 解決時區偏移問題的輔助函數
    const getFormattedDate = (type) => {
        const offset = now.getTimezoneOffset();
        const localDate = new Date(now.getTime() - (offset * 60 * 1000));
        if (type === 'month') return localDate.toISOString().slice(0, 7); // YYYY-MM
        return localDate.toISOString().slice(0, 10); // YYYY-MM-DD
    };

    setQueryDate(getFormattedDate(mode));
};

                const filteredOrders = useMemo(() => {
                    return safeTransactions.filter(t => {
                        const txDate = localDate(t.date);
                        let matchDate = true;
                        if (dateMode === 'month') matchDate = txDate.startsWith(queryDate);
                        else matchDate = txDate === queryDate;

                        const matchSearch = searchTerm ? ((t.customerName && t.customerName.includes(searchTerm)) || (t.id && t.id.includes(searchTerm))) : true;
                        const matchStylist = filterStylist === 'all' || t.mainStylistId === filterStylist || (t.items||[]).some(i=>i.stylistId===filterStylist||(i.payroll?.helpers||[]).some(h=>h.id===filterStylist));

                        return matchDate && matchSearch && matchStylist && branchMatch(t,filterBranch);
                    }).sort((a,b) => new Date(b.date) - new Date(a.date));
                }, [safeTransactions, queryDate, searchTerm, dateMode, filterStylist, filterBranch]);

                        const handleDeleteOrder = orderId=>{const reason=prompt('作廢原因（保留原單；若實際退款請另行核對收付款）')?.trim();if(!reason)return;confirmAction('作廢訂單','確認此筆開單應作廢？原單保留，會員與商品庫存將回沖。',()=>{try{const changes=voidOrderData(orderId,reason,{safeTransactions,safeCustomers,safeServices,safeSettings,safeInventoryLogs});commitTables(changes);setTransactions(changes.transactions);setCustomers(changes.customers);setServices(changes.services);setInventoryLogs(changes.inventoryLogs);setSettings(changes.settings);showToast('訂單已作廢，原單及原因已保存');}catch(e){showToast(e.message,'error');}});};

const handleUpdateOrder = (updatedOrder) => {
    if (!updatedOrder.items?.length || updatedOrder.items.some(i=>!validLine(i)) || !Number.isFinite(new Date(updatedOrder.date).getTime())) return showToast('請檢查日期與項目金額；折扣不得超過售價','error');
    const oldOrder = safeTransactions.find(t => t.id === updatedOrder.id);
    if(salaryOrderLocked(safeSettings,oldOrder)||salaryOrderLocked(safeSettings,updatedOrder))return showToast('此月份已有確認薪資條，不能直接修改訂單','error');
    if (!oldOrder) { showToast('找不到原訂單', 'error'); return; }

    const normalizedItems = (updatedOrder.items || []).map(item => ({
        ...item,
        cartId: item.cartId || generateId(),
        price: Math.max(0, Number(item.price) || 0),
        discount: Math.max(0, Number(item.discount) || 0),
        cost: Math.max(0, Number(item.cost) || 0)
    }));
    try {
      for(let idx=0;idx<normalizedItems.length;idx++){
        const item=normalizedItems[idx],oldItem=(oldOrder.items||[]).find(i=>i.cartId===item.cartId);
        if(oldItem?.payroll){
          if(!confirmedPayroll(oldItem))throw Error('原單制度快照不一致，請先核對原始備份');
          normalizedItems[idx]={...item,payroll:calculatePayroll(item,oldItem.payroll.policy,oldItem.payroll.helpers),payrollPolicy:{...oldItem.payroll.policy}};
        } else {delete item.payroll;}
      }
    }catch(e){return showToast(e.message,'error');}
    const nextTotal = normalizedItems.reduce((sum, item) => sum + Math.max(0, item.price - item.discount), 0);
    const nextOrder = { ...updatedOrder, items: normalizedItems, total: nextTotal, updatedAt: new Date().toISOString(),revisionHistory:[...(oldOrder.revisionHistory||[]),{at:new Date().toISOString(),date:oldOrder.date,total:oldOrder.total,items:oldOrder.items,customerId:oldOrder.customerId,reason:'查單修正；保留原制度'}] };

    // 1. 依「舊訂單 vs 新訂單」計算每項商品庫存差額，而不是整張單重扣。
    const qtyMap = (items) => (items || []).filter(i => i.isProduct).reduce((m, i) => {
        m[i.id] = (m[i.id] || 0) + 1;
        return m;
    }, {});
    const oldQty = qtyMap(oldOrder.items);
    const newQty = qtyMap(nextOrder.items);
    const productIds = new Set([...Object.keys(oldQty), ...Object.keys(newQty)]);
    for(const id of productIds){const delta=(newQty[id]||0)-(oldQty[id]||0),p=safeServices.find(s=>s.id===id);if(delta>0&&(!p||(p.stock!==null&&p.stock!==undefined&&Number(p.stock)<delta)))return showToast('修改後商品庫存不足，未儲存','error');}
    const updatedServices = safeServices.map(service => {
        if (!service.isProduct || service.stock === null || service.stock === undefined || !productIds.has(service.id)) return service;
        const deltaSold = (newQty[service.id] || 0) - (oldQty[service.id] || 0);
        return { ...service, stock: Math.max(0, Number(service.stock) - deltaSold) };
    });

    // 2. 庫存異動留下調整紀錄，日後查帳可追溯。
    const inventoryAdjustments = [];
    productIds.forEach(id => {
        const deltaSold = (newQty[id] || 0) - (oldQty[id] || 0);
        if (!deltaSold) return;
        const item = (nextOrder.items || []).find(i => i.id === id) || (oldOrder.items || []).find(i => i.id === id);
        inventoryAdjustments.push({
            id: generateId(), date: new Date().toISOString(),
            type: deltaSold > 0 ? '訂單修改追加' : '訂單修改回沖',
            itemName: item?.name || '未知商品', qty: Math.abs(deltaSold), cost: Number(item?.cost) || 0,
            note: `修改訂單 #${oldOrder.id.slice(0,6)}，庫存${deltaSold > 0 ? '追加扣除' : '回沖'}`,
            operator: 'System'
        });
    });
    const nextTransactions=safeTransactions.map(t=>t.id===nextOrder.id?nextOrder:t);
    const countVisits=(tx,id)=>new Set(tx.filter(t=>t.customerId===id).map(t=>t.visitId||t.id)).size;
    const nextCustomers=safeCustomers.map(c=>{if(c.id!==oldOrder.customerId&&c.id!==nextOrder.customerId)return c;const delta=(nextOrder.customerId===c.id?nextOrder.total:0)-(oldOrder.customerId===c.id?Number(oldOrder.total||0):0);return {...c,visits:Math.max(0,Number(c.visits||0)+countVisits(nextTransactions,c.id)-countVisits(safeTransactions,c.id)),totalSpend:money(Math.max(0,Number(c.totalSpend||0)+delta))};});
    const nextLogs=[...inventoryAdjustments,...safeInventoryLogs];
    try{commitTables({transactions:nextTransactions,customers:nextCustomers,services:updatedServices,inventoryLogs:nextLogs});setTransactions(nextTransactions);setCustomers(nextCustomers);setServices(updatedServices);setInventoryLogs(nextLogs);}catch(e){return showToast(e.message,'error');}
    setEditingOrder(null);
    showToast('訂單已修正，庫存、顧客消費與業績已同步');
};
// 替換你原本的 EditOrderModal
                
                const renderOrder=t=>{

                        const customer = safeCustomers.find(c => c.id === t.customerId);
                        // 優先讀取訂單上記錄的散客性別(customerGender)，如果找不到(代表舊會員訂單)，再去找會員資料夾裡的性別(gender)
                        const gender = t.customerGender || customer?.gender || '女'; 
                        const isVip = (customer?.tags||[]).includes('VIP') || (customer?.totalSpend || 0) >= (safeSettings.vipThreshold ?? 10000);
                                
                                 // 讀取自訂顏色
                                const themeKey = safeSettings.genderColors[gender] || 'slate';
                                const cardClass = getThemeClasses(themeKey, 'card_filled');

                                return (
                                    <div key={t.id} className={`card p-5 relative group transition-all border border-transparent hover:border-slate-300 ${cardClass}`}>
                                        {/* 卡片標頭 */}
                                        <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-2">
                                            <div>
                                                <div className="text-sm font-bold text-slate-800">{new Date(t.date).toLocaleDateString('zh-TW')}</div>
                                                <div className="text-xs text-slate-500 font-mono">{new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-slate-400 font-mono">#{t.id.slice(0,6)}</div>
                                                {isVip && <span className="text-sm" title="VIP客戶">👑</span>}
                                            </div>
                                        </div>

                                        {/* 卡片主體 */}
                                        <div className="flex justify-between items-center mb-3">
                                            <div>
                                                <div className="font-black text-lg text-slate-900 flex items-center gap-1">
                                                    {t.customerName}<span className="block text-xs text-slate-400">{branchName(safeSettings,t.branchId)}</span>
                                                    <span className="text-[10px] bg-white/50 px-1.5 rounded text-slate-600 border border-slate-200">{gender}</span>
                                                </div>
                                                <div className="text-xs text-slate-600 flex items-center gap-1">
                                                    <User size={10}/> {safeStylists.find(s=>s.id===t.mainStylistId)?.name || '未指定'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-black text-xl text-slate-800">{formatCurrency(t.total)}</div>
                                                <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">{t.paymentMethod}</span>
                                            </div>
                                        </div>

                                        {/* 服務標籤 (套用分類顏色) */}
                                        <div className="flex flex-wrap gap-1 mb-1">
                                            {(t.items||[]).map((i, idx) => {
                                                const catThemeKey = i.color || safeSettings.categoryColors[i.category] || 'slate';
                                                const catBadgeClass = getThemeClasses(catThemeKey, 'badge');
                                                return (
                                                    <span key={idx} className={`text-[10px] px-2 py-1 rounded font-bold border border-black/5 ${catBadgeClass}`}>
                                                        {i.name}{i.stylistId&&i.stylistId!==t.mainStylistId?' · '+(safeStylists.find(s=>s.id===i.stylistId)?.name||i.stylistName||'共同服務'):''}{(i.payroll?.helpers||[]).length>0?' · 協助 '+i.payroll.helpers.map(h=>h.name||safeStylists.find(s=>s.id===h.id)?.name||'人員').join('、'):''}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* 懸浮按鈕 */}
                                        <div className="absolute top-4 right-4 flex gap-2 bg-white/90 p-1.5 rounded-lg shadow-sm backdrop-blur-sm border border-slate-100">
                                        <button onClick={()=>setEditingOrder(t)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="編輯"><Edit size={16}/></button>
                                            <button onClick={()=>handleDeleteOrder(t.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="作廢"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                );};
const groups=Object.values(filteredOrders.reduce((acc,t)=>{const id=t.mainStylistId||'unassigned';if(!acc[id])acc[id]={id,name:safeStylists.find(s=>s.id===id)?.name||'未指定',orders:[]};acc[id].orders.push(t);return acc;},Object.create(null)));
                return (
                    <div className="orders-page p-6 h-full overflow-y-auto">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                            
                            
                            <div className="order-filters">
                                <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-300">
                                    <button onClick={() => handleModeChange('month')} className={`px-3 py-1 text-sm rounded-md transition-colors ${dateMode==='month' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>月</button>
                                    <button onClick={() => handleModeChange('date')} className={`px-3 py-1 text-sm rounded-md transition-colors ${dateMode==='date' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>日</button>
                                </div>
                                <input type={dateMode} className="input-field w-auto font-bold" value={queryDate} onChange={e=>setQueryDate(e.target.value)}/>
                                <BranchSelect settings={safeSettings} value={filterBranch} onChange={setFilterBranch} all /><select className="input-field w-32 font-bold" value={filterStylist} onChange={(e) => setFilterStylist(e.target.value)}>
                                    <option value="all">全體人員</option>
                                    {safeStylists.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                </select>
<div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input type="text" className="input-field pl-10" placeholder="搜尋..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/></div>                            </div>
                        </div>

<div className="order-summary">共 {filteredOrders.length} 單 · 實收 {formatCurrency(filteredOrders.reduce((n,t)=>n+Number(t.total||0),0))}</div>
{dateMode==='date'&&filterStylist==='all'?<><p className="group-note">依整單負責人分欄；共同服務人員列於單內，每筆訂單只計一次。</p><div className="designer-board">{groups.map(g=><section key={g.id} className="designer-column"><header><strong>{g.name}</strong><span>{g.orders.length} 單 · 服務 {formatCurrency(g.orders.reduce((n,t)=>n+(t.items||[]).filter(i=>!i.isProduct).reduce((sum,i)=>sum+lineTotal(i),0),0))}<small>實收 {formatCurrency(g.orders.reduce((n,t)=>n+Number(t.total||0),0))}</small></span></header><div>{g.orders.map(renderOrder)}</div></section>)}</div></>:<div className="order-grid">{filteredOrders.map(renderOrder)}</div>}
{filteredOrders.length === 0 && (
                            <div className="text-center py-20 bg-white rounded-xl border border-dashed text-slate-400 flex flex-col items-center gap-2">
                                <ClipboardList size={40} className="opacity-20"/>
                                <span>查無訂單資料</span>
                            </div>
                        )}

                        <details className="card p-4 mt-5"><summary>作廢訂單紀錄</summary>{(safeSettings.voidedOrders||[]).filter(t=>localDate(t.date).startsWith(queryDate)&&branchMatch(t,filterBranch)&&(filterStylist==='all'||t.mainStylistId===filterStylist)).map(t=><div className="consumption-row" key={t.id}><span>{localDate(t.date)} · {t.customerName} · {formatCurrency(t.total)}</span><span>{t.voidReason} · 作廢於 {localDate(t.voidedAt)}</span></div>)}</details>{editingOrder && <EditOrderModal order={editingOrder} onClose={()=>setEditingOrder(null)} onSave={handleUpdateOrder}/>}
                    </div>
                );
            };
const EditOrderModal = ({ order, onClose, onSave }) => {
const {setCustomers,safeCustomers,showToast,safeSettings,safeStylists}=React.useContext(AppContext);

    // 💡 關鍵：我們建立一個與外部完全分離的 Local State
    const [form, setForm] = useState(() => ({ ...JSON.parse(JSON.stringify(order)), items: (order.items || []).map(item => ({ ...item, cartId: item.cartId || generateId(), price: Number(item.price)||0, discount: Number(item.discount)||0, cost: Number(item.cost)||0 })) })); 
    
    // 💡 關鍵：防止輸入框在修改時觸發整個元件的重新對焦與重繪
    const updateItem = useCallback((cartId, field, value) => {
        setForm(prevForm => {
            const newItems = prevForm.items.map(item => 
                item.cartId === cartId ? { ...item, [field]: value } : item
            );
            const newTotal = newItems.reduce((sum, item) => sum + lineTotal(item), 0);
            return { ...prevForm, items: newItems, total: newTotal };
        });
    }, []);

    const deleteItem = useCallback((cartId) => {
        setForm(prevForm => {
            const newItems = prevForm.items.filter(item => item.cartId !== cartId);
            const newTotal = newItems.reduce((sum, item) => sum + lineTotal(item), 0);
            return { ...prevForm, items: newItems, total: newTotal };
        });
    }, []);

    // ... (handleConvertToMember 保持原樣) ...
    const handleConvertToMember = () => {
        const inputName = prompt('請輸入新會員姓名：', form.customerName || '');
        if (!inputName) return;
        const inputPhone = prompt(`請輸入 ${inputName} 的電話號碼：`);
        if (!inputPhone) return;
        const newId = generateId();
        const newCustomer = { id: newId, name: inputName.trim(), phone: inputPhone.trim(), notes: '由查單介面轉入', visits: 0, totalSpend: 0, tags: [] };
        setCustomers([...safeCustomers, newCustomer]);
        setForm({ ...form, customerId: newId, customerName: inputName });
        showToast(`已成功建立會員：${newCustomer.name}`);
    };

    return (
        <Modal title={`編輯訂單 #${order.id.slice(0,8)}`} onClose={onClose} size="max-w-2xl">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border">
                    <div><label className="text-xs font-bold text-slate-500">日期</label><input type="datetime-local" className="input-field" value={localDateTime(form.date)} onChange={e=>setForm({...form, date: e.target.value ? new Date(e.target.value).toISOString() : ''})}/></div>
                    <div><label className="text-xs font-bold text-slate-500">付款方式</label><select className="input-field" value={form.paymentMethod} onChange={e=>setForm({...form, paymentMethod: e.target.value})}>{!safeSettings.paymentMethods.includes(form.paymentMethod)&&<option value={form.paymentMethod}>{form.paymentMethod}（已停用）</option>}{safeSettings.paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label className="text-xs font-bold text-slate-500">整單負責人（各項業績歸屬不變）</label><select className="input-field" value={form.mainStylistId} onChange={e=>setForm({...form, mainStylistId: e.target.value})}>{safeStylists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    <div>
                        <div className="flex justify-between items-end mb-1">
                            <label className="text-xs font-bold text-slate-500">顧客姓名</label>
                            {!form.customerId && (<button onClick={handleConvertToMember} className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700">轉為會員</button>)}
                        </div>
                        <input type="text" className="input-field" value={form.customerName || ''} onChange={e => setForm({...form, customerName: e.target.value})} disabled={!!form.customerId}/>
                    </div>
                </div>
                <div className="border-t pt-4">
                    <h4 className="font-bold mb-2">訂單項目</h4>
                    <div className="space-y-2">
                        {form.items.map((item) => (
                            // 💡 強制使用 item.cartId 作為渲染 Key，確保 DOM 不會被清空重繪
                            <div key={item.cartId} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-slate-50">
                                <div className="flex-1"><div className="font-bold text-sm">{item.name}</div></div>
                                <div className="w-24">
                                    <label className="text-[10px] block text-slate-400">售價</label>
                                    <input type="number" className="input-field py-1 px-2 text-sm" value={item.price} onChange={e=>updateItem(item.cartId, 'price', Number(e.target.value))}/>
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] block text-slate-400">折扣</label>
                                    <input type="number" className="input-field py-1 px-2 text-sm text-red-500" value={item.discount||0} onChange={e=>updateItem(item.cartId, 'discount', Number(e.target.value))}/>
                                </div>
                                <button onClick={()=>deleteItem(item.cartId)} className="text-slate-400 hover:text-red-500 p-2"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </div>
                </div>
                <details className="border-t pt-4"><summary className="font-bold cursor-pointer">業績與抽成明細（依原單制度）</summary><div className="space-y-4 mt-4">{form.items.map(item=>{let ledger,error;try{ledger=item.payroll?calculatePayroll(item,item.payroll.policy,item.payroll.helpers):null;}catch(e){error=e.message;}return <section key={item.cartId} className="border rounded-xl p-3"><h4 className="font-bold mb-2">{item.name}</h4>{error?<p className="payroll-error">{error}</p>:<PayrollBreakdown item={item} ledger={ledger}/>}</section>;})}</div></details>
                <div className="border-t pt-4 flex justify-between items-center"><div className="text-xl font-black text-slate-800">總計: {formatCurrency(form.total)}</div><div className="flex gap-2"><button onClick={onClose} className="btn btn-secondary">取消</button><button onClick={()=>onSave(form)} className="btn btn-primary">儲存修正</button></div></div>
            </div>
        </Modal>
    );
};

        const { useState, useEffect, useMemo, useCallback } = React;

        // --- 1. Icons ---
        const Icon = ({ children, size = 20, className = "" }) => (
            <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
        );
        const Icons = {
            Scissors: (p)=><Icon {...p}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="15.88"/><line x1="14.47" x2="20" y1="14.48" y2="20"/><line x1="8.12" x2="12" y1="8.12" y2="12"/></Icon>,
            User: (p)=><Icon {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
            Settings: (p)=><Icon {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></Icon>,
            Plus: (p)=><Icon {...p}><path d="M5 12h14"/><path d="M12 5v14"/></Icon>,
            Trash2: (p)=><Icon {...p}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></Icon>,
            CreditCard: (p)=><Icon {...p}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></Icon>,
            Banknote: (p)=><Icon {...p}><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></Icon>,
            Smartphone: (p)=><Icon {...p}><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></Icon>,
            CheckCircle: (p)=><Icon {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Icon>,
            Menu: (p)=><Icon {...p}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></Icon>,
            X: (p)=><Icon {...p}><path d="M18 6 6 18"/><path d="M6 6l12 12"/></Icon>,
            Box: (p)=><Icon {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></Icon>,
            Search: (p)=><Icon {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Icon>,
            UserPlus: (p)=><Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></Icon>,
            Save: (p)=><Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></Icon>,
            Download: (p)=><Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>,
            Upload: (p)=><Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Icon>,
            Table: (p)=><Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="3" x2="21" y1="15" y2="15"/><line x1="12" x2="12" y1="3" y2="21"/></Icon>,
            Hand: (p)=><Icon {...p}><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></Icon>,
            Edit: (p)=><Icon {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>,
            LogOut: (p)=><Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></Icon>,
            RefreshCw: (p)=><Icon {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></Icon>,
            UserCog: (p)=><Icon {...p}><circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4.9-.9"/><path d="m15.3 16.4-.9-.9"/><path d="m21.7 13.6.9.9"/><path d="m15.3 13.6-.9.9"/><path d="m18 12v-1"/><path d="m18 19v-1"/></Icon>,
            Tag: (p)=><Icon {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></Icon>,
            PauseCircle: (p)=><Icon {...p}><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></Icon>,
            PlayCircle: (p)=><Icon {...p}><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></Icon>,
            Truck: (p)=><Icon {...p}><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></Icon>,
            DollarSign: (p)=><Icon {...p}><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></Icon>,
            Briefcase: (p)=><Icon {...p}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></Icon>,
            Activity: (p)=><Icon {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></Icon>,
            Droplets: (p)=><Icon {...p}><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.8-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.35" opacity=".5"/></Icon>,
            Zap: (p)=><Icon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>,
            Wifi: (p)=><Icon {...p}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></Icon>,
            Phone: (p)=><Icon {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></Icon>,
            Wallet: (p)=><Icon {...p}><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></Icon>,
            Coffee: (p)=><Icon {...p}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></Icon>,
            TrendingUp: (p)=><Icon {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></Icon>,
            ClipboardList: (p)=><Icon {...p}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></Icon>,
            Palette: (p)=><Icon {...p}><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></Icon>
        };
        const { Scissors, User, Settings, Plus, Trash2, CreditCard, Banknote, Smartphone, CheckCircle, Menu, X, Box, Search, UserPlus, Save, Download, Upload, Table, Hand, Edit, LogOut, RefreshCw, UserCog, Tag, PauseCircle, PlayCircle, Truck, DollarSign, Briefcase, Activity, Droplets, Zap, Wifi, Phone, Wallet, Coffee, TrendingUp, ClipboardList, Palette } = Icons;

        // --- 2. Utils ---
        const formatCurrency = (n) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
        const generateId = () => Math.random().toString(36).substr(2, 9);
        const getCurrentDateTimeLocal = () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            return now.toISOString().slice(0, 16);
        };
        const getCurrentDateLocal = () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            return now.toISOString().slice(0, 10);
        };

        // --- 3. Defaults & Color Themes ---
        const DEFAULT_CATEGORIES = ['剪髮', '洗髮', '染燙', '護理', '造型', '產品'];
        const DEFAULT_EXPENSE_TYPES = ['薪資', '雜物', '水費', '電費', '電話費', '網路費', '房租', '自領料(成本)', '雜支', '員工借支'];
        const DEFAULT_COMMISSION = { '剪髮': 50, '洗髮': 30, '染燙': 45, '護理': 45, '造型': 45, '產品': 10 };
        const DEFAULT_GENDER_COLORS = { '男': 'blue', '女': 'rose', '兒童': 'emerald', '長者': 'amber' };
        const DEFAULT_PAYMENT_METHODS = ['現金', '信用卡', '街口支付', 'LINE Pay', '轉帳'];
        const DEFAULT_CUSTOMER_TYPES = ['女', '男', '兒童', '長者'];
        const DEFAULT_CUSTOMER_TAGS = ['VIP', '新客', '熟客', '染髮', '燙髮', '敏感頭皮'];
        const DEFAULT_STAFF_ROLES = ['設計師', '助理', '店長'];
        
        // 定義可選的顏色主題 (theme.fill = 長條圖顏色)
        const COLOR_THEMES = {
            'slate':  { label: '質感灰', bg: 'bg-slate-50', border: 'border-slate-200', hover: 'hover:border-slate-400 hover:bg-slate-100', text: 'text-slate-600', badge: 'bg-slate-100 text-slate-600', accent: 'border-l-slate-400', card_filled: 'bg-slate-50 border-slate-200', fill: '#64748b' },
            'red':    { label: '熱情紅', bg: 'bg-red-50', border: 'border-red-200', hover: 'hover:border-red-400 hover:bg-red-100', text: 'text-red-600', badge: 'bg-red-100 text-red-600', accent: 'border-l-red-500', card_filled: 'bg-red-50 border-red-200', fill: '#ef4444' },
            'orange': { label: '活力橘', bg: 'bg-orange-50', border: 'border-orange-200', hover: 'hover:border-orange-400 hover:bg-orange-100', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-600', accent: 'border-l-orange-500', card_filled: 'bg-orange-50 border-orange-200', fill: '#f97316' },
            'amber':  { label: '琥珀黃', bg: 'bg-amber-50', border: 'border-amber-200', hover: 'hover:border-amber-400 hover:bg-amber-100', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-600', accent: 'border-l-amber-500', card_filled: 'bg-orange-50 border-orange-200', fill: '#f59e0b' },
            'emerald':{ label: '翡翠綠', bg: 'bg-emerald-50', border: 'border-emerald-200', hover: 'hover:border-emerald-400 hover:bg-emerald-100', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-600', accent: 'border-l-emerald-500', card_filled: 'bg-emerald-50 border-emerald-200', fill: '#10b981' },
            'teal':   { label: '藍綠色', bg: 'bg-teal-50', border: 'border-teal-200', hover: 'hover:border-teal-400 hover:bg-teal-100', text: 'text-teal-600', badge: 'bg-teal-100 text-teal-600', accent: 'border-l-teal-500', card_filled: 'bg-teal-50 border-teal-200', fill: '#14b8a6' },
            'cyan':   { label: '青色',   bg: 'bg-cyan-50', border: 'border-cyan-200', hover: 'hover:border-cyan-400 hover:bg-cyan-100', text: 'text-cyan-600', badge: 'bg-cyan-100 text-cyan-600', accent: 'border-l-cyan-500', card_filled: 'bg-cyan-50 border-cyan-200', fill: '#06b6d4' },
            'blue':   { label: '海洋藍', bg: 'bg-blue-50', border: 'border-blue-200', hover: 'hover:border-blue-400 hover:bg-blue-100', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-600', accent: 'border-l-blue-500', card_filled: 'bg-blue-50 border-blue-200', fill: '#3b82f6' },
            'indigo': { label: '靛青藍', bg: 'bg-indigo-50', border: 'border-indigo-200', hover: 'hover:border-indigo-400 hover:bg-indigo-100', text: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-600', accent: 'border-l-indigo-500', card_filled: 'bg-indigo-50 border-indigo-200', fill: '#6366f1' },
            'violet': { label: '紫羅蘭', bg: 'bg-violet-50', border: 'border-violet-200', hover: 'hover:border-violet-400 hover:bg-violet-100', text: 'text-violet-600', badge: 'bg-violet-100 text-violet-600', accent: 'border-l-violet-500', card_filled: 'bg-violet-50 border-violet-200', fill: '#8b5cf6' },
            'purple': { label: '魔幻紫', bg: 'bg-purple-50', border: 'border-purple-200', hover: 'hover:border-purple-400 hover:bg-purple-100', text: 'text-purple-600', badge: 'bg-purple-100 text-purple-600', accent: 'border-l-purple-500', card_filled: 'bg-purple-50 border-purple-200', fill: '#a855f7' },
            'rose':   { label: '玫瑰粉', bg: 'bg-rose-50', border: 'border-rose-200', hover: 'hover:border-rose-400 hover:bg-rose-100', text: 'text-rose-600', badge: 'bg-rose-100 text-rose-600', accent: 'border-l-rose-500', card_filled: 'bg-rose-50 border-rose-200', fill: '#f43f5e' },
        };

        const DEFAULT_SERVICES = [
            { id: 's1', name: '精緻剪髮', price: 600, category: '剪髮', cost: 0, stock: null, isProduct: false },
            { id: 's4', name: '基礎染髮', price: 1800, category: '染燙', cost: 300, stock: null, isProduct: false },
            { id: 'p1', name: '保濕洗髮精 (500ml)', price: 800, category: '產品', cost: 400, stock: 10, isProduct: true },
        ];
        const DEFAULT_STYLISTS = [
            { id: 'st1', name: 'Eason', role: '設計師', baseSalary: 25000, positionBonus: 5000, attendanceBonus: 3000, commissionRate: 0, useGlobalCommission: true },
            { id: 'st3', name: '小安', role: '助理', baseSalary: 24000, positionBonus: 0, attendanceBonus: 2000, commissionRate: 0, useGlobalCommission: true },
        ];

        // --- 4. Hook ---
const AppContext = React.createContext(null);
const DATA_KEYS={services:'salon_offline_services',stylists:'salon_offline_stylists',customers:'salon_offline_customers',transactions:'salon_offline_transactions',settings:'salon_offline_settings',inventoryLogs:'salon_offline_inventory_logs',expenses:'salon_offline_expenses',pendingOrders:'salon_offline_pending_orders'};
const lineTotal=i=>Math.max(0,(Number(i.price)||0)-(Number(i.discount)||0));
const validLine=i=>Number.isFinite(Number(i.price)) && Number(i.price)>=0 && Number.isFinite(Number(i.discount||0)) && Number(i.discount||0)>=0 && Number(i.discount||0)<=Number(i.price);
const localDateTime=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
const localDate=value=>localDateTime(value).slice(0,10);
function validateStored(key,value) {
 if(key==='salon_offline_settings') {
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('設定格式錯誤');
  if(value.branches!==undefined){if(!Array.isArray(value.branches)||!value.branches.length||value.branches.some(b=>!b||typeof b.id!=='string'||!b.id||typeof b.name!=='string'||!b.name.trim())||new Set(value.branches.map(b=>b.id)).size!==value.branches.length)throw Error('分店設定格式錯誤');if(value.activeBranchId&&!value.branches.some(b=>b.id===value.activeBranchId))throw Error('營業分店不存在');}
  if(value.salarySlips!==undefined){if(!Array.isArray(value.salarySlips)||value.salarySlips.some(s=>!s||!s.id||!s.staffId||!periodBounds('month',s.month)||!Array.isArray(s.rows)||!Array.isArray(s.advanceIds)||!Array.isArray(s.chargeIds)||!Array.isArray(s.workIds)||!Array.isArray(s.transactionIds)||!s.report||!s.report.totals||![s.gross,s.advance,s.charge,s.net].every(Number.isFinite)||s.net!==money(s.gross-s.advance-s.charge)||s.gross!==money(s.rows.reduce((n,r)=>n+Number(r.amount),0)))||new Set(value.salarySlips.map(s=>s.id)).size!==value.salarySlips.length)throw Error('薪資條格式或金額錯誤');const active=value.salarySlips.filter(s=>!s.voidedAt);if(new Set(active.map(s=>s.staffId+':'+s.month)).size!==active.length)throw Error('薪資月份重複');}
  if(value.workLogs!==undefined){if(!Array.isArray(value.workLogs)||value.workLogs.some(r=>!r||typeof r.id!=='string'||!r.id||!r.staffId||!r.branchId||typeof r.date!=='string'||localDate(r.date+'T12:00:00')!==r.date||!Number.isFinite(r.hours)||r.hours<=0||r.hours>24||!Number.isFinite(r.hourlyRate)||r.hourlyRate<0||r.basePay!==money(r.hours*r.hourlyRate))||new Set(value.workLogs.map(r=>r.id)).size!==value.workLogs.length)throw Error('工時紀錄格式或金額錯誤');}
  for(const k of ['categories','expenseTypes','paymentMethods','customerTypes','customerTags','staffRoles'])if(value[k]!==undefined && (!Array.isArray(value[k]) || value[k].some(x=>typeof x!=='string'||!x.trim())))throw Error('設定選項格式錯誤：'+k);
   for(const k of ['categoryColors','roleColors','genderColors','paymentColors','tagColors','commissionRates','productCommissionRates','expenseColors'])if(value[k]!==undefined&&(!value[k]||typeof value[k]!=='object'||Array.isArray(value[k])))throw Error('設定格式錯誤：'+k);
 } else if(key==='salon_offline_draft') {if(!value||typeof value!=='object'||Array.isArray(value)||(value.cart&&!Array.isArray(value.cart)))throw Error('草稿格式錯誤');}
 else {if(!Array.isArray(value)||value.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('資料表格式錯誤：'+key);}
 if(Array.isArray(value)){if(key==='salon_offline_transactions'&&value.some(t=>!Array.isArray(t.items)))throw Error('訂單缺少明細');if(key==='salon_offline_pending_orders'&&value.some(o=>!Array.isArray(o.cart)))throw Error('掛單缺少明細');}
 return value;
}
function normalizeBackupExpense(e,index){
 const fail=reason=>{throw Error('第 '+(index+1)+' 筆支出（'+e.id+'）：'+reason);};
 const result={...e};
 if(!periodBounds('day',e.date)){
  const date=typeof e.date==='string'?e.date:'';
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(date)||!periodBounds('day',date.slice(0,10))||!Number.isFinite(new Date(date).getTime()))fail('日期格式無法辨識');
  // Legacy reports group by the recorded YYYY-MM-DD prefix; retain that accounting day.
  result.legacyDate=e.legacyDate??date;result.date=date.slice(0,10);
 }
 if(typeof e.amount!=='number'&&(typeof e.amount!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(e.amount.trim())))fail('金額不是有效數字');
 result.amount=Number(e.amount);
 if(!Number.isFinite(result.amount)||(!e.salaryCorrectionId&&result.amount<0))fail('金額無效或為負數');
 if((typeof result.type!=='string'||!result.type.trim())&&typeof e.category==='string'&&e.category.trim())result.type=e.category;
 return result;
}
function validateBackup(data) {
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('不是沙龍備份檔');
 for(const k of ['services','stylists','customers','transactions','settings'])if(data[k]===undefined)throw Error('缺少必要資料：'+k);
 data=JSON.parse(JSON.stringify(data));
 // Legacy exports use null (or omit draft) when no working order exists.
 const result={draft:validateStored('salon_offline_draft',data.draft??{})}; for(const [k,key] of Object.entries(DATA_KEYS))result[k]=validateStored(key,data[k]??[]);
 for(const k of ['services','stylists','customers','transactions','expenses','inventoryLogs','pendingOrders']) { const ids=new Set();for(const r of result[k]){if(typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error(k+' 的編號缺少或重複');ids.add(r.id);} }
 for(const x of result.services)if(typeof x.name!=='string'||typeof x.category!=='string'||!Number.isFinite(Number(x.price))||Number(x.price)<0)throw Error('項目名稱、分類或價格錯誤');
 for(const t of result.transactions)for(const i of t.items||[])if(i?.payroll&&!confirmedPayroll(i))throw Error('訂單業績快照與明細不一致');
 for(const t of result.transactions)if(!Array.isArray(t.items)||t.items.some(i=>!i||!validLine(i))||!Number.isFinite(new Date(t.date).getTime())||!Number.isFinite(Number(t.total))||Math.abs(t.items.reduce((sum,i)=>sum+lineTotal(i),0)-Number(t.total))>0.01)throw Error('訂單日期、明細或總額不一致');
 for(const [label,cart]of [['草稿',result.draft?.cart||[]],...result.pendingOrders.map(o=>['掛單 '+o.id,o.cart])]){
  const ids=new Set();for(const i of cart){if(!i||!validLine(i)||typeof i.id!=='string'||!i.id||typeof i.name!=='string')throw Error(label+' 的項目或金額錯誤');if(i.cartId){if(ids.has(i.cartId))throw Error(label+' 的項目編號重複');ids.add(i.cartId);}}
 }
 result.expenses=result.expenses.map(normalizeBackupExpense);
 for(const k of ["cloudKey","syncToken","shopID"])delete result.settings[k];
 verifySalaryLinks(result);
 return result;
}
function restoreSnapshot(data,draft,before){const writes=Object.entries(DATA_KEYS).map(([k,key])=>[key,JSON.stringify(data[k])]);writes.push(['salon_offline_draft',JSON.stringify(draft)]);writeBusinessTables(writes,{beforeRestore:before,force:true});}
function resetBusinessData(){const data={services:DEFAULT_SERVICES,stylists:DEFAULT_STYLISTS,customers:[],transactions:[],settings:{},inventoryLogs:[],expenses:[],pendingOrders:[]};restoreSnapshot(data,{},localRecoveryPoint());}
function persistSnapshot(data,draft) {
 getBusinessStore().assertWritable();saveRecoveryPoint();
 const writes=Object.entries(DATA_KEYS).map(([k,key])=>[key,JSON.stringify(data[k])]);
 if(draft!==undefined)writes.push(['salon_offline_draft',JSON.stringify(draft)]);
 writeBusinessTables(writes);
}
function downloadJSON(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function downloadRaw(){const data={};try{Object.keys(localStorage).filter(k=>k.startsWith('salon_offline_')).forEach(k=>data[k]=localStorage.getItem(k));downloadJSON(data,'salon_offline_raw_recovery.json');}catch(e){alert('無法讀取瀏覽器儲存：'+e.message);}}
let businessStore=null;
function getBusinessStore(){if(!businessStore){businessStore=createBusinessStore({storage:localStorage,locks:typeof navigator!=='undefined'?navigator.locks:null,keys:[...Object.values(DATA_KEYS),'salon_offline_draft'],validate:validateStored,reclaim:()=>{try{localStorage.removeItem('salon_offline_recovery_points');}catch(_){}},onFailure:e=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('salon-storage-error',{detail:e.message}));}});}return businessStore;}
function useStickyState(key,defaultValue){const store=getBusinessStore();store.register(key,defaultValue);const value=React.useSyncExternalStore(store.subscribe,()=>store.get(key),()=>store.get(key));const setter=React.useCallback(updater=>store.set(key,updater),[store,key]);return [value,setter];}
function useDraftField(field,fallback) {const {draft,setDraft}=React.useContext(AppContext);return [draft[field]===undefined?fallback:draft[field],value=>setDraft(prev=>({...prev,[field]:typeof value==='function'?value(prev[field]===undefined?fallback:prev[field]):value}))];}
class AppErrorBoundary extends React.Component {
 constructor(p){super(p);this.state={error:null};}static getDerivedStateFromError(error){return {error};}
 render(){if(this.state.error)return <div style={{maxWidth:640,margin:'60px auto',padding:28,fontFamily:'system-ui'}}><h1>系統暫時無法開啟</h1><p>{this.state.error.message}</p><p>原有資料不會自動清除。請先下載原始資料，交給維護人員檢查。</p><button className="btn btn-primary" onClick={downloadRaw}>下載原始資料</button> <button className="btn btn-secondary" onClick={()=>location.reload()}>重新開啟</button></div>;return this.props.children;}
}
function OptionManager({field,title,colorField}) {
 const {safeSettings,setSettings,safeServices,setServices,safeCustomers,setCustomers,safeStylists,setStylists,safeTransactions,setTransactions,safeExpenses,setExpenses,safePendingOrders,setPendingOrders,draft,setDraft,showToast}=React.useContext(AppContext);
 const [input,setInput]=useState('');const [edit,setEdit]=useState(null);const [name,setName]=useState('');
 const list=safeSettings[field]||[];
 const notify=()=>showToast('設定已更新');
 const add=()=>{const value=input.trim();if(!value)return;if(list.includes(value))return showToast('名稱已存在','error');setSettings(prev=>({...prev,[field]:[...list,value]}));setInput('');notify();};
 const rename=()=>{const value=name.trim();if(!value||value===edit){setEdit(null);return;}if(list.includes(value))return showToast('名稱已存在','error');
  const next={...safeSettings,[field]:list.map(v=>v===edit?value:v)},changes={};
  for(const map of [colorField,field==='categories'?'commissionRates':null,field==='categories'?'productCommissionRates':null].filter(Boolean)){next[map]={...safeSettings[map]};if(Object.hasOwn(next[map],edit)){next[map][value]=next[map][edit];delete next[map][edit];}}
  const item=i=>field==='categories'&&i.category===edit?{...i,category:value}:i;
  const cust=c=>({...c,...(field==='customerTypes'&&c.gender===edit?{gender:value}:{}),...(field==='customerTags'?{tags:(c.tags||[]).map(t=>t===edit?value:t)}:{})});
  if(field==='categories') {changes.services=safeServices.map(item);changes.stylists=safeStylists.map(st=>{const rates={...st.commissionRates};if(Object.hasOwn(rates,edit)){rates[value]=rates[edit];delete rates[edit];}return {...st,commissionRates:rates};});}
  if(['customerTypes','customerTags'].includes(field))changes.customers=safeCustomers.map(cust);
  if(field==='staffRoles')changes.stylists=safeStylists.map(st=>st.role===edit?{...st,role:value}:st);
  if(field==='expenseTypes'&&edit===(safeSettings.advanceExpenseType||'員工借支'))next.advanceExpenseType=value;
  if(field==='expenseTypes'&&edit===(safeSettings.materialExpenseType||'自領料(成本)'))next.materialExpenseType=value;
  if(field==='expenseTypes')changes.expenses=safeExpenses.map(e=>e.type===edit?{...e,type:value}:e);
  if(['categories','customerTypes','paymentMethods'].includes(field))changes.transactions=safeTransactions.map(t=>({...t,items:(t.items||[]).map(item),...(field==='customerTypes'&&t.customerGender===edit?{customerGender:value}:{}),...(field==='paymentMethods'&&t.paymentMethod===edit?{paymentMethod:value}:{})}));
  const updateDraft=d=>({...d,cart:(d.cart||[]).map(item),selectedCustomer:d.selectedCustomer?cust(d.selectedCustomer):null,...(field==='customerTypes'&&d.adHocGender===edit?{adHocGender:value}:{}),...(field==='categories'&&d.selectedCategory===edit?{selectedCategory:value}:{})});
  try{commitTables({...changes,pendingOrders:safePendingOrders.map(updateDraft),draft:updateDraft(draft),settings:next});setEdit(null);notify();}catch(e){showToast(e.message,'error');}
 };
 const remove=v=>{if(field==='expenseTypes'&&[safeSettings.advanceExpenseType||'員工借支',safeSettings.materialExpenseType||'自領料(成本)'].includes(v))return showToast('此分類連動借支或領料，可改名但不能停用','error');if(field!=='customerTags'&&list.length<=1)return showToast('至少保留一個選項','error');
  if(field==='categories'&&(safeServices.some(i=>i.category===v)||safeTransactions.some(t=>(t.items||[]).some(i=>i.category===v))||(draft.cart||[]).some(i=>i.category===v)||safePendingOrders.some(o=>(o.cart||[]).some(i=>i.category===v))))return showToast('分類仍被使用，請改名或先調整所屬項目','error');
  if(field==='expenseTypes'&&safeExpenses.some(e=>e.type===v))return showToast('支出紀錄仍使用此分類，可使用改名','error');
  if(!confirm('停用「'+v+'」？既有紀錄會保留此名稱，新資料不再提供此選項。'))return;
  setSettings(prev=>({...prev,[field]:list.filter(x=>x!==v)}));notify();
 };
 const move=(v,step)=>{const index=list.indexOf(v),to=index+step;if(to<0||to>=list.length)return;const next=[...list];[next[index],next[to]]=[next[to],next[index]];setSettings(prev=>({...prev,[field]:next}));};
 return <section className="option-panel"><h4>{title}</h4><div className="flex gap-2 mb-4"><input aria-label={'新增'+title} className="input-field" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)add();}} placeholder={'新增'+title}/><button className="btn btn-secondary" onClick={add}>新增</button></div><div className="space-y-2">{list.map((v,index)=><div className="option-row" key={v}>{edit===v?<><input aria-label="新名稱" className="input-field" value={name} onChange={e=>setName(e.target.value)}/><button className="btn btn-primary" onClick={rename}>儲存</button><button className="btn btn-secondary" onClick={()=>setEdit(null)}>取消</button></>:<><span className="option-name">{v}</span>{colorField&&<select aria-label={v+'顏色'} className="option-color" style={{color:COLOR_THEMES[safeSettings[colorField]?.[v]||'slate']?.fill}} value={safeSettings[colorField]?.[v]||'slate'} onChange={e=>setSettings(prev=>({...prev,[colorField]:{...prev[colorField],[v]:e.target.value}}))}>{Object.entries(COLOR_THEMES).map(([k,t])=><option value={k} key={k}>{t.label}</option>)}</select>}<button title="往前" aria-label={v+'往前'} disabled={index===0} onClick={()=>move(v,-1)}>↑</button><button title="往後" aria-label={v+'往後'} disabled={index===list.length-1} onClick={()=>move(v,1)}>↓</button><button onClick={()=>{setEdit(v);setName(v);}}>改名</button><button onClick={()=>remove(v)}>停用</button></>}</div>)}</div></section>;
}
        // --- 5. Components ---
        const Modal = ({ title, onClose, children, size="max-w-md" }) => (
            <div className="salon-modal-overlay" role="presentation">
                <section role="dialog" aria-modal="true" aria-label={title} className={'salon-modal '+size}>
                    <header className="salon-modal-header"><h3>{title}</h3><button type="button" aria-label="關閉視窗" onClick={onClose}><X size={20}/></button></header>
                    <div className="salon-modal-body">{children}</div>
                </section>
            </div>
        );

        const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
            if (!isOpen) return null;
            return (
                <div className="salon-confirm-layer fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
                        <p className="text-slate-600 mb-6">{message}</p>
                        <div className="flex gap-3">
                            <button onClick={onCancel} className="btn btn-secondary flex-1">取消</button>
                            <button onClick={onConfirm} className="btn btn-danger flex-1">確定</button>
                        </div>
                    </div>
                </div>
            );
        };

        const QuickCustomerForm = ({ onSave, onCancel, initialData={}, stylists = [], customerTypes = DEFAULT_CUSTOMER_TYPES, customerTags = DEFAULT_CUSTOMER_TAGS }) => {
            const [form, setForm] = useState({ name: '', phone: '', notes: '', preferredStylistId: '', gender: customerTypes[0] || '', tags: [], ...initialData });
            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
<label>姓名<input type="text" className="input-field" placeholder="姓名" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label><div className="quick-member-contact">
<label>電話（選填）<input type="tel" autoComplete="tel" className="input-field" placeholder="輸入電話" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}/></label><label>客群<select className="input-field" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                                {customerTypes.map(g=><option key={g} value={g}>{g}</option>)}
                            </select></label>
                        </div>
                        <div className="border p-2 rounded-lg bg-slate-50">
                            <label className="text-xs font-bold text-slate-500 mb-1 block">專屬設計師 (歸戶用)</label>
                            <select 
                                className="input-field"
                                value={form.preferredStylistId}
                                onChange={e => setForm({...form, preferredStylistId: e.target.value})}
                            >
                                <option value="">未指定 (全店客人)</option>
                                {stylists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-wrap gap-2">{customerTags.map(tag=><button type="button" key={tag} onClick={()=>setForm({...form,tags:form.tags.includes(tag)?form.tags.filter(t=>t!==tag):[...form.tags,tag]})} className={`btn btn-secondary ${form.tags.includes(tag)?'ring-2 ring-amber-500':''}`}>{tag}</button>)}</div><textarea className="input-field" placeholder="備註" rows="3" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => { if (!form.name.trim()) return alert('請輸入顧客姓名'); onSave({...form,name:form.name.trim(),phone:form.phone.trim()}); }} className="btn btn-primary flex-1">建立</button>
                        <button onClick={onCancel} className="btn btn-secondary flex-1">取消</button>
                    </div>
                </div>
            );
        };

        const StatCard = ({ title, value, subValue, icon: IconColor, colorClass }) => (
            <div className={`card p-6 border-l-4 ${colorClass}`}>
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-slate-400 text-sm font-bold mb-1 uppercase tracking-wide">{title}</div>
                        <div className="text-3xl font-black text-slate-800">{value}</div>
                        {subValue && <div className="text-sm text-slate-500 mt-1 font-medium">{subValue}</div>}
                    </div>
                    <div className={`p-3 rounded-xl bg-opacity-10 ${colorClass.replace('border-', 'bg-').replace('500', '100')}`}>
                        <IconColor className={`w-6 h-6 ${colorClass.replace('border-', 'text-')}`} />
                    </div>
                </div>
            </div>
        );

       // --- 6. App ---    
    function HairSalonApp() {
    const [activeTab, setActiveTab] = useState('pos');
    const [draft,setDraft] = useStickyState('salon_offline_draft', {});
    const store=getBusinessStore();
    const storageError=React.useSyncExternalStore(store.subscribe,store.statusSnapshot,store.statusSnapshot);
    const [showGuide,setShowGuide]=useState(false);
    useEffect(()=>{store.start();const other=e=>{if(e.key===STORE_KEY||Object.values(DATA_KEYS).includes(e.key)||e.key==='salon_offline_draft'||e.key===null)store.checkFresh();};const failed=e=>{if(e.error?.salonStorageFailure)e.preventDefault();};const rejected=e=>{if(e.reason?.salonStorageFailure)e.preventDefault();};const pause=()=>store.pause();const resume=e=>{if(e.persisted)window.location.reload();};window.addEventListener('storage',other);window.addEventListener('error',failed);window.addEventListener('unhandledrejection',rejected);window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);return()=>{window.removeEventListener('storage',other);window.removeEventListener('error',failed);window.removeEventListener('unhandledrejection',rejected);window.removeEventListener('pagehide',pause);window.removeEventListener('pageshow',resume);};},[]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [notification, setNotification] = useState(null);

    // States (維持原有的定義)
    const [services, setServices] = useStickyState('salon_offline_services', DEFAULT_SERVICES);
    const [stylists, setStylists] = useStickyState('salon_offline_stylists', DEFAULT_STYLISTS);
    const [customers, setCustomers] = useStickyState('salon_offline_customers', []);
    const [transactions, setTransactions] = useStickyState('salon_offline_transactions', []);
    const [inventoryLogs, setInventoryLogs] = useStickyState('salon_offline_inventory_logs', []);
    const [expenses, setExpenses] = useStickyState('salon_offline_expenses', []);
    const [pendingOrders, setPendingOrders] = useStickyState('salon_offline_pending_orders', []);
    
    const [settings, setSettings] = useStickyState('salon_offline_settings', {
        categories: DEFAULT_CATEGORIES,
        expenseTypes: DEFAULT_EXPENSE_TYPES,
        commissionRates: DEFAULT_COMMISSION,
        deductCostBeforeCommission: true,
        autoBackup: false,
        // --- 雲端授權與同步設定 ---



        // --- 顏色自訂設定 ---
        categoryColors: {},
        roleColors: {},
        genderColors: DEFAULT_GENDER_COLORS,
        paymentMethods: DEFAULT_PAYMENT_METHODS,
        customerTypes: DEFAULT_CUSTOMER_TYPES,
        customerTags: DEFAULT_CUSTOMER_TAGS,
        uiTheme: 'premium',
        staffRoles: DEFAULT_STAFF_ROLES
    });

    // Fallback for missing settings if loading from old data
            const safeSettings = {
                ...settings,
                branches: branchesOf(settings),
                activeBranchId: settings.activeBranchId || branchesOf(settings)[0].id,
                workLogs: settings.workLogs || [],
                shopName: settings.shopName || '專屬空間沙龍',
                paymentColors: settings.paymentColors || {},
                tagColors: settings.tagColors || {},
                categories: settings.categories || DEFAULT_CATEGORIES,
                expenseTypes: settings.expenseTypes || DEFAULT_EXPENSE_TYPES,
                commissionRates: settings.commissionRates || DEFAULT_COMMISSION,
                deductCostBeforeCommission: settings.deductCostBeforeCommission ?? true,
                autoBackup: settings.autoBackup ?? false,
                categoryColors: settings.categoryColors || {},
                roleColors: settings.roleColors || {},



                genderColors: settings.genderColors || DEFAULT_GENDER_COLORS,
                paymentMethods: Array.isArray(settings.paymentMethods) && settings.paymentMethods.length ? settings.paymentMethods : DEFAULT_PAYMENT_METHODS,
                customerTypes: Array.isArray(settings.customerTypes) && settings.customerTypes.length ? settings.customerTypes : DEFAULT_CUSTOMER_TYPES,
                customerTags: Array.isArray(settings.customerTags) ? settings.customerTags : DEFAULT_CUSTOMER_TAGS,
                uiTheme: settings.uiTheme || 'premium',
                staffRoles: Array.isArray(settings.staffRoles) && settings.staffRoles.length ? settings.staffRoles : DEFAULT_STAFF_ROLES
            };

            // Global Safe Data Accessors (Data Guards)
            const safeServices = Array.isArray(services) ? services : [];
            const safeStylists = Array.isArray(stylists) ? stylists : [];
            const safeCustomers = Array.isArray(customers) ? customers.map(normalizeCustomer) : [];
            const safeTransactions = Array.isArray(transactions) ? transactions : [];
            const safeInventoryLogs = Array.isArray(inventoryLogs) ? inventoryLogs : [];
            const safeExpenses = Array.isArray(expenses) ? expenses : [];
            const safePendingOrders = Array.isArray(pendingOrders) ? pendingOrders : [];

            const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

            const confirmAction = (title, message, action) => {
                setConfirmDialog({ isOpen: true, title, message, onConfirm: async () => { await action(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }, onCancel: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })) });
            };

            const showToast = (msg, type = 'success') => {
                if(type==='success'&&getBusinessStore().hasFailure())return;
                setNotification({ msg, type });
                setTimeout(() => setNotification(null), 3000);
            };

            // Helper to get color classes based on settings
            const getThemeClasses = (key, type) => {
                const themeKey = key || 'slate'; // default
                const theme = COLOR_THEMES[themeKey] || COLOR_THEMES['slate'];
                if (type === 'card') return `${theme.bg} ${theme.border} ${theme.hover}`;
                if (type === 'card_filled') return `${theme.card_filled}`;
                if (type === 'badge') return theme.badge;
                if (type === 'accent') return `${theme.accent} bg-white`;
                if (type === 'fill') return theme.fill; // for charts
                return '';
            };

            // --- Views ---

            // [查單管理系統] (v18.0)
            

            // --- Report View ---
            

         // [Inventory View] (v18.7 旗艦版：獨立新增商品 + 進貨廠商 + 領用人員指派)
            




        // [POS View] (v19.5 旗艦完美防護版 - 直擊人心會員連動修正版)
        


            // [StaffView] (v13.0 修正版：防崩潰 + 必填檢查)
            

            

     
            return (
                <AppContext.Provider value={{activeTab,setActiveTab,draft,setDraft,storageError,showGuide,setShowGuide,isMobileMenuOpen,setIsMobileMenuOpen,notification,setNotification,services,setServices,stylists,setStylists,customers,setCustomers,transactions,setTransactions,inventoryLogs,setInventoryLogs,expenses,setExpenses,pendingOrders,setPendingOrders,settings,setSettings,safeSettings,safeServices,safeStylists,safeCustomers,safeTransactions,safeInventoryLogs,safeExpenses,safePendingOrders,confirmDialog,setConfirmDialog,confirmAction,showToast,getThemeClasses}}><div data-theme={safeSettings.uiTheme} style={appearanceStyle(safeSettings)} className="app-shell flex h-screen overflow-hidden bg-slate-100">
                    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 z-20 shadow-sm">
                        <div className="p-6 hidden lg:flex flex items-center gap-3"><div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-200">S</div><div className="font-bold text-lg text-slate-800">{safeSettings.shopName}</div></div>
                        <nav className="flex-1 p-4 space-y-2">
                            {[ {id:'pos', icon:CreditCard, label:'收銀開單'}, {id:'orders', icon:ClipboardList, label:'查單管理'}, {id:'report', icon:Activity, label:'營運報表'}, {id:'customers', icon:User, label:'顧客資料'}, {id:'staff', icon:UserCog, label:'人員管理'}, {id:'salary',icon:Banknote,label:'薪資條'}, {id:'inventory', icon:Box, label:'商品庫存'}, {id:'settings', icon:Settings, label:'店家設定'} ].map(item=>(<button key={item.id} onClick={()=>setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-bold ${activeTab===item.id?'bg-indigo-50 text-indigo-600':'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}><item.icon size={20}/>{item.label}</button>))}
                        </nav>                 
                        <div className="p-4 border-t border-slate-100 text-xs text-center text-slate-400 font-medium">● 本機儲存 · v32.2 單機測試版</div>
                    </aside>
                    
                    {/* 手機版全螢幕選單 */}
                    {isMobileMenuOpen && (
                        <div className="lg:hidden fixed inset-0 bg-slate-900/95 z-[100] pt-[env(safe-area-inset-top)] px-6 text-white animate-fade-in flex flex-col">
                            <div className="flex justify-between items-center py-6 border-b border-white/10">
                                <div className="font-bold text-xl">系統選單</div>
                                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2"><X size={32}/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto pt-4 pb-10">
                                {[ 
                                    {id:'pos', label:'開單'}, {id:'orders', label:'查單'}, {id:'report', label:'報表'}, 
                                    {id:'customers', label:'客資'}, {id:'staff', label:'人員'}, {id:'salary',label:'薪資條'}, {id:'inventory', label:'庫存'}, {id:'settings', label:'設定'} 
                                ].map(item => (
                                    <button key={item.id} onClick={()=>{setActiveTab(item.id); setIsMobileMenuOpen(false);}} className="block text-2xl font-bold w-full text-left py-5 border-b border-white/5 active:bg-white/10">{item.label}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 主內容區 */}
                    <main className="flex-1 w-full h-screen overflow-hidden flex flex-col relative pt-[env(safe-area-inset-top)]">
                        {/* 手機版頂欄 */}
                        <div className="lg:hidden bg-white border-b p-4 h-16 flex justify-between items-center z-30 shadow-sm">
                            <div className="font-bold flex items-center gap-2 text-slate-800">
                                <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">S</div> 專屬空間
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-100 rounded-lg active:bg-slate-200"><Menu size={24}/></button>
                        </div>

                                                <header className="work-header">
                          <div><div className="eyebrow">EXCLUSIVE SPACE</div><h1>{{pos:'收銀開單',orders:'查單管理',report:'營運報表',customers:'顧客資料',staff:'人員管理',salary:'薪資條',inventory:'商品庫存',settings:'店家設定'}[activeTab]}</h1></div>
                          <div className="work-status">{branchesOf(safeSettings).length>1?(<label className="text-xs">營業分店<BranchSelect settings={safeSettings} value={safeSettings.activeBranchId} onChange={id=>{if(draft.cart?.length)return showToast('請先結帳或掛單，再切換營業分店','error');setSettings(p=>({...p,activeBranchId:id}));}} /></label>):<span className="branch-caption">{branchName(safeSettings,safeSettings.activeBranchId)}</span>}</div>
</header>
                        {storageError&&<div role="alert" className="storage-alert"><span>{storageError}</span><div className="flex flex-wrap gap-2 mt-2"><button className="btn btn-secondary" onClick={()=>downloadJSON(localRecoveryPoint(),'salon_offline_current_window.json')}>下載本視窗備份</button><button className="btn btn-secondary" onClick={downloadRaw}>下載原始資料</button><button className="btn btn-secondary" onClick={()=>location.reload()}>重新整理</button></div></div>}
                        <div className="flex-1 min-h-0 overflow-auto bg-slate-50">
                            {activeTab === 'pos' && <POSView />}
                            {activeTab === 'orders' && <OrderView />}
                            {activeTab === 'report' && <ReportView />}
                            {activeTab === 'customers' && <CustomerView />}
                            {activeTab === 'staff' && <StaffView />}{activeTab==='salary'&&<div className="salary-page"><SalaryPanel/></div>}
                            {activeTab === 'inventory' && <InventoryView />}
                            {activeTab === 'settings' && <><div className="settings-tools"><button className="btn btn-secondary" onClick={()=>setShowGuide(true)}>使用說明</button></div><SettingsView /></>}
                        </div>
                    </main>

                    {showGuide&&<Modal title="使用說明與驗收進度" onClose={()=>setShowGuide(false)} size="max-w-2xl"><div className="space-y-5 text-sm leading-relaxed"><section><h3 className="font-bold text-base mb-2">V32.2｜資料安全修正版</h3><p>舊版沒有開單草稿的備份可正常還原。資料編輯成功寫入後才更新畫面；掛單、取單、結帳與還原採整筆保存。取單時目前開單會自動保留為掛單。同一瀏覽器只允許一個開單視窗寫入，其餘視窗為唯讀。儲存失敗會保留原資料，請依提示備份或重試。</p><p>人員管理 → 編輯 → 薪酬設定；工時登記保留在人員管理。每月薪資條從左側「薪資條」進入：核對草稿、確認薪資，再登記已付；可下載列印版。待核對舊單不能結算。已付薪資可登記補發或收回，保留原單與更正紀錄；個人登入權限尚未實作。</p><p>進度：第二階段已通過 57 項自動操作與計算測試，含 30 天模擬對帳、薪資補發收回、備份往返還原、寫入失敗回復與作廢原單保留。真實店家整月核對、Safari 實機、個人登入權限與多裝置保護尚未過關。第三階段安裝／授權／更新、第四階段儲值尚未開始。</p></section><section><h3 className="font-bold text-base mb-2">先帶入原本資料</h3><p>在舊版下載 JSON 備份，再到這一版「店家設定 → 系統維護 → 還原資料」。請先核對顧客數、訂單與庫存。HTML 是程式，客戶和帳務資料另外存在瀏覽器。</p></section><section><h3 className="font-bold text-base mb-2">V26：報表與會員流程</h3><p>營運報表現在只有一個主畫面：日／月／年與分店篩選在上方，店家總業績、所有人員三種業績、服務金額／客次／占比與分類支出接在同頁。電腦看橫表，手機看直式卡片；點服務金額查明細。</p><p className="mt-2">開單的「本單顧客」搜尋姓名或電話，點選後掛在本單；散客可直接建立會員，結帳才增加消費。顧客卡片可帶入開單；停用會員或人員保留歷史，可恢復。庫存可直接編輯品項，數量使用進貨／盤點。</p><p className="mt-2">店家設定可選六種風格、自訂主色、底色、圓角。服務與支出表跟隨分類顏色。薪資支出是手動登記實付金額，非自動薪資結算。</p></section><section><h3 className="font-bold text-base mb-2">V25 功能整併與取捨</h3><ul className="list-disc pl-5 space-y-2"><li>移除開單底下的協助人員預選，統一在每項「業績／協助」處理；舊草稿／掛單已指定的協助人員保留。</li><li>新項目設計師只影響後續加入項目；各項可獨立改人員，整單變更需按「全單改為所選設計師」並確認。</li><li>服務統一比例與分類比例擇一；材料、協助費、服務比例及商品比例在同一區按儲存才生效。</li><li>單項抽成例外與材料／協助費例外分開開關，可只改比例而沿用全店材料規則。</li><li>人員服務與販賣比例分開，修正新增人員會丟失個別比例的問題。舊共用比例保留，後續可分開調整。</li><li>商品類型明確標示，不再偽裝成庫存開關；無效的原材料成本欄停用並說明，舊值保留。</li><li>底薪、全勤、加給暫收進唯讀舊資料；借支不再宣稱自動扣薪。未新增完整薪資結算。</li><li>借支與領料分類改名保留功能；連動分類不可停用。數量、成本與日期輸入加上檢查。</li><li>移除未連接畫面的舊設定與重複雲端函式；原雲端入口收至進階區。雲端可用性未實測，日常優先下載 JSON 備份。</li><li>保留顏色、付款、客群、標籤、職位、分店、VIP 門檻與備份功能。</li></ul></section><section><h3 className="font-bold text-base mb-2">V24 店長總覽與分店</h3><p>店家設定新增分店，頂欄選擇營業分店後再開單。營運報表可篩選分店，查看會員回訪與各店三種業績。人員管理可設定兼職與時薪；工時與時薪頁登記實際時數並保留當次費率。舊單不會自動歸店，庫存仍為共用；這版沒有跨店同步或完整薪資結算。</p></section><section><h3 className="font-bold text-base mb-2">V23 業績與抽成</h3><ol className="list-decimal pl-5 space-y-2"><li>店家設定 → 業績與抽成制度：設定全店材料、協助費及設計師抽成；預設助手百分比按扣材料後計算。</li><li>營業項目 → 編輯：每項可另外設定材料百分比／固定金額、助手百分比／固定金額與設計師比例。</li><li>開單加入服務後，點「業績／協助」：分配一位或多位協助人員並查看計算明細。</li><li>營運報表 → 業績與抽成：切換全店／個人，查看三種金額、各服務客次、數量、占比與合計。</li><li>沒有制度快照的舊單列為待核對，不使用新比例假裝算出歷史抽成。</li></ol></section><section><h3 className="font-bold text-base mb-2">其他功能</h3><ul className="list-disc pl-5 space-y-2"><li>先加入一個項目，再切到查單、回到開單：草稿會保留。</li><li>店家設定 → 營業項目 → 編輯：選項目專屬顏色，回開單就會生效；也能改回跟隨分類色。</li><li>店內規則：付款、客群、標籤、職位、服務分類及支出分類可新增、改名、排序。五類選項可配色。</li><li>店名與畫面：調整店名、兩種介面風格與 VIP 消費門檻。</li><li>修正通知造成頁面重建、會員選取報錯、快速轉會員重複累計，以及台灣凌晨的日期歸屬。</li><li>結帳會檢查金額及庫存；還原前檢查備份格式並保存快照。</li></ul></section><section><h3 className="font-bold text-base mb-2">開啟與保存</h3><p>請用 Safari、Chrome 或 Edge 開啟下載的 HTML。聊天附件或檔案管理器的預覽可能不執行程式。必要程式與樣式已包含在檔案內，收銀不需連網；此版本僅儲存本機資料，不會跨裝置同步。</p><p className="mt-2">保持同一瀏覽器與檔案位置使用，定期下載備份，避免多個視窗同時開單。店家設定是管理入口，並非帳號權限控管。</p></section></div></Modal>}
                    <ConfirmModal {...confirmDialog} />
                    {notification && (
                        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 px-6 py-3 rounded-2xl shadow-2xl z-[110] animate-fade-in text-white font-bold flex items-center gap-2 whitespace-nowrap ${notification.type==='error'?'bg-red-500':'bg-slate-800'}`}>
                            {notification.type==='error'?<X size={20}/>:<CheckCircle size={20}/>} {notification.msg}
                        </div>
                    )}
                </div></AppContext.Provider>
            );
        }

function salaryOrderLocked(settings,order){if(!order)return false;const month=localDate(order.date).slice(0,7);const people=new Set((order.items||[]).flatMap(i=>[i.stylistId,i.assistantId,...(i.payroll?.helpers||i.helpers||[]).map(h=>h.id)]).filter(Boolean));return (settings.salarySlips||[]).some(s=>!s.voidedAt&&s.month===month&&people.has(s.staffId));}
function salaryPrintable(row,shop){const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const rows=[...row.rows,...(row.corrections||[]).filter(c=>c.paidAt&&!c.voidedAt).map(c=>({name:'已完成更正：'+c.reason,amount:c.amount})),{name:'預支抵扣',amount:-row.advance},{name:'個人領料抵扣',amount:-row.charge}];return '<!doctype html><html lang="zh-TW"><meta charset="utf-8"><title>薪資條</title><style>body{font:16px system-ui;color:#263c32;max-width:720px;margin:40px auto;padding:24px}header{border-bottom:2px solid #284c3e;padding-bottom:20px}table{width:100%;border-collapse:collapse;margin:24px 0}td{padding:12px;border-bottom:1px solid #ddd}td:last-child{text-align:right}small{color:#66756c}.total{font-size:24px;text-align:right}button{padding:10px 18px} @media print{button{display:none}body{margin:0}}</style><header><small>'+e(shop)+'</small><h1>'+e(row.staffName)+' · '+e(row.month)+' 薪資條</h1><p>'+e(row.id?(row.paidAt?'已付':'已確認／未付'):'草稿／尚未結算')+'</p></header>'+(row.unknown?'<p>尚有 '+e(row.unknown)+' 項待核對，下列不是完整薪資。</p>':'')+'<table>'+rows.map(r=>'<tr><td>'+e(r.name)+'</td><td>'+e(formatCurrency(r.amount))+'</td></tr>').join('')+'</table><p class="total">'+(row.unknown?'已核對部分':row.paidAt?'累計實付':'本期應付')+' '+e(formatCurrency(row.net+(row.corrections||[]).filter(c=>c.paidAt&&!c.voidedAt).reduce((n,c)=>n+c.amount,0)))+'</p><small>付款日期：'+e(row.paidAt?localDate(row.paidAt):'未付')+'<br>預支已從本期應付抵扣，請勿重複扣款。</small><p><button onclick="window.print()">列印／另存 PDF</button></p></html>';}
function downloadSalaryHTML(row,shop){const u=URL.createObjectURL(new Blob([salaryPrintable(row,shop)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='薪資條_'+row.month+'_'+row.staffId+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}

    const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<AppErrorBoundary><HairSalonApp /></AppErrorBoundary>);
    