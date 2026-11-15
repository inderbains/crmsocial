import type {SupabaseClient} from '@supabase/supabase-js';
export type Lawyer={id:string;brokerage_id:string;name:string;firm:string;email:string;phone:string;address:string};
export type LawyerEntry=Omit<Lawyer,'id'|'brokerage_id'>&{id:string|null};
export const emptyLawyer=():LawyerEntry=>({id:null,name:'',firm:'',email:'',phone:'',address:''});
export function hasLawyer(entry:LawyerEntry){return !!entry.id||Object.values(entry).some(v=>typeof v==='string'&&v.trim()!=='')}
export function matchingLawyers(lawyers:Lawyer[],query:string){const q=query.trim().toLowerCase();return q?lawyers.filter(l=>[l.name,l.firm,l.email].some(v=>v.toLowerCase().includes(q))).slice(0,8):[]}
export function normalizeLawyer(entry:LawyerEntry){return {name:entry.name.trim(),firm:entry.firm.trim(),email:entry.email.trim().toLowerCase(),phone:entry.phone.trim(),address:entry.address.trim()}}
export async function saveLawyerEntry(db:SupabaseClient,entry:LawyerEntry):Promise<Lawyer|null>{
 if(!hasLawyer(entry))return null;
 if(entry.id){const r=await db.from('brokerage_lawyers').select('*').eq('id',entry.id).single();if(r.error)throw r.error;return r.data}
 const values=normalizeLawyer(entry);
 if(!values.name||!values.address||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw new Error('Enter a lawyer name, office address and valid email, or select a saved lawyer.');
 const m=await db.rpc('current_brokerage');if(m.error)throw m.error;if(!m.data)throw new Error('Set up your brokerage membership before saving a lawyer.');
 const find=()=>db.from('brokerage_lawyers').select('*').eq('brokerage_id',m.data).eq('email',values.email).maybeSingle();
 const reuse=(l:Lawyer)=>{if(l.name.trim().toLowerCase()!==values.name.toLowerCase()||l.address.trim().toLowerCase()!==values.address.toLowerCase())throw new Error(`This email is already saved for ${l.name}. Select that directory contact or enter a different email.`);return l};
 const existing=await find();if(existing.error)throw existing.error;if(existing.data)return reuse(existing.data);
 const added=await db.from('brokerage_lawyers').insert({...values,brokerage_id:m.data}).select().single();
 if(added.error?.code==='23505'){const again=await find();if(again.error)throw again.error;if(again.data)return reuse(again.data)}
 if(added.error)throw added.error;return added.data;
}
