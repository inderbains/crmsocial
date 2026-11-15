export function calculateClosing(d){
 const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>9999999999999)throw new Error('Invalid commission or deposit amount');return Math.round((n+Number.EPSILON)*100)};
 const listing=d.representation==='listing'?cents(d.listing_commission):0,selling=cents(d.selling_commission),deposit=cents(d.deposit_amount);
 const rate=Number(d.gst_rate);if(!Number.isFinite(rate)||rate<0||rate>100)throw new Error('Invalid GST rate');
 const listingGST=Math.round(listing*rate/100),sellingGST=Math.round(selling*rate/100);
 const commission=listing+selling,gst=listingGST+sellingGST,total=commission+gst;
 const held=d.deposit_holder==='our_brokerage'?deposit:0;
 const ownCommission=d.representation==='listing'?listing+listingGST:selling+sellingGST;
 if(d.deposit_holder==='other_brokerage'&&!d.deposit_brokerage?.trim())throw new Error('Enter the brokerage holding the deposit');
 return {listing,selling,listingGST,sellingGST,commission,gst,total,deposit,held,deducted:Math.min(held,total),remittance:Math.max(0,held-total),shortfall:d.deposit_holder==='other_brokerage'?ownCommission:Math.max(0,total-held),ownCommission,external:d.deposit_holder==='other_brokerage'};
}
export const money=cents=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
export function packetTexts(d,brokerage,side,extra=''){
 const lawyer=d[side+'_lawyer'];if(!lawyer?.email)throw new Error('Select the '+side+' lawyer before preparing documents');
 if(!d.completion_date||!d.buyer_name?.trim()||!d.seller_name?.trim())throw new Error('Complete buyer/seller legal names and completion date');
 if(d.kind!=='Sale')throw new Error('Closing documents require a sale');
 const c=calculateClosing(d);
 const common=`${brokerage.name}\n${brokerage.address}\n${brokerage.email} | ${brokerage.phone}\n\nProperty: ${d.address}\nMLS: ${d.mls_number||'Not entered'}\nBuyer(s): ${d.buyer_name}\nSeller(s): ${d.seller_name}\nSale price: ${money(Math.round(Number(d.sale_price||0)*100))}\nCompletion: ${d.completion_date}\nFile reference: ${d.id}\n\nTo: ${lawyer.name}\n${lawyer.firm}\n${lawyer.address}\nEmail: ${lawyer.email}\n`;
 const summary=`\nListing commission (before GST): ${money(c.listing)}\nSelling commission (before GST): ${money(c.selling)}\nCommission subtotal: ${money(c.commission)}\nGST (${d.gst_rate}%): ${money(c.gst)}\nTotal commission including GST: ${money(c.total)}\nOur brokerage commission including GST: ${money(c.ownCommission)}\n\nDeposit recorded: ${money(c.deposit)}\nDeposit holder: ${c.external?d.deposit_brokerage:brokerage.name}\nDeposit held by our brokerage: ${money(c.held)}\nCommission to deduct from deposit held by us: ${money(c.deducted)}\nBalance to remit from funds held by us: ${money(c.remittance)}\nOur commission still to be received: ${money(c.shortfall)}\n`;
 const external=c.external?'\nThe deposit is held by the other brokerage named above. It is not held by us and is not included in funds available for remittance by our brokerage. Coordinate commission payment and any deposit release with that holder.':'\nThe figures above are proposed completion instructions. Confirm cleared trust funds and the applicable signed commission agreement before releasing funds.';
 return {cir:'COMMISSION INSTRUCTION REPORT\n\n'+common+summary+external+(extra?'\n\nBack-office instructions:\n'+extra:''),letter:'LETTER TO COMPLETE\n\n'+common+'\nDear '+lawyer.name+',\n\nPlease arrange completion of the transaction identified above on the completion date. The enclosed Commission Instruction Report sets out the agent-entered commission, GST, deposit holder and proposed remittance figures.\n'+summary+external+'\n\n'+(extra||'Please confirm receipt and advise our office of any missing information required to complete.')+'\n\nRegards,\n'+brokerage.name};
}
