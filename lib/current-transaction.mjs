// Presentation only: never merge or delete database records, or infer links from addresses.
const currentStages = new Set(['Accepted offer','Sold','Completed','Archived']);
const shareableReviews = new Set(['Submitted','Approved','Changes requested','Completed']);
export function currentTransactionIndex(rows) {
 const index = new Map(rows.map(row => [row.id,row]));
 const replacements = new Map();
 for (const sale of rows) {
  if (sale.kind !== 'Sale' || !sale.parent_listing_id || sale.rv_deleted_at || !currentStages.has(sale.rv_stage)) continue;
  if (!shareableReviews.has(sale.review_status) && !(sale.rv_stage==='Accepted offer' && sale.review_status==='Draft')) continue;
  const parent = index.get(sale.parent_listing_id);
  // Never suppress a listing that itself still requires a review or corrections.
  if (!parent || parent.kind !== 'Listing' || parent.rv_deleted_at || parent.review_status !== 'Approved') continue;
  if (!parent.brokerage_id || parent.brokerage_id !== sale.brokerage_id || !parent.user_id || parent.user_id !== sale.user_id) continue;
  const previous = replacements.get(parent.id);
  // If there are multiple surviving sales, keep them all; use the newest for old listing links.
  const compare = r => String(r.created_at || r.updated_at || '')+'|'+r.id;
  if (!previous || compare(sale)>compare(previous)) replacements.set(parent.id,sale);
 }
 return {
  currentId: id => replacements.get(id)?.id || id,
  rows: rows.filter(row => !row.rv_deleted_at && !replacements.has(row.id)),
 };
}
