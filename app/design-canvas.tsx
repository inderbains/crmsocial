'use client';
import {useEffect,useRef} from 'react';
import {designSize,templates,type Draft,type Brand} from '../lib/designs';

const DEEP='#173d32';
const CREAM='#f6f5ef';
const ORANGE='#df642d';
function colorOr(value:string|undefined, fallback:string){return value&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;}

/** Actual 1080 px export artboard. Drawing happens in the browser; no image is sent to a third party. */
export default function DesignCanvas({draft,brand,onError}:{draft:Draft;brand:Brand;onError?:(s:string)=>void}){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const dimensions=designSize(draft.format);
 useEffect(()=>{
  let disposed=false;
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
  if(!canvas||!ctx)return;
  const W=dimensions.width,H=dimensions.height;
  canvas.width=W;canvas.height=H;canvas.dataset.ready='false';
  const template=templates[draft.template]||templates[0];
  const style=template.style;
  const editorial=style==='editorial',signature=style==='signature',luxury=style==='luxury',dark=style==='dark';
  const accent=colorOr(draft.accentColor,colorOr(brand.color,DEEP));
  const photoH=signature?H-540:luxury?H-525:editorial?H-560:H;
  const photoBox:{x:number;y:number;w:number;h:number}=signature?{x:54,y:178,w:972,h:photoH}:luxury?{x:54,y:112,w:972,h:photoH}:editorial?{x:0,y:225,w:W,h:photoH}:dark?{x:65,y:260,w:950,h:H-350}:{x:0,y:0,w:W,h:H};
  const asset=(src?:string):Promise<HTMLImageElement|null>=>new Promise(resolve=>{
   if(!src){resolve(null);return;}
   const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src;
  });
  function fit(text:string,maxWidth:number,size:number,weight='bold',family='Arial'){
   let s=(text||'').trim();ctx!.font=`${weight} ${size}px ${family}`;
   while(s.length>1&&ctx!.measureText(s).width>maxWidth)s=s.slice(0,-2).trimEnd()+'…';
   return s;
  }
  function wrapped(text:string,maxWidth:number,size:number,maxLines=2,family='Georgia'){
   ctx!.font=`bold ${size}px ${family}`;
   const out:string[]=[];let line='';
   for(const word of (text||'').split(/\s+/).filter(Boolean)){
    const next=line?line+' '+word:word;
    if(line&&ctx!.measureText(next).width>maxWidth){out.push(fit(line,maxWidth,size,'bold',family));line=word;}else line=next;
   }
   if(line)out.push(fit(line,maxWidth,size,'bold',family));
   return out.slice(0,maxLines);
  }
  function photoCover(img:HTMLImageElement|null,box:{x:number;y:number;w:number;h:number}){
   ctx!.save();ctx!.beginPath();ctx!.rect(box.x,box.y,box.w,box.h);ctx!.clip();
   ctx!.fillStyle='#dae5dc';ctx!.fillRect(box.x,box.y,box.w,box.h);
   if(img){const scale=Math.max(box.w/img.naturalWidth,box.h/img.naturalHeight);const w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx!.drawImage(img,box.x+(box.w-w)/2,box.y+(box.h-h)/2,w,h);}
   else {ctx!.fillStyle=DEEP;ctx!.font='bold 26px Arial';ctx!.fillText('ADD AN AUTHORIZED PROPERTY PHOTO',box.x+32,box.y+Math.max(80,box.h/2));}
   ctx!.restore();
  }
  function circleImage(img:HTMLImageElement,x:number,y:number,r:number){
   if(!img)return;ctx!.save();ctx!.beginPath();ctx!.arc(x,y,r,0,Math.PI*2);ctx!.clip();photoCover(img,{x:x-r,y:y-r,w:r*2,h:r*2});ctx!.restore();
  }
  function draw(img:HTMLImageElement|null,agent:HTMLImageElement|null,logo:HTMLImageElement|null){
   if(disposed||!canvas||!ctx)return;
   ctx.clearRect(0,0,W,H);
   ctx.fillStyle=signature||luxury||editorial?CREAM:accent;ctx.fillRect(0,0,W,H);
   photoCover(img,photoBox);
   if(signature){ctx.fillStyle=CREAM;ctx.fillRect(0,0,W,178);ctx.fillStyle=accent;ctx.fillRect(0,H-342,W,342);ctx.fillStyle=ORANGE;ctx.fillRect(54,164,160,9);}
   else if(luxury){ctx.fillStyle=CREAM;ctx.fillRect(0,0,W,112);ctx.fillStyle=accent;ctx.fillRect(0,H-410,W,410);ctx.fillStyle=ORANGE;ctx.fillRect(54,H-414,150,8);}
   else if(editorial){ctx.fillStyle=CREAM;ctx.fillRect(0,0,W,225);ctx.fillRect(0,H-350,W,350);ctx.fillStyle=ORANGE;ctx.fillRect(60,208,165,8);}
   else {if(dark){ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(photoBox.x,photoBox.y,photoBox.w,photoBox.h);}const grad=ctx.createLinearGradient(0,H-690,0,H);grad.addColorStop(0,'rgba(10,37,30,0)');grad.addColorStop(1,'rgba(10,37,30,.96)');ctx.fillStyle=grad;ctx.fillRect(0,H-690,W,690);}
   const light=!(signature||editorial);
   ctx.fillStyle=signature||editorial||luxury?DEEP:'#ffffff';ctx.font='bold 27px Arial';
   const category=(template.category||'REAL ESTATE').toUpperCase();
   ctx.fillText(fit(category,620,27),65,signature?65:luxury?61:editorial?67:75);
   // Headline is intentionally positioned outside the property image for light editorial formats.
   const titleFont=signature?65:editorial?63:luxury?67:72;
   const titleY=signature?139:editorial?151:luxury?H-365:H-480;
   ctx.fillStyle=signature||editorial?DEEP:'#ffffff';ctx.shadowColor=light?'rgba(0,0,0,.33)':'transparent';ctx.shadowBlur=light?13:0;
   wrapped(draft.title||template.title,950,titleFont,signature?1:2,signature?'Arial':'Georgia').forEach((line,i)=>{
    ctx.font=`bold ${titleFont}px ${signature?'Arial':'Georgia'}`;ctx.fillText(line,65,titleY+i*(titleFont+8));
   });
   ctx.shadowBlur=0;
   const lowerColor=editorial?DEEP:'#ffffff';ctx.fillStyle=lowerColor;
   const infoY=signature?H-270:editorial?H-268:luxury?H-225:H-300;
   if(draft.listingAddress){ctx.font='bold 32px Arial';ctx.fillText(fit(draft.listingAddress,925,32),65,infoY);}
   const specs=[draft.beds&&`${draft.beds} BD`,draft.baths&&`${draft.baths} BA`,draft.propertyArea&&`${draft.propertyArea} SQ FT`].filter(Boolean).join('  ·  ');
   if(specs){ctx.font='24px Arial';ctx.fillText(fit(specs,930,24,'normal'),65,infoY+39);}
   if(draft.showPrice!==false&&draft.listingPrice){ctx.fillStyle=lowerColor;ctx.font='bold 39px Arial';ctx.fillText(fit(draft.listingPrice,490,39),65,infoY+92);}
   if(draft.callToAction){ctx.fillStyle=ORANGE;const cta=fit(draft.callToAction.toUpperCase(),500,22);ctx.font='bold 22px Arial';const w=Math.min(570,ctx.measureText(cta).width+42);const buttonY=infoY+51;ctx.fillRect(W-w-55,buttonY-26,w,43);ctx.fillStyle='#ffffff';ctx.fillText(cta,W-w-34,buttonY+3);}
   if(draft.showAgent!==false){
    const bottomY=H-98;
    if(!(signature||luxury)){ctx.fillStyle=editorial?accent:'rgba(12,43,34,.9)';ctx.fillRect(0,H-120,W,120);}
    const hasAgent=Boolean(agent),left=hasAgent?150:65;
    if(agent)circleImage(agent,101,bottomY+15,38);
    ctx.fillStyle='#ffffff';ctx.textAlign='left';ctx.font='bold 25px Arial';
    ctx.fillText(fit(draft.agentName||brand.name,left===65?510:430,25),left,bottomY,510);
    ctx.font='20px Arial';ctx.fillText(fit(draft.brokerageName||brand.website,460,20,'normal'),left,bottomY+29,500);
    ctx.textAlign='right';ctx.font='bold 21px Arial';ctx.fillText(fit(draft.agentPhone||draft.agentEmail||'',365,21),W-57,bottomY+14,365);ctx.textAlign='left';
   }
   if(logo){
    const maxW=225,maxH=82;const factor=Math.min(maxW/logo.naturalWidth,maxH/logo.naturalHeight,1.5);
    const w=logo.naturalWidth*factor,h=logo.naturalHeight*factor;
    ctx.fillStyle=signature||editorial||luxury?'rgba(255,255,255,.95)':'rgba(255,255,255,.92)';
    ctx.fillRect(W-w-89,27,w+28,h+22);ctx.drawImage(logo,W-w-75,38,w,h);
   }
   canvas.dataset.ready=img?'true':'false';
  }
  draw(null,null,null);
  Promise.all([asset(draft.photo),asset(draft.agentPhoto),asset(draft.brokerageLogo)]).then(([img,agent,logo])=>{
   if(!disposed){draw(img,agent,logo);if(draft.photo&&!img)onError?.('This photo could not load. Upload an image that you have permission to use.');}
  });
  return()=>{disposed=true};
 },[draft,brand,dimensions.height,dimensions.width,onError]);
 return <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} style={{display:'block',width:'100%',height:'auto',maxHeight:'65dvh',objectFit:'contain',background:'#edf1ea'}} role="img" aria-label={`${templates[draft.template]?.name||'RealVolt design'}: ${draft.title}`}/>;
}
