import test from 'node:test';import assert from 'node:assert/strict';import {deriveWorkflow} from '../lib/transaction-workflow.mjs';
const base={id:'deal1',transaction_number:22,address:'123 Main',kind:'Sale',review_status:'Draft',completion_date:'2026-11-01',deposit_holder:'other_brokerage'};
const ctx={today:'2026-11-17',deliveries:[{deal_id:'deal1',status:'accepted'}],allocations:[{deal_id:'deal1'}],payouts:[],ledger:[],accounts:[],matches:[],requirements:[]};
test('submission routes file to broker review automatically',()=>{assert.equal(deriveWorkflow({...base,review_status:'Submitted'},ctx).nextModule,'Review queue')});
test('changes requested routes back to agent',()=>{const s=deriveWorkflow({...base,review_status:'Changes requested',review_notes:'Fix signature'},ctx);assert.equal(s.owner,'Agent');assert.deepEqual(s.blockers,['Fix signature'])});
test('approved sale waits for payout authorization',()=>assert.equal(deriveWorkflow({...base,review_status:'Approved'},ctx).nextModule,'Agent payments'));
test('trust held at brokerage requires verifiable receipt',()=>{const s=deriveWorkflow({...base,review_status:'Approved',deposit_holder:'our_brokerage',deposit_amount:10000},ctx);assert.equal(s.nextModule,'Trust & bank')});
test('paid payout requires bank match',()=>{const s=deriveWorkflow({...base,review_status:'Approved'},{...ctx,payouts:[{deal_id:'deal1',status:'Paid',ledger_id:'entry1'}]});assert.equal(s.nextModule,'Bank reconciliation')});
test('matched payment reaches final review',()=>{const s=deriveWorkflow({...base,review_status:'Approved'},{...ctx,payouts:[{deal_id:'deal1',status:'Paid',ledger_id:'entry1'}],matches:[{ledger_id:'entry1'}]});assert.equal(s.percent,100)});
test('approved listing does not trigger commission',()=>{const s=deriveWorkflow({...base,kind:'Listing',review_status:'Approved'},ctx);assert.equal(s.stage,'Approved listing')});

test('valid prior receipt is not lost after a later authorized trust release',()=>{const s=deriveWorkflow({...base,review_status:'Approved',deposit_holder:'our_brokerage',deposit_amount:10000},{...ctx,accounts:[{id:'trust1',kind:'Trust'}],ledger:[{deal_id:'deal1',account_id:'trust1',amount:10000},{deal_id:'deal1',account_id:'trust1',amount:-10000}]});assert.notEqual(s.nextModule,'Trust & bank')});
