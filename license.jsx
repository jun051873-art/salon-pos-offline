import React,{useState,useEffect,useSyncExternalStore} from 'react';
import {isAndroid,nativeCall} from './native-platform.js';
let state={native:isAndroid(),pro:!isAndroid(),ready:false,canPurchase:false,price:'NT$990',message:isAndroid()?'正在確認購買狀態…':'網頁功能預覽，購買請使用 Google Play 商店版'};
const listeners=new Set();
function update(next){state={...state,...next};listeners.forEach(f=>f());}
if(typeof window!=='undefined')window.addEventListener('salon-billing',event=>update(event.detail));
export const hasPro=()=>!isAndroid()||state.pro===true;
export function requirePro(){if(!hasPro())throw Error('此功能需專業版，請到「版本與購買」解鎖或恢復購買');}
export function useLicense(){return useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},()=>state,()=>state);}
export function LicenseAgent(){useEffect(()=>{if(isAndroid())nativeCall('billingState').then(update).catch(e=>update({message:e.message}));},[]);return null;}
export function LicensePanel(){
 const license=useLicense(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const act=async(method)=>{if(busy)return;setBusy(true);setError('');try{update(await nativeCall(method));}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="license-panel card p-6"><div className="license-eyebrow">美髮開單 · 專業版</div><h2>{license.native?(license.pro?'專業版已解鎖':'把經營帳目整理得更完整'):'專業版功能預覽'}</h2><p className="license-price">{license.price}<small> 一次買斷 · 不收年費</small></p><p>包含完整損益、薪資抽成、庫存成本、VIP／儲值、進階報表、裝置內員工權限，以及自己的 Google Drive 加密自動備份。</p><p>基本開單、顧客資料、每日營收、查單與手動備份／還原可免費使用。你的帳目不會上傳到我們的伺服器。備份使用你自己的雲端空間；不含多裝置同步。</p><div className="flex gap-3 flex-wrap">{license.native&&!license.pro&&<button className="btn btn-primary" disabled={busy||!license.canPurchase} onClick={()=>act('purchase')}>一次解鎖專業版</button>}{license.native&&<button className="btn btn-secondary" disabled={busy} onClick={()=>act('restorePurchases')}>恢復購買</button>}</div><p role="status">{busy?'正在處理，請勿重複操作…':license.message}</p>{error&&<p role="alert">{error}</p>}<small>實際價格以 Google Play 付款畫面為準。換機後使用購買時的 Google Play 帳號恢復購買，帳目另由備份還原。退款後停止專業功能，但仍可查單及匯出帳目。</small></section>;
}
export function ProGate({children}){useLicense();return hasPro()?children:<LicensePanel/>;}
