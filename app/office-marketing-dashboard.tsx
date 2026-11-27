'use client';
import {ShieldCheck} from 'lucide-react';
// Brokerage membership does not grant access to agents' personal marketing metrics.
// Backend RPC access is also revoked by migration 083; this screen is not a security boundary.
export default function OfficeMarketingDashboard(_props:{userId:string}){
 return <><div className="headrow"><div><h1>Office Marketing Dashboard</h1><p>Brokerage-owned marketing only.</p></div></div><section className="panel"><div className="notice"><ShieldCheck size={18}/><div><b>Private by default</b><p>Agent CRM, lead, advertising and social activity are private. Office-wide agent marketing reports are disabled. Brokerage-owned marketing connections remain separate.</p></div></div></section></>;
}
