const esbuild=require('esbuild'),fs=require('fs');
const dir=__dirname;
fs.writeFileSync(dir+'/entry.jsx','import React from "react";\nimport * as ReactDOM from "react-dom/client";\nimport {createBusinessStore,STORE_KEY} from "./business-store.js";\n'+fs.readFileSync(dir+'/app.jsx','utf8'));
esbuild.buildSync({entryPoints:[dir+'/entry.jsx'],bundle:true,minify:true,outfile:dir+'/app.js',target:['safari15.4','chrome100'],nodePaths:[process.env.SALON_NODE_MODULES||dir+'/node_modules'],define:{'process.env.NODE_ENV':'"production"'}});
const js=fs.readFileSync(dir+'/app.js','utf8').replace(/<\/script/gi,'<\\/script');
fs.writeFileSync(dir+'/index.html',fs.readFileSync(dir+'/shell.html','utf8')+'<script>'+js+'</script></body></html>');
console.log('Built v32.1',fs.statSync(dir+'/index.html').size);
