// MIT-licensed QRCode for JavaScript (Kazuhiko Arase) bundled locally: no remote QR service.
import QRCode from './vendor/qrcode/index.js';
import QRErrorCorrectLevel from './vendor/qrcode/QRErrorCorrectLevel.js';
export function qrMatrix(value:string):boolean[][]{
 if(!/^https?:\/\//.test(value))throw new Error('QR data must be a web URL');
 const qr=new QRCode(0,QRErrorCorrectLevel.M);
 qr.addData(value);qr.make();
 const count=qr.getModuleCount();
 return Array.from({length:count},(_,y)=>Array.from({length:count},(_,x)=>Boolean(qr.isDark(y,x))));
}
