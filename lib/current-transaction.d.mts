export type TransactionLink = {id:string;kind:string;parent_listing_id?:string|null;brokerage_id?:string|null;user_id?:string|null;rv_stage?:string|null;review_status?:string|null;rv_deleted_at?:string|null;created_at?:string|null;updated_at?:string|null};
export function currentTransactionIndex<T extends TransactionLink>(rows: T[]): {currentId:(id:string)=>string;rows:T[]};
