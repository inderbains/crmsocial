export function parseBankStatement(text:string,periodEnd:string):{transactions:{date:string;description:string;amount:number;reference:string;source:string}[];uncertain:string[];opening:number|null;closing:number|null;totalLines:number};
export function parseMoney(s:string):number;
