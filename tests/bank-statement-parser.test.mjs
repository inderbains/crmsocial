import test from 'node:test';import assert from 'node:assert/strict';import {parseBankStatement} from '../lib/bank-statement-parser.mjs';
test('reads dated signed PDF rows and statement balances',()=>{
 const pdf=['Opening balance $1,000.00','2026-10-02 E-transfer deposit 500.00','2026-10-07 Cheque 1001 -150.00','Closing balance $1,350.00'].join('\n');
 const r=parseBankStatement(pdf,'2026-10-31');assert.equal(r.opening,1000);assert.equal(r.closing,1350);assert.equal(r.transactions.length,2);assert.equal(r.transactions.reduce((s,x)=>s+x.amount,0),350);
});
test('does not silently interpret ambiguous Canadian month/day',()=>{
 const r=parseBankStatement('11/02/2026 Interac transfer 30.00','2026-11-30');assert.equal(r.transactions.length,0);assert.equal(r.uncertain.length,1)
});
test('accepts unambiguous Canadian dates',()=>{
 const r=parseBankStatement('17/11/2026 Deposit 30.00\n11/17/2026 Cheque -20.00','2026-11-30');assert.deepEqual(r.transactions.map(x=>x.date),['2026-11-17','2026-11-17'])
});
test('rejects invalid dates rather than normalizing',()=>{
 const r=parseBankStatement('2026-02-31 Withdrawal -100.00','2026-02-28');assert.equal(r.transactions.length,0);assert.equal(r.uncertain.length,1)
});
