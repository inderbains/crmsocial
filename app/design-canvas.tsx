'use client';
import {useEffect,useRef} from 'react';
import {templates,type Draft,type Brand} from '../lib/designs';

/** Social artwork is rendered locally in a 1080x1080 canvas; no listing content leaves the browser. */
export default function DesignCanvas({draft,brand,onError}:{draft:Draft;brand:Brand;onError?:(s:string)=>void}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  let cancelled=false; const canvas=ref.current; const ctx=canvas?.getContext('2d'); if(!ctx||!canvas)return;
  const template=templates[draft.template]||templates[0];
  const style=template.style;
  const editorial=style==='editorial',dark=style==='dark',signature=style==='signature',luxury=style==='luxury';
  const deep='#173d32',cream='#f6f5ef',orange='#dd572d';
  const color=/^#[0-9a-f]{6}$/i.test(brand.color)?brand.color:deep;
  function wrap(value:string,maxWidth:number,font:string,maxLines:number){
   if(!ctx)return [] as string[]; ctx.font=font;
   const words=(value||'').trim().split(/\s+/).filter(Boolean),lines:string[]=[]; let current='';
   for(const word of words){const candidate=current?current+' '+word:word;
    if(current&&ctx.measureText(candidate).width>maxWidth){lines.push(current);current=word;} else current=candidate;
   }if(current)lines.push(current);
   return lines.slice(0,maxLines);
  }
  function draw(image?:HTMLImageElement){
   if(cancelled||!ctx||!canvas)return;
   ctx.clearRect(0,0,1080,1080); ctx.fillStyle=editorial||luxury?cream:color;ctx.fillRect(0,0,1080,1080);
   const box:[number,number,number,number]=signature?[55,185,970,640]:luxury?[55,120,970,540]:editorial?[0,425,1080,580]:dark?[90,395,900,550]:[0,0,1080,1080];
   if(image){ctx.save();ctx.beginPath();ctx.rect(...box);ctx.clip();const scale=Math.max(box[2]/image.width,box[3]/image.height);ctx.drawImage(image,box[0]+(box[2]-image.width*scale)/2,box[1]+(box[3]-image.height*scale)/2,image.width*scale,image.height*scale);ctx.restore();}
   else {ctx.fillStyle='#dce5da';ctx.fillRect(...box);ctx.fillStyle=deep;ctx.font='28px Arial';ctx.fillText('ADD PROPERTY PHOTO',box[0]+35,box[1]+box[3]/2);}
   if(!editorial&&!dark&&!signature&&!luxury){const gradient=ctx.createLinearGradient(0,430,0,1080);gradient.addColorStop(0,'#102f2900');gradient.addColorStop(1,'#102f29f5');ctx.fillStyle=gradient;ctx.fillRect(0,390,1080,690);}
   if(signature){ctx.fillStyle=cream;ctx.fillRect(0,0,1080,175);ctx.fillStyle=color;ctx.fillRect(0,825,1080,255);ctx.fillStyle=orange;ctx.fillRect(55,152,120,7);}
   if(luxury){ctx.fillStyle=color;ctx.fillRect(0,660,1080,420);ctx.fillStyle=orange;ctx.fillRect(55,650,130,10);}
   if(dark){ctx.fillStyle='#0000006b';ctx.fillRect(...box);}
   const headlineFont=signature?'bold 60px Arial':luxury?'bold 63px Georgia':'64px Georgia';
   ctx.fillStyle=signature||editorial?deep:'#ffffff';ctx.font='bold 24px Arial';ctx.fillText(template.category.toUpperCase(),65,80);
   if(signature){ctx.fillStyle=deep;ctx.font=headlineFont;const title=wrap(draft.title,940,headlineFont,1);ctx.fillText(title[0]||'',65,137);}
   else {ctx.fillStyle=editorial?deep:'#ffffff';ctx.font=headlineFont;const headline=wrap(draft.title,930,headlineFont,3);const y=luxury?756:editorial||dark?160:815-(headline.length-1)*73;headline.forEach((line,index)=>ctx.fillText(line,65,y+index*73));}
   const textColor=signature||luxury?'#ffffff':editorial?deep:'#ffffff';
   ctx.fillStyle=textColor;
   if(draft.listingAddress){ctx.font='bold 30px Arial';const lines=wrap(draft.listingAddress,935,'bold 30px Arial',2);let y=signature?884:luxury?925:editorial?985:950;
     if(editorial){ctx.fillStyle=deep;}lines.forEach((line,i)=>ctx.fillText(line,65,y+i*36));}
   if(draft.listingPrice){ctx.fillStyle=signature||luxury?'#ffffff':editorial?deep:'#ffffff';ctx.font='bold 38px Arial';ctx.fillText(draft.listingPrice,65,signature?980:luxury?1004:editorial?902:1030);}
   const specs=[draft.beds&&`${draft.beds} BD`,draft.baths&&`${draft.baths} BA`,draft.propertyArea&&`${draft.propertyArea} SQFT`].filter(Boolean).join('  ·  ');
   if(specs){ctx.fillStyle=signature||luxury?'#ffffff':editorial?deep:'#ffffff';ctx.font='23px Arial';ctx.fillText(specs,signature?385:luxury?390:editorial?410:360,signature?979:luxury?1004:editorial?902:1030,600);}
   // Bottom strip always includes agent / brokerage identity, even for drafts not linked to a listing.
   if(!signature&&!luxury){ctx.fillStyle=editorial?deep:'rgba(15,45,37,.93)';ctx.fillRect(0,1017,1080,63);}
   const agent=(draft.agentName||brand.name).slice(0,55),contact=(draft.agentPhone||draft.agentEmail||brand.website).slice(0,55);
   ctx.fillStyle=signature||luxury?'#ffffff':'#ffffff';ctx.font='bold 22px Arial';
   ctx.fillText(agent,65,1055,430);ctx.font='20px Arial';ctx.textAlign='right';ctx.fillText(contact,1015,1055,530);ctx.textAlign='left';
   canvas.dataset.ready=image?'true':'false';
  }
  draw();if(!draft.photo){return()=>{cancelled=true};}
  const img=new Image();img.crossOrigin='anonymous';img.onload=()=>draw(img);img.onerror=()=>onError?.('Photo could not load. Select an owned property page or upload an authorized photo to export.');img.src=draft.photo;
  return()=>{cancelled=true};
 },[draft,brand,onError]);
 return <canvas ref={ref} width={1080} height={1080} style={{display:'block',width:'100%',height:'auto'}} role="img" aria-label={`${templates[draft.template]?.name||'RealVolt social design'}: ${draft.title}`}/>;
}
