/** Browser-only export of authorized closed-file documents. No new package or cloud service. */
export type ArchiveZipFile={name:string;data:Uint8Array};
const MAX_ZIP_SIZE=250*1024*1024;
const enc=new TextEncoder();
function crc32(data:Uint8Array){let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function safeName(name:string){const clean=name.replace(/[\\/\x00-\x1f\x7f:*?"<>|]/g,'_').replace(/^\.+$/,'document').trim();return clean.slice(0,145)||'document'}
export function downloadName(name:string){return safeName(name)}
function put16(view:DataView,at:number,value:number){view.setUint16(at,value,true)}
function put32(view:DataView,at:number,value:number){view.setUint32(at,value>>>0,true)}
/** Use real ArrayBuffer values for BlobPart under TypeScript's strict typed-array definitions. */
function toBlobArrayBuffer(bytes: Uint8Array): ArrayBuffer {
 const {buffer, byteOffset, byteLength}=bytes;
 if(buffer instanceof ArrayBuffer){
  return byteOffset===0 && byteLength===buffer.byteLength ? buffer : buffer.slice(byteOffset,byteOffset+byteLength);
 }
 // SharedArrayBuffer-backed input must be copied to a standard ArrayBuffer for Blob.
 const copy=new Uint8Array(new ArrayBuffer(byteLength));
 copy.set(bytes);
 return copy.buffer;
}
/** Standard ZIP-store format. Files are not compressed, but remain downloadable in one ZIP. */
export function makeClosedFileZip(files:ArchiveZipFile[]):Blob{
 if(!files.length)throw new Error('No downloadable documents were found in this closed file.');
 if(files.length>500)throw new Error('Too many documents for a browser ZIP. Download individually.');
 const names=new Set<string>();const localParts:Uint8Array[]=[];const centralParts:Uint8Array[]=[];
 let offset=0,centralLength=0,total=0;
 for(const f of files){
  total+=f.data.byteLength;
  if(total>MAX_ZIP_SIZE)throw new Error('Documents exceed the 250 MB ZIP limit. Download large files individually.');
  const parts=f.name.split('/');const folder=parts.length>1?parts.slice(0,-1).map(safeName).join('/')+'/':'';
  const stem=safeName(parts[parts.length-1]);
  let filename=folder+stem;let suffix=2;
  while(names.has(filename.toLocaleLowerCase())){
   const dot=stem.lastIndexOf('.');const name=dot>0?stem.slice(0,dot):stem;const ext=dot>0?stem.slice(dot):'';
   filename=`${folder}${name} (${suffix++})${ext}`;
  }
  names.add(filename.toLocaleLowerCase());
  const utf8=enc.encode(filename);
  if(utf8.length>0xffff)throw new Error('A document filename is too long for ZIP.');
  const size=f.data.byteLength,crc=crc32(f.data);
  const local=new Uint8Array(30+utf8.length);const lv=new DataView(local.buffer);
  put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x800);put16(lv,8,0);put16(lv,10,0);put16(lv,12,0);
  put32(lv,14,crc);put32(lv,18,size);put32(lv,22,size);put16(lv,26,utf8.length);put16(lv,28,0);local.set(utf8,30);
  localParts.push(local,f.data);
  const central=new Uint8Array(46+utf8.length);const cv=new DataView(central.buffer);
  put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x800);put16(cv,10,0);put16(cv,12,0);put16(cv,14,0);
  put32(cv,16,crc);put32(cv,20,size);put32(cv,24,size);put16(cv,28,utf8.length);put16(cv,30,0);put16(cv,32,0);
  put16(cv,34,0);put16(cv,36,0);put32(cv,38,0);put32(cv,42,offset);central.set(utf8,46);
  centralParts.push(central);
  offset+=local.length+size;centralLength+=central.length;
 }
 const end=new Uint8Array(22);const dv=new DataView(end.buffer);
 put32(dv,0,0x06054b50);put16(dv,4,0);put16(dv,6,0);put16(dv,8,files.length);put16(dv,10,files.length);
 put32(dv,12,centralLength);put32(dv,16,offset);put16(dv,20,0);
 return new Blob([...localParts,...centralParts,end].map(toBlobArrayBuffer),{type:'application/zip'});
}
export function saveLocalBlob(blob:Blob,filename:string){
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement('a');anchor.href=url;anchor.download=downloadName(filename);document.body.append(anchor);anchor.click();anchor.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
