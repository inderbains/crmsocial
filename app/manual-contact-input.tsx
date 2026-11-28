'use client';

// A one-line textarea avoids the browser's normal contact-field heuristics.
// Autocomplete is a browser hint, not a security boundary.
export default function ManualContactInput({id,value,onChange,disabled,readOnly,required,placeholder,inputMode='text',onFocus}:{
 id:string;value:string;onChange:(value:string)=>void;disabled?:boolean;readOnly?:boolean;required?:boolean;placeholder?:string;inputMode?:'text'|'email'|'tel';onFocus?:()=>void;
}){
 return <textarea id={id} name={'rv-manual-'+id} rows={1} autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode={inputMode} disabled={disabled} readOnly={readOnly} required={required} maxLength={500} placeholder={placeholder} value={value} onFocus={onFocus} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)e.preventDefault()}} onChange={e=>onChange(e.target.value.replace(/[\r\n]+/g,' '))} style={{minHeight:0,resize:'none',overflow:'auto',lineHeight:1.4,font:'inherit'}}/>;
}
