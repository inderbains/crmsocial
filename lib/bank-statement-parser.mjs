// Conservative text-PDF bank statement parser. Never auto-post unverified rows.
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
export function parseMoney(s) { const v=clean(s).replace(/[$, ]/g,'').replace(/^\((.*)\)$/,'-$1'); return /^-?\d+(?:\.\d{2})?$/.test(v) ? Number(v) : NaN; }
export function parseBankStatement(text, periodEnd) {
 const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean);
 const year=Number(periodEnd.slice(0,4)); const transactions=[]; const uncertain=[];
 let opening=null, closing=null;
 for (const line of lines) {
  const openingMatch=line.match(/(?:opening|beginning)\s+balance\s*[:$ ]+([($-]?[\d,]+\.\d{2}\)?)/i);
  const closingMatch=line.match(/(?:closing|ending)\s+balance\s*[:$ ]+([($-]?[\d,]+\.\d{2}\)?)/i);
  if(openingMatch)opening=parseMoney(openingMatch[1]); if(closingMatch)closing=parseMoney(closingMatch[1]);
  // Supports ISO or common Canadian abbreviated dates, signed amount at end.
  const match=line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|[A-Za-z]{3}\s+\d{1,2})\s+(.+?)\s+([+-]?\$?\(?[\d,]+\.\d{2}\)?)$/);
  if(!match){if(/^\d{4}-\d{2}-\d{2}\b|^\d{1,2}[\/-]\d{1,2}\b|^[A-Za-z]{3}\s+\d{1,2}\b/.test(line))uncertain.push(line);continue;}
  let date=match[1];
  if(/^[A-Za-z]/.test(date)){const d=new Date(`${date} ${year} 12:00:00 GMT`);date=Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)}
  else if(date.includes('/')){const [a,b,y]=date.split('/').map(Number);
   if(a<=12&&b<=12){uncertain.push(line+' [ambiguous day/month order]');continue;}
   const month=a>12?b:a, day=a>12?a:b;
   date=`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
  else if(/^\d{2}-\d{2}-\d{4}$/.test(date)){const [a,b,y]=date.split('-').map(Number);
   if(a<=12&&b<=12){uncertain.push(line+' [ambiguous day/month order]');continue;}
   const month=a>12?b:a, day=a>12?a:b;
   date=`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
  const amount=parseMoney(match[3]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T12:00:00Z').getTime())||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!Number.isFinite(amount)||amount===0){uncertain.push(line);continue;}
  transactions.push({date,description:match[2],amount,reference:'',source:line});
 }
 return {transactions,uncertain,opening,closing,totalLines:lines.length};
}
