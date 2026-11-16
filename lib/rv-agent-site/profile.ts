import type { LinkedAgentProfile } from './types';

/** Only fields explicitly intended for public marketing. Never read billing/private data. */
export const PROFILE_COLUMNS = 'full_name,professional_title,biography,public_email,public_phone,license_number,headshot_path,logo_path';

type MarketingRow = Record<string, string | null>;
export function publicMarketingIdentity(row: MarketingRow | null, brokerageName = ''): LinkedAgentProfile {
  return {
    full_name: row?.full_name || '',
    professional_title: row?.professional_title || 'REALTOR®',
    biography: row?.biography || '',
    public_email: row?.public_email || '',
    public_phone: row?.public_phone || '',
    license_number: row?.license_number || '',
    headshot_path: row?.headshot_path || '',
    logo_path: row?.logo_path || '',
    brokerage_name: brokerageName,
  };
}
