const requests=new Map();
export const isAndroid=()=>globalThis.window?.__SALON_ANDROID__===true;
export function nativeCall(method,params={}){
  if(!isAndroid()||!window.SalonNative?.postMessage)return Promise.reject(Error('此功能需使用 Android 商店版'));
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{requests.delete(id);reject(Error('操作逾時，請確認結果後重試'));},180000);
    requests.set(id,{resolve,reject,timer});
    try{window.SalonNative.postMessage(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);requests.delete(id);reject(e);}
  });
}
if(typeof window!=='undefined'){
  window.__salonNativeReply=response=>{const p=requests.get(response.id);if(!p)return;clearTimeout(p.timer);requests.delete(response.id);if(response.error)p.reject(Error(response.error));else p.resolve(response.result);};
  if(isAndroid()){
    const originalClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      if(this.download&&this.href.startsWith('blob:')){fetch(this.href).then(r=>r.text()).then(text=>nativeCall('saveText',{text,name:this.download})).catch(e=>window.alert(e.message));return;}
      return originalClick.call(this);
    };
    window.print=()=>nativeCall('print').catch(e=>window.alert(e.message));
  }
}
