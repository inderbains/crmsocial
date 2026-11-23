'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import LawyerChoice from './lawyer-choice';
import {emptyLawyer,saveLawyerEntry,type Lawyer,type LawyerEntry} from '../lib/lawyers';

// Keep one visible lawyer/commission panel per transaction in a browser view.
// A transaction is sometimes mounted more than once through different workspace surfaces.
// Preserve each mount's React state; never delete DOM nodes behind React's back.
type VisiblePanel = { id:symbol; named:boolean; setVisible:(visible:boolean)=>void };
const visiblePanelsByDeal = new Map<string,Map<symbol,VisiblePanel>>();
function electVisiblePanel(dealId:string){
 const group=visiblePanelsByDeal.get(dealId);
 if(!group?.size)return;
 const members=Array.from(group.values());
 const preferred=members.find(member=>member.named)||members[0];
 members.forEach(member=>member.setVisible(member.id===preferred.id));
 if(members.length>1)console.warn('[RealVolt] Duplicate post-firm panel mounts detected for file',dealId,'count',members.length);
}

type FirmDeal={
 id:string;representation?:'listing'|'selling';parent_listing_id?:string|null;cooperating_agent?:string;rv_stage:string|null;review_status:string;rv_post_firm_details_confirmed?:boolean;buyer_lawyer_id:string|null;seller_lawyer_id:string|null;
 buyer_lawyer:Lawyer|null;seller_lawyer:Lawyer|null;listing_commission:number;selling_commission:number;
 gst_rate:number;deposit_amount:number;deposit_holder:'our_brokerage'|'other_brokerage';deposit_brokerage:string;
};

