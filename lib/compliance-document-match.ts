/** A narrow safety check: reject only clearly unrelated financial/administrative PDFs.
 * Other documents still require a human to open, read, and verify their contents.
 * Back Office database migration 052 also resets incorrect historical verification.
 */
export function documentClearlyWrong(label:string, filename:string):boolean {
 const l=label.toLowerCase(), n=filename.toLowerCase();
 if (/agentexpensesbydate|agentgstreport|cheque[_ .-]*alignment|payroll[_ .-]*report|bank[_ .-]*statement/.test(n)) return true;
 if (/internal[_ .-]*commission[_ .-]*(?:payable[_ .-]*)?statement/.test(n)) return !/internal commission payable statement/.test(l);
 if (/commission[_ .-]*instruction[_ .-]*report/.test(n)) return !/commission instruction report|\bcir\b/.test(l);
 if (/letter[_ .-]*to[_ .-]*complete/.test(n)) return !/lawyer completion letter/.test(l);
 if (/brokerage[_ .-]*completion[_ .-]*confirmation/.test(n)) return !/brokerage completion confirmation/.test(l);
 return false;
}
