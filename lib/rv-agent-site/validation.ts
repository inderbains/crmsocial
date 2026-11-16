import { domainToASCII } from 'node:url';
import type { AgentSiteDraft } from './types';
import { defaultSite, TEMPLATES } from './types';

const hex = /^#[0-9a-fA-F]{6}$/;
const slugRE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function str(obj: Record<string, unknown>, name: string, max: number): string {
  const value = obj[name];
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name} is invalid`);
  return value.trim();
}

function safeImageURL(v: string): string {
  if (!v) return '';
  // Hosted media only. Adjust permitted providers to match your Supabase Storage.
  const u = new URL(v);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Images need HTTPS URLs');
  return u.toString();
}

export function validateDraft(obj: unknown): AgentSiteDraft {
  if (typeof obj !== 'object' || !obj || Array.isArray(obj)) throw new Error('Invalid site settings');
  const data = obj as Record<string, unknown>;
  const slug = str(data, 'slug', 45).toLowerCase();
  if (slug.length < 3 || !slugRE.test(slug)) throw new Error('Slug must be 3–45 characters, using letters, numbers and hyphens');
  const template = str(data, 'template', 10);
  if (!TEMPLATES.includes(template as AgentSiteDraft['template'])) throw new Error('Invalid template');
  const primary_color = str(data, 'primary_color', 7);
  const accent_color = str(data, 'accent_color', 7);
  const background_color = str(data, 'background_color', 7);
  if (![primary_color,accent_color,background_color].every(x=>hex.test(x))) throw new Error('Colours must be valid hex values');
  const email = str(data, 'public_email', 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid public email');
  if (typeof data.published !== 'boolean') throw new Error('Published must be true or false');
  return {
    ...defaultSite,
    slug,
    display_name: str(data, 'display_name', 120),
    brokerage_name: str(data, 'brokerage_name', 150),
    tagline: str(data, 'tagline', 200),
    biography: str(data, 'biography', 2500),
    public_email: email,
    public_phone: str(data, 'public_phone', 50),
    headshot_url: safeImageURL(str(data, 'headshot_url', 1000)),
    hero_image_url: safeImageURL(str(data, 'hero_image_url', 1000)),
    template: template as AgentSiteDraft['template'],
    primary_color, accent_color, background_color,
    published: data.published,
  };
}

export function normalizeCustomDomain(input: unknown): string {
  if (typeof input !== 'string' || input.length > 253) throw new Error('Invalid domain');
  const trimmed = input.trim().toLowerCase().replace(/\.$/, '');
  const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Enter only a domain, like homes.example.com');
  const hostname = domainToASCII(url.hostname).toLowerCase();
  const reserved = process.env.AGENT_SITE_BASE_DOMAIN || 'realvolt.ca';
  if (hostname === reserved || hostname.endsWith(`.${reserved}`)) throw new Error('The RealVolt domain is reserved for automatic subdomains');
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname))
    throw new Error('Enter a valid public domain name');
  return hostname;
}
