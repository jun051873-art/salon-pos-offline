const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),target=path.join(root,'android/app/src/main/assets');
fs.mkdirSync(target,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\' data:; connect-src \'self\' blob:; frame-src \'none\'; object-src \'none\'; base-uri \'self\'"><script>window.__SALON_ANDROID__=true;</script>');
fs.writeFileSync(path.join(target,'index.html'),html);
for(const file of ['icon-192.png','icon-512.png','manifest.webmanifest'])fs.copyFileSync(path.join(root,file),path.join(target,file));
console.log('Android offline assets prepared');
