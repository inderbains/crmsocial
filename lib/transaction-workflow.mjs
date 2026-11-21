// Back Office routing derives a work queue from authoritative brokerage records.
// No monetary or legal action is triggered here; routing never releases funds.
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const sum = xs => xs.reduce((a,v)=>a+n(v),0);
export function deriveWorkflow(deal, {ledger=[],payouts=[],allocations=[],matches=[],accounts=[],deliveries=[],requirements=[],today=new Date().toISOString().slice(0,10)}={}) {
  const base={dealId:deal.id, transactionNumber:deal.transaction_number, address:deal.address, status:deal.review_status, stage:'',nextModule:'',nextAction:'',owner:'',percent:0,blockers:[],milestones:[]};
  const add=(stage,nextModule,nextAction,owner,percent,blockers=[])=>({...base,stage,nextModule,nextAction,owner,percent,blockers});
  const state=deal.review_status;
  if(state==='Draft')return add('Draft','Transactions','Agent must complete and submit the transaction','Agent',10);
  if(state==='Changes requested')return add('Changes requested','Changes requested','Agent must correct documents and resubmit','Agent',20,[deal.review_notes||'Corrections requested']);
  if(state==='Submitted')return add('Broker review','Review queue','Review required documents, approve or request changes','Brokerage Admin',35);
  if(state!=='Approved')return add('Unknown status','Review queue','Inspect transaction status','Brokerage Admin',0);
  if(deal.kind!=='Sale')return add('Approved listing','Approved','Manage the listing or convert it to a sale when accepted','Agent',50);
  if(deal.rv_stage==='Accepted offer')return add('Accepted offer','Approved','Monitor subjects and signed amendments','Agent',50);
  if(deal.rv_stage==='Collapsed'||deal.rv_stage==='Archived')return add(deal.rv_stage,'Approved','No active processing','Brokerage Admin',100);
  if(!deal.rv_stage)return add('Confirmation needed','Approved','Confirm actual firm sale with supporting PDF','Agent',46);
  const ownTrust = deal.deposit_holder==='our_brokerage' && n(deal.deposit_amount)>0;
  const trustIds=new Set(accounts.filter(a=>a.kind==='Trust').map(a=>a.id));
  const trustRecorded=sum(ledger.filter(l=>l.deal_id===deal.id && trustIds.has(l.account_id) && n(l.amount)>0 && !l.reverses_id).map(l=>l.amount));
  const requirementsPending=requirements.filter(v=>v.deal_id===deal.id&&!v.verified);
  if(requirementsPending.length)return add('Document verification','Approved','Verify required transaction documents','Brokerage Admin',46,[`${requirementsPending.length} required item(s) unverified`]);
  if(ownTrust && trustRecorded < n(deal.deposit_amount)-0.005)return add('Trust deposit review','Trust & bank','Verify deposit and post trust receipt after bank evidence','Accounting',55,[`Verified trust receipts recorded ${trustRecorded.toFixed(2)} below stated deposit ${n(deal.deposit_amount).toFixed(2)}`]);
  // Closing delivery is a separate explicit action, not an automatic email.
  const sent=deliveries.some(d=>d.deal_id===deal.id && d.status==='accepted');
  if(!sent&&deal.rv_stage==='Sold')return add('Closing package','Approved','Review CIR and Letter to Complete; send to lawyer when authorized','Brokerage Admin',65);
  if(deal.rv_stage!=='Completed'||!deal.rv_completed_date)return add('Waiting for completion','Approved','Monitor completion date and closing requirements','Brokerage Admin',72,deal.completion_date?[]:['Completion date missing']);
  if(!deal.rv_funds_verified)return add('Commission receipt pending','Approved','Verify commission funds received and cleared','Accounting',75);
  if(!allocations.some(a=>a.deal_id===deal.id))return add('Commission allocation','Agent payments','Calculate and review the commission allocation','Accounting',78);
  const p=payouts.find(p=>p.deal_id===deal.id);
  if(!p)return add('Payout authorization','Agent payments','Review deductions and authorize the agent payout','Accounting',82);
  if(p.status!=='Paid')return add('Payment pending','Agent payments','Issue an authorized payment and record it when actually paid','Accounting',90);
  const accountMatches=new Set(matches.map(m=>m.ledger_id));
  if(p.ledger_id && !accountMatches.has(p.ledger_id))return add('Awaiting bank clearance','Bank reconciliation','Match the actual bank statement line to the payout ledger entry','Accounting',95);
  return add('Paid / ready to archive','Audit & controls','Verify final documents and archive the transaction','Brokerage Admin',100);
}
export function summarizeWorkflow(deals,data){return deals.map(d=>deriveWorkflow(d,data)).sort((a,b)=>a.percent-b.percent||String(a.address).localeCompare(String(b.address)));}
