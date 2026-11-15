import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(root,'node_modules/pdfjs-dist'),target=path.join(root,'public/vendor/pdfjs');
if(!fs.existsSync(path.join(source,'build/pdf.worker.min.mjs')))throw new Error('Install dependencies before preparing SignVolt PDF assets');
// This directory contains only generated third-party PDF.js assets.
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
fs.copyFileSync(path.join(source,'build/pdf.worker.min.mjs'),path.join(target,'pdf.worker.min.mjs'));fs.copyFileSync(path.join(source,'LICENSE'),path.join(target,'LICENSE'));
for(const name of ['cmaps','standard_fonts','wasm'])if(fs.existsSync(path.join(source,name)))fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true});
console.log('Prepared matching SignVolt PDF worker, fonts, CMaps and decoders.');
