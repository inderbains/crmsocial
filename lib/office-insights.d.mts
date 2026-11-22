export type OfficeInsights={
 firm:any[];firmMonth:any[];completed:any[];received:any[];awaiting:any[];
 authorized:any[];paid:any[];bankBalances:Array<{id:string;name:string;kind:string;bookBalance:number;fileBalance:number;unallocated:number;negativeFiles:number}>;
 unreconciled:any[];outstandingReqs:any[];docsMissing:any[];monthSales:number;monthVolume:number;monthSideCommission:number;
 paidPayouts:number;pendingPayouts:number;commissionReceivable:number;monthPayouts:any[];
};
export function firmDate(deal:any):string|null;
export function brokerageSideCommission(deal:any):number;
export function monthOf(date:unknown):string;
export function monthEnd(month:string):string|null;
export function computeOfficeInsights(input:{deals?:any[];payouts?:any[];accounts?:any[];ledger?:any[];reconciliations?:any[];requirements?:any[];documents?:any[];reconciliationMonth?:string},month:string):OfficeInsights;
export function csvSafeCell(value:unknown):string;
export function csvRows(rows:unknown[][]):string;
