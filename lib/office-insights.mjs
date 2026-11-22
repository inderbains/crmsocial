// RealVolt 036: read-only operational summaries. No posting or authorization side effects.
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const oneDay = day => /^\d{4}-\d{2}-\d{2}$/.test(String(day || ''));
export function firmDate(deal) {
  // A transaction is not sold merely because its scheduled subject date has passed.
  return ['Sold','Completed','Archived'].includes(deal?.rv_stage) && oneDay(deal?.rv_firm_date)
    ? deal.rv_firm_date : null;
}
export function brokerageSideCommission(deal) {
  return num(deal?.representation === 'listing' ? deal?.listing_commission : deal?.selling_commission);
}
export function monthOf(date) { return String(date || '').slice(0,7); }
export function monthEnd(previousTo) {
  const [year, month] = String(previousTo).slice(0,7).split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
}
export function computeOfficeInsights(input, month) {
  const deals = input.deals || [], payouts = input.payouts || [], accounts = input.accounts || [];
  const ledger = input.ledger || [], recs = input.reconciliations || [], reqs = input.requirements || [], docs = input.documents || [];
  const monthPrefix = String(month || '').slice(0,7);
  const firm = deals.filter(d => d.kind === 'Sale' && firmDate(d));
  const firmMonth = firm.filter(d => monthOf(firmDate(d)) === monthPrefix);
  const completed = deals.filter(d => d.kind === 'Sale' && !!d.rv_completed_date && ['Completed','Archived'].includes(d.rv_stage));
  const received = completed.filter(d => d.rv_funds_verified === true);
  const awaiting = completed.filter(d => d.rv_funds_verified !== true);
  const authorized = payouts.filter(p => p.status === 'Authorized');
  const paid = payouts.filter(p => p.status === 'Paid');
  const bankBalances = accounts.filter(a => a.active !== false).map(a => {
    const entries = ledger.filter(l => l.account_id === a.id);
    const fileAmounts = new Map();
    for(const l of entries) if(l.deal_id) fileAmounts.set(l.deal_id,(fileAmounts.get(l.deal_id)||0)+num(l.amount));
    const unallocated = entries.filter(l => !l.deal_id).reduce((s,l)=>s+num(l.amount),num(a.opening_balance));
    return {id:a.id,name:a.name,kind:a.kind,bookBalance:num(a.opening_balance)+entries.reduce((s,l)=>s+num(l.amount),0),
      fileBalance:[...fileAmounts.values()].reduce((s,v)=>s+v,0),unallocated,
      negativeFiles:[...fileAmounts.values()].filter(v=>v<-.009).length};
  });
  const monthEndDate = monthEnd(input.reconciliationMonth || monthPrefix);
  const unreconciled = accounts.filter(a => a.active !== false && (!monthEndDate || a.opening_date <= monthEndDate) &&
    !recs.some(r=>r.account_id===a.id && r.period_end===monthEndDate));
  const outstandingReqs = reqs.filter(r => r.verified !== true);
  const docIds = new Set(docs.map(d=>d.id));
  const docsMissing = outstandingReqs.filter(r => !r.document_id || (docs.length>0 && !docIds.has(r.document_id)));
  const fundReceivables = awaiting.reduce((s,d)=>s+brokerageSideCommission(d),0);
  return {
    firm, firmMonth, completed, received, awaiting, authorized, paid,
    bankBalances, unreconciled, outstandingReqs, docsMissing,
    monthSales:firmMonth.length,
    monthVolume:firmMonth.reduce((s,d)=>s+num(d.sale_price),0),
    monthSideCommission:firmMonth.reduce((s,d)=>s+brokerageSideCommission(d),0),
    paidPayouts:paid.reduce((s,p)=>s+num(p.net),0),
    pendingPayouts:authorized.reduce((s,p)=>s+num(p.net),0),
    commissionReceivable:fundReceivables,
    monthPayouts:payouts.filter(p=>monthOf(p.paid_date || p.created_at) === monthPrefix),
  };
}
export function csvSafeCell(value){
  // Preserve numeric cells (including negative amounts) for financial reports.
  if(typeof value==='number' && Number.isFinite(value)) return '"'+String(value)+'"';
  const s=String(value ?? '');
  // Avoid spreadsheet formula injection when exported text is opened in Excel.
  const escaped = /^[\s]*[=+@\-]/.test(s) ? "'"+s : s;
  return '"'+escaped.replace(/"/g,'""')+'"';
}
export function csvRows(rows){return '\ufeff'+rows.map(r=>r.map(csvSafeCell).join(',')).join('\r\n')+'\r\n';}
