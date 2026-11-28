const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
(async()=>{
const c=await import(path.join(root,'supabase/functions/_shared/calculations.mjs'));
const x={kind:'Sale',representation:'listing',listing_commission:19890,selling_commission:0,deposit_amount:100000,gst_rate:5,deposit_holder:'our_brokerage',deposit_brokerage:'Other',address:'Test',buyer_name:'Buyer',seller_name:'Seller',completion_date:'2026-12-04',seller_lawyer:{name:'Lawyer',email:'test@example.com'}};
let t=c.calculateClosing(x);assert.equal(t.remittance,7911550);assert.equal(t.ownCommission,2088450);assert.equal(t.deducted,2088450);
t=c.calculateClosing({...x,deposit_holder:'other_brokerage'});assert.equal(t.held,0);assert.equal(t.remittance,0);assert.equal(t.deducted,0);
assert.ok(read('app/transaction-commission-payout.tsx').includes("props.deal.deposit_holder!=='our_brokerage'"));
assert.ok(read('app/transactions.tsx').includes("active.deposit_holder==='our_brokerage'&&active.rv_stage==='Sold'"));
assert.ok(read('supabase/108a_lawyer_release.sql').includes("d.deposit_holder IS DISTINCT FROM 'our_brokerage'"));
assert.ok(read('supabase/108d_trust_payout.sql').includes("IF d.deposit_holder='other_brokerage' THEN"));
assert.ok(!read('supabase/108c_confirm_earned_commission.sql').includes('REVOKE EXECUTE ON FUNCTION public.rv072_receive_commission_funds'));
assert.ok(read('supabase/functions/closing-packet/index.ts').includes("if(d.deposit_holder==='our_brokerage'&&Number(d.deposit_amount)>0)"));
console.log('8 source/calculation groups passed');
})().catch(e=>{console.error(e);process.exit(1)});