export default function PostFirmDetails({deal,agentName,office,onSaved,notify}:{
 deal:FirmDeal;agentName?:string;office:boolean;onSaved:()=>Promise<void>;notify:(message:string)=>void;
}){
 const [panelInstanceId]=useState(()=>Symbol('rv-post-firm-panel'));
 const [isPrimaryPanel,setIsPrimaryPanel]=useState(false);
 useEffect(()=>{
  let group=visiblePanelsByDeal.get(deal.id);
  if(!group){group=new Map();visiblePanelsByDeal.set(deal.id,group);}
  group.set(panelInstanceId,{id:panelInstanceId,named:!!agentName?.trim(),setVisible:setIsPrimaryPanel});
  electVisiblePanel(deal.id);
  return ()=>{
   const currentGroup=visiblePanelsByDeal.get(deal.id);
   currentGroup?.delete(panelInstanceId);
   if(!currentGroup?.size)visiblePanelsByDeal.delete(deal.id);
   else electVisiblePanel(deal.id);
  };
 },[deal.id,panelInstanceId,agentName]);
 const db=getSupabase()!;
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[lawyers,setLawyers]=useState<Lawyer[]>([]);
 const [buyer,setBuyer]=useState<LawyerEntry>(emptyLawyer()),[seller,setSeller]=useState<LawyerEntry>(emptyLawyer());
 const [details,setDetails]=useState({
  listing_commission:0,selling_commission:0,gst_rate:5,deposit_amount:0,
  deposit_holder:'our_brokerage' as 'our_brokerage'|'other_brokerage',deposit_brokerage:''
 });
 useEffect(()=>{
  setBuyer(deal.buyer_lawyer||emptyLawyer());setSeller(deal.seller_lawyer||emptyLawyer());
  setDetails({listing_commission:Number(deal.listing_commission||0),selling_commission:Number(deal.selling_commission||0),gst_rate:Number(deal.gst_rate??5),deposit_amount:Number(deal.deposit_amount||0),deposit_holder:deal.deposit_holder||'our_brokerage',deposit_brokerage:deal.deposit_brokerage||''});
  setEditing(!office&&!deal.rv_post_firm_details_confirmed);
 },[office,deal.rv_post_firm_details_confirmed,deal.id,deal.review_status,deal.buyer_lawyer_id,deal.seller_lawyer_id,deal.listing_commission,deal.selling_commission,deal.gst_rate,deal.deposit_amount,deal.deposit_holder,deal.deposit_brokerage]);
 useEffect(()=>{void db.from('brokerage_lawyers').select('*').order('name').then(r=>{if(!r.error)setLawyers(r.data||[])})},[db]);
 if(deal.rv_stage!=='Sold'||!isPrimaryPanel)return null;
 const mayEdit=['Submitted','Approved','Changes requested'].includes(deal.review_status);
 const dualCommission=Boolean(deal.parent_listing_id);
 const singleListing=!dualCommission&&deal.representation==='listing';
 const fmt=(v:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(v);
 const commissionTotal=Number(deal.listing_commission||0)+Number(deal.selling_commission||0);
 const commissionGST=Math.round(commissionTotal*Number(deal.gst_rate??5))/100;
 const bothLawyers=!!deal.buyer_lawyer_id&&!!deal.seller_lawyer_id;
 async function save(e:FormEvent){
  e.preventDefault();if(!mayEdit||busy)return;
  setBusy(true);
  try{
   const buyerLawyer=await saveLawyerEntry(db,buyer);
   const sellerLawyer=await saveLawyerEntry(db,seller);
   const result=await db.rpc('rv_save_post_firm_details',{
    p_deal:deal.id,p_buyer_lawyer:buyerLawyer?.id||null,p_seller_lawyer:sellerLawyer?.id||null,
    p_listing_commission:dualCommission||singleListing?details.listing_commission:0,p_selling_commission:singleListing?0:details.selling_commission,
    p_gst_rate:details.gst_rate,p_deposit_amount:details.deposit_amount,
    p_deposit_holder:details.deposit_holder,p_deposit_brokerage:details.deposit_brokerage
   });
   if(result.error)throw result.error;
   setEditing(false);await onSaved();notify('Post-firm lawyer, commission and deposit information saved.');
  }catch(err){notify((err as Error).message)}finally{setBusy(false)}
 }
 return <section className="panel" aria-label="Post-firm lawyer and commission details" style={{margin:'20px 0',border:'1px solid #cbdcd1'}}>
  <div className="sectionhead"><div><h2>After subjects removed — lawyers & commission</h2><p className="hint"><b>Assigned Realtor:</b> {agentName||'Agent profile name unavailable'}</p><p className="hint">Agent: save both lawyer contacts, commission, GST rate and deposit details before Back Office approval. The brokerage will verify documents and generate/send the CIR after approval. Saving this does not issue a payout.</p></div>{mayEdit&&!editing&&<button type="button" className="btn primary" onClick={()=>setEditing(true)}>{bothLawyers?'Edit details':'Enter details'}</button>}</div>
  {!editing?<div className="crm-form-grid">
   <p><b>Buyer lawyer:</b> {deal.buyer_lawyer?.name||'Not entered'}</p>
   <p><b>Seller lawyer:</b> {deal.seller_lawyer?.name||'Not entered'}</p>
   {(dualCommission||singleListing)&&<p><b>Listing side — Our Realtor {agentName||''}:</b> {fmt(Number(deal.listing_commission||0))} + GST {fmt(Math.round(Number(deal.listing_commission||0)*Number(deal.gst_rate??5))/100)}</p>}
   {!singleListing&&<p><b>{dualCommission?'Selling side — Cooperating Realtor '+(deal.cooperating_agent||'not entered'):'Our Realtor — '+(agentName||'')}:</b> {fmt(Number(deal.selling_commission||0))} + GST {fmt(Math.round(Number(deal.selling_commission||0)*Number(deal.gst_rate??5))/100)}</p>}
   <p><b>Total commission + GST:</b> {fmt(commissionTotal)} + {fmt(commissionGST)} = {fmt(commissionTotal+commissionGST)} (rate {deal.gst_rate??5}%)</p>
   <p><b>Deposit:</b> ${Number(deal.deposit_amount||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})} · {deal.deposit_holder==='other_brokerage'?'Other brokerage':'Our brokerage'}</p>
  </div>:<form onSubmit={e=>void save(e)}>
   <div className="crm-form-grid"><LawyerChoice side="buyer" value={buyer} lawyers={lawyers} onChange={setBuyer} disabled={busy}/><LawyerChoice side="seller" value={seller} lawyers={lawyers} onChange={setSeller} disabled={busy}/></div>
   <h3>Commission + applicable GST, and deposit holder</h3><p className="hint">{dualCommission?'Our listing sold: record both the listing-side and selling-side commissions. This does not create an additional agent payout.':'Sale only: our Realtor has one commission for the represented side.'}</p>
   <div className="crm-form-grid">
    {(['listing_commission','selling_commission','gst_rate','deposit_amount'] as const).filter(k=>dualCommission||(singleListing?k!=='selling_commission':k!=='listing_commission')).map(k=><div className="field" key={k}><label htmlFor={'postfirm-'+k}>{{listing_commission:'Listing commission before GST (CAD)',selling_commission:'Selling commission before GST (CAD)',gst_rate:'GST rate (%)',deposit_amount:'Deposit amount (CAD)'}[k]}</label><input id={'postfirm-'+k} type="number" min="0" max={k==='gst_rate'?100:9999999999999} step="0.01" value={details[k]} disabled={busy} required onChange={e=>setDetails(old=>({...old,[k]:Number(e.target.value)}))}/></div>)}
    <div className="field"><label htmlFor="postfirm-holder">Who holds the deposit?</label><select id="postfirm-holder" value={details.deposit_holder} disabled={busy} onChange={e=>setDetails(old=>({...old,deposit_holder:e.target.value as typeof old.deposit_holder}))}><option value="our_brokerage">Our brokerage</option><option value="other_brokerage">Other brokerage</option></select></div>
    {details.deposit_holder==='other_brokerage'&&<div className="field"><label htmlFor="postfirm-brokerage">Brokerage holding the deposit</label><input id="postfirm-brokerage" required value={details.deposit_brokerage} disabled={busy} onChange={e=>setDetails(old=>({...old,deposit_brokerage:e.target.value}))}/></div>}
   </div>
   <p className="notice">Estimated commission: {fmt(((dualCommission||singleListing)?details.listing_commission:0)+(singleListing?0:details.selling_commission))} + GST {fmt(Math.round((((dualCommission||singleListing)?details.listing_commission:0)+(singleListing?0:details.selling_commission))*details.gst_rate)/100)} = {fmt((((dualCommission||singleListing)?details.listing_commission:0)+(singleListing?0:details.selling_commission))+Math.round((((dualCommission||singleListing)?details.listing_commission:0)+(singleListing?0:details.selling_commission))*details.gst_rate)/100)}. Deposit holder: {details.deposit_holder==='other_brokerage'?details.deposit_brokerage:'Our brokerage'}. Save before manager approval.</p>
   <div className="actions"><button className="btn primary" disabled={busy}>{busy?'Saving…':'Save lawyer & commission details'}</button><button className="btn" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></div>
  </form>}
  {details.deposit_holder==='our_brokerage'&&<p className="notice">Deposit held by our brokerage: reconcile the actual deposit receipt to the trust account in Back Office → Trust & bank. Entering an amount here does not itself create a bank deposit.</p>}{office&&<p className="hint">Back Office: verify the deposit, lawyers and commission before approving the firm-sale file. The CIR is generated from these saved numbers.</p>}
 </section>;
}
