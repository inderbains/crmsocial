export type WorkflowContext={ledger?:any[];payouts?:any[];allocations?:any[];matches?:any[];accounts?:any[];deliveries?:any[];requirements?:any[];today?:string};
export type WorkflowStage={dealId:string;transactionNumber?:number;address:string;status:string;stage:string;nextModule:string;nextAction:string;owner:string;percent:number;blockers:string[];milestones:string[]};
export function deriveWorkflow(deal:any,context?:WorkflowContext):WorkflowStage;
export function summarizeWorkflow(deals:any[],context?:WorkflowContext):WorkflowStage[];
