import {getSupabase} from './supabase';

/** Store a newly generated private PDF alongside the original deal documents.
 * Never overwrite a signed/previously reviewed file; a second attempt creates no duplicate. */
export async function saveClosingPDF(dealId:string,name:string,bytes:Uint8Array,requirementLabel:string){
 const db=getSupabase();
 if(!db)throw new Error('Please sign in');
 const auth=await db.auth.getUser();
 if(auth.error||!auth.data.user)throw new Error('A valid user session is required');
 const old=await db.from('deal_documents').select('id').eq('deal_id',dealId).eq('name',name).limit(1);
 if(old.error)throw old.error;
 if(old.data?.length)throw new Error(name+' already exists. Review the saved PDF rather than overwriting it.');
 const path=`${auth.data.user.id}/${dealId}/closing/${crypto.randomUUID()}-${name.replace(/[^A-Za-z0-9._-]/g,'_')}`;
 const pdfData=new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
 const put=await db.storage.from('transaction-files').upload(path,pdfData,{contentType:'application/pdf',upsert:false});
 if(put.error)throw put.error;
 const added=await db.from('deal_documents').insert({deal_id:dealId,name,path}).select('id').single();
 if(added.error)throw new Error('PDF uploaded but document registration failed: '+added.error.message);
 const linked=await db.from('deal_requirements').update({document_id:added.data.id,verified:false,rv_waived:false,rv_waiver_reason:''})
  .eq('deal_id',dealId).eq('label',requirementLabel).select('id');
 if(linked.error)throw new Error('PDF saved but checklist linking failed: '+linked.error.message);
 if(!linked.data?.length)throw new Error('PDF saved. SQL 044 is required to link the '+requirementLabel+' checklist item.');
 return added.data.id as string;
}
