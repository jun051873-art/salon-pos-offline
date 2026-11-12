// Keep dialogs inside the actual visible area when a mobile keyboard opens.
export function installViewport(win=window){
 const doc=win.document,viewport=win.visualViewport;
 let frame=0,settle=0;
 function reveal(){
  const field=doc.activeElement;
  if(!field?.matches('input,textarea,select,[contenteditable="true"]'))return;
  const rect=field.getBoundingClientRect(),top=viewport?.offsetTop||0,height=viewport?.height||win.innerHeight;
  const body=field.closest('.salon-modal-body'),bounds=body?.getBoundingClientRect();
  const low=Math.max(top+24,bounds?bounds.top+24:0),high=Math.min(top+height-32,bounds?bounds.bottom-32:Infinity);
  if(rect.bottom>high||rect.top<low){
   if(body)body.scrollTop+=rect.top-(low+Math.max(0,(high-low-rect.height)/2));
   else field.scrollIntoView?.({block:'center',inline:'nearest',behavior:'instant'});
  }
 }
 function update(){
  win.cancelAnimationFrame(frame);
  frame=win.requestAnimationFrame(()=>{
   // Pinch zoom is left to the browser; it should not resize the application.
   const zoomed=viewport&&Math.abs(viewport.scale-1)>0.05;
   doc.documentElement.style.setProperty('--salon-view-height',(zoomed?win.innerHeight:viewport?.height||win.innerHeight)+'px');
   doc.documentElement.style.setProperty('--salon-view-top',(zoomed?0:viewport?.offsetTop||0)+'px');
   reveal();
  });
 }
 function focus(){update();win.clearTimeout(settle);settle=win.setTimeout(update,350);}
 win.addEventListener('resize',update);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);doc.addEventListener('focusin',focus);update();
 return ()=>{win.cancelAnimationFrame(frame);win.clearTimeout(settle);win.removeEventListener('resize',update);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);doc.removeEventListener('focusin',focus);};
}
if(typeof window!=='undefined')installViewport();
