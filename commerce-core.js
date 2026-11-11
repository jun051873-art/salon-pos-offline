// Integer minor units at ledger boundaries. All operations return new values.
export const cents=v=>{if(v===''||v==null||!Number.isFinite(Number(v)))throw Error('請輸入有效金額');const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||Math.abs(n)>1e12)throw Error('金額超出範圍');return n;};
const val=n=>n/100,clone=v=>JSON.parse(JSON.stringify(v));
export function accountingMonth(value){if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return value.slice(0,7);const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('帳務日期無效');return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(d);}
export const balance=(settings,id)=>(settings.walletLedger||[]).filter(r=>r.customerId===id).reduce((a,r)=>({principal:val(cents(a.principal)+cents(r.principal)),bonus:val(cents(a.bonus)+cents(r.bonus))}),{principal:0,bonus:0});
export function walletEntry(settings,input){
 const rows=settings.walletLedger||[];
 if(!input.id||!input.customerId||!input.reason?.trim()||!Number.isFinite(Date.parse(input.at)))throw Error('儲值紀錄缺少人員、時間或原因');
 if(rows.some(r=>r.id===input.id))throw Error('此筆已登記，請重新查看');
 const p=cents(input.principal),b=cents(input.bonus),cash=cents(input.cash||0);
 if(p===0&&b===0)throw Error('儲值異動不可為零');
 const kinds=['topup','payment','refund','withdraw','bonus'];if(!kinds.includes(input.kind))throw Error('儲值類型錯誤');
 if(input.kind==='topup'&&(p<=0||b<0||cash!==p))throw Error('儲值收款與本金不符');
 if(input.kind==='payment'&&(p>0||b>0||cash||!input.orderId))throw Error('儲值扣款不正確');
 if(input.kind==='refund'&&(p<0||b<0||cash||!input.orderId))throw Error('儲值退回不正確');
 if(input.kind==='withdraw'&&(p>=0||b!==0||cash!==p))throw Error('只能退回剩餘本金');
 if(input.kind==='bonus'&&(p!==0||cash))throw Error('贈送金不能列為現金');
 const current=balance(settings,input.customerId);
 if(cents(current.principal)+p<0||cents(current.bonus)+b<0)throw Error('儲值餘額不足，未扣款');
 return {...settings,walletLedger:[...rows,{...clone(input),principal:val(p),bonus:val(b),cash:val(cash),reason:input.reason.trim()}]};
}
export function chargeWallet(settings,customerId,amount,meta){
 const n=cents(amount);if(n<=0)throw Error('儲值付款須大於零');
 if((settings.walletLedger||[]).some(r=>r.kind==='payment'&&r.orderId===meta.orderId))throw Error('這張訂單已扣過儲值');
 const available=balance(settings,customerId),bonusFirst=settings.vipPolicy?.bonusFirst===true;
 const first=Math.min(n,cents(bonusFirst?available.bonus:available.principal)),second=n-first;
 return walletEntry(settings,{...meta,customerId,kind:'payment',principal:val(-(bonusFirst?second:first)),bonus:val(-(bonusFirst?first:second)),cash:0,reason:'訂單儲值扣款'});
}
export function refundWallet(settings,orderId,amount,meta){
 const paid=(settings.walletLedger||[]).find(r=>r.orderId===orderId&&r.kind==='payment');if(!paid)throw Error('找不到原儲值扣款');
 const returned=(settings.walletLedger||[]).filter(r=>r.orderId===orderId&&r.kind==='refund');
 const p=-cents(paid.principal)-returned.reduce((n,r)=>n+cents(r.principal),0),b=-cents(paid.bonus)-returned.reduce((n,r)=>n+cents(r.bonus),0),n=cents(amount);
 if(n<=0||n>p+b)throw Error('退回超過原儲值扣款');
 // Restore gift first, preventing gift funds from turning into refundable principal.
 const gift=Math.min(n,b);
 return walletEntry(settings,{...meta,orderId,customerId:paid.customerId,kind:'refund',principal:val(n-gift),bonus:val(gift),cash:0,reason:meta.reason||'訂單退款回儲值'});
}
export function validateCommerce(settings){
 const ids=new Set(),balances=new Map(),payments=new Map(),refunds=new Map();
 for(const r of settings.walletLedger||[]){
  if(!r.id||ids.has(r.id)||!r.customerId||!Number.isFinite(Date.parse(r.at)))throw Error('儲值紀錄編號或日期錯誤');ids.add(r.id);
  const prior=balances.get(r.customerId)||{principal:0,bonus:0};
  const checked=walletEntry({walletLedger:prior.principal||prior.bonus?[{id:'_opening',customerId:r.customerId,principal:prior.principal,bonus:prior.bonus}]:[]},r);
  const p=val(cents(prior.principal)+cents(r.principal)),b=val(cents(prior.bonus)+cents(r.bonus));balances.set(r.customerId,{principal:p,bonus:b});
  if(r.kind==='payment'){if(payments.has(r.orderId))throw Error('重複儲值扣款');payments.set(r.orderId,{customerId:r.customerId,principal:-cents(r.principal),bonus:-cents(r.bonus)});}
  if(r.kind==='refund'){const paid=payments.get(r.orderId),previous=refunds.get(r.orderId)||{principal:0,bonus:0};const sum={principal:previous.principal+cents(r.principal),bonus:previous.bonus+cents(r.bonus)};if(!paid||paid.customerId!==r.customerId||sum.principal>paid.principal||sum.bonus>paid.bonus)throw Error('儲值退款超額或本金與贈送金不符');refunds.set(r.orderId,sum);}
 }
 const cashIds=new Set();for(const r of settings.orderSettlements||[]){if(!r.id||cashIds.has(r.id)||!r.orderId||!Number.isFinite(Date.parse(r.at))||!cents(r.amount)||!r.method||!r.reason)throw Error('改單收付款紀錄錯誤');cashIds.add(r.id);}
 for(const tier of settings.vipTiers||[]){if(!tier.id||!tier.name?.trim()||!Number.isFinite(Number(tier.threshold))||Number(tier.threshold)<0||!Number.isFinite(Number(tier.discountPercent))||Number(tier.discountPercent)<0||Number(tier.discountPercent)>100)throw Error('VIP 等級設定錯誤');}
 if(new Set((settings.vipTiers||[]).map(t=>t.id)).size!==(settings.vipTiers||[]).length)throw Error('VIP 等級編號重複');
 return settings;
}
export function vipTier(settings,customer){if(!customer)return null;const tiers=settings.vipTiers||[];if(customer.vipTierId==='none')return null;if(customer.vipTierId)return tiers.find(t=>t.id===customer.vipTierId&&!t.disabled)||null;return tiers.filter(t=>!t.disabled&&Number(customer.totalSpend||0)>=Number(t.threshold)).sort((a,b)=>Number(b.threshold)-Number(a.threshold))[0]||null;}
export function vipPrice(settings,customer,item){const tier=vipTier(settings,customer);if(!tier||(item.isProduct&&!settings.vipPolicy?.includeProducts))return {...item};const discount=val(Math.round(cents(item.price)*Number(tier.discountPercent)/100));return {...item,discount:Math.max(Number(item.discount||0),discount),vip:{tierId:tier.id,name:tier.name,discountPercent:Number(tier.discountPercent)}};}
export function orderPaid(order,settings){const initial=Number(order.receipt?.amount??order.revisionHistory?.[0]?.total??order.total);return val(cents(initial)+(settings.orderSettlements||[]).filter(r=>r.orderId===order.id).reduce((n,r)=>n+cents(r.amount),0));}
export function orderDue(order,settings){return val(cents(order.total)-cents(orderPaid(order,settings)));}
export function settleOrderDifference(order,settings,amount,meta){if(order.paymentMethod==='儲值')throw Error('儲值訂單請使用退貨退款，不能另收現金差額');if(order.productReturnIds?.length)throw Error('退貨訂單請使用退貨退款入口');const due=orderDue(order,settings);if(!due||cents(amount)!==cents(due))throw Error('差額已變更或已完成，請重新查看');if((settings.orderSettlements||[]).some(r=>r.id===meta.id))throw Error('已登記差額');return {...settings,orderSettlements:[...(settings.orderSettlements||[]),{...meta,orderId:order.id,amount:due,branchId:order.branchId||'',reason:meta.reason||'修改訂單差額'}]};}
export function cashBook(transactions,expenses,settings){
 const rows=[];for(const t of [...transactions,...(settings.voidedOrders||[])]){if(t.paymentMethod==='儲值')continue;const receipt=t.receipt||{at:t.createdAt||t.date,amount:t.revisionHistory?.[0]?.total??t.total,method:t.paymentMethod};if(t.refund?.status!=='notCollected')rows.push({id:'order:'+t.id,at:receipt.at,amount:Number(receipt.amount),method:receipt.method,kind:'開單收款',branchId:t.branchId,orderId:t.id});if(t.refund?.status==='paid'&&t.refund.method!=='儲值')rows.push({id:'void:'+t.id,at:t.refund.paidAt,amount:-t.refund.amount,method:t.refund.method,kind:'作廢退款',branchId:t.branchId});}
 for(const r of settings.productReturns||[])if(r.status==='paid'&&r.method!=='儲值')rows.push({id:'return:'+r.id,at:r.paidAt,amount:-r.amount,method:r.method,kind:'退貨退款',branchId:r.branchId});
 for(const r of settings.orderSettlements||[])rows.push({...r,kind:r.amount>0?'改單補收':'改單退差額'});
 for(const r of settings.walletLedger||[])if(r.cash)rows.push({...r,amount:r.cash,kind:r.cash>0?'會員儲值收款':'儲值本金退回'});
 for(const e of expenses)rows.push({id:'expense:'+e.id,at:e.date,amount:-Number(e.amount),kind:e.type,branchId:e.branchId,method:e.method||'未指定'});
 return rows.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
export function incomeStatement({transactions,expenses,settings,inventoryLogs,staff,month,salaryDraft,performanceData}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('請選擇月份');
 const tx=transactions.filter(t=>accountingMonth(t.date)===month),report=performanceData(tx),items=tx.flatMap(t=>t.items||[]);
 const revenue=val(items.reduce((n,i)=>n+cents(i.price)-cents(i.discount||0),0));
 const productCost=val(items.filter(i=>i.isProduct).reduce((n,i)=>n+cents(i.cost||0),0));
 const logs=inventoryLogs.filter(l=>accountingMonth(l.date)===month);
 const material=settings.profitPolicy?.materialSource==='inventory'?val(logs.filter(l=>l.type==='領用'&&!l.staffCharge).reduce((n,l)=>n+cents(l.consumedCost||0),0)):Number(report.totals.material||0);
 const personalUseCost=val(logs.filter(l=>l.type==='領用'&&l.staffCharge).reduce((n,l)=>n+cents(l.consumedCost||0),0));
 const stockLoss=val(logs.filter(l=>['盤點-','退貨報廢'].includes(l.type)).reduce((n,l)=>n+cents(Number(l.cost||0)*Number(l.qty||0)),0));
 const unreturnedCost=val((settings.voidedOrders||[]).filter(t=>accountingMonth(t.voidedAt)===month&&t.items?.some(i=>i.isProduct)&&!t.returnStock&&!inventoryLogs.some(l=>l.orderId===t.id&&l.type==='作廢回沖')).reduce((n,t)=>n+t.items.filter(i=>i.isProduct).reduce((a,i)=>a+cents(i.cost||0),0),0));
 const payrollRows=staff.map(s=>{const saved=(settings.salarySlips||[]).find(r=>r.staffId===s.id&&r.month===month&&!r.voidedAt);const d=saved||salaryDraft(s,month,transactions,expenses,settings,inventoryLogs);return {name:s.name,gross:d.gross,charge:d.charge,confirmed:!!saved,unknown:d.unknown||0};});
 const payroll=val(payrollRows.reduce((n,r)=>n+cents(r.gross)-cents(r.charge||0),0)+(settings.salarySlips||[]).reduce((n,s)=>n+(s.corrections||[]).filter(c=>c.paidAt&&!c.voidedAt&&accountingMonth(c.paidAt)===month).reduce((a,c)=>a+cents(c.amount),0),0));
 const operatingRows=expenses.filter(e=>accountingMonth(e.date)===month&&!e.salarySlipId&&!e.inventoryLogId&&!e.isAdvance&&e.type!==(settings.advanceExpenseType||'員工借支')&&e.profitClass!=='exclude');
 const operating=val(operatingRows.reduce((n,e)=>n+cents(e.amount),0));
 const giftCost=val((settings.walletLedger||[]).filter(r=>r.kind==='payment').reduce((n,r)=>{const order=tx.find(t=>t.id===r.orderId);if(!order)return n;const original=-cents(r.principal)-cents(r.bonus),reversed=Math.max(0,original-cents(order.total));return n+Math.max(0,-cents(r.bonus)-reversed);},0));
 const totalCost=val([productCost,material,personalUseCost,stockLoss,unreturnedCost,payroll,operating,giftCost].reduce((n,v)=>n+cents(v),0));
 return {revenue,productCost,material,personalUseCost,stockLoss,unreturnedCost,payroll,operating,giftCost,totalCost,profit:val(cents(revenue)-cents(totalCost)),payrollRows,operatingRows,unknown:Number(report.totals.unknown||0)+Number(report.totals.productUnknown||0)+items.filter(i=>i.isProduct&&i.cost==null).length,payrollEstimated:payrollRows.some(r=>!r.confirmed)};
}
