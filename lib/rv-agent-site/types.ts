export const TEMPLATES = ['modern', 'classic', 'luxury'] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export type AgentSite = {
  id: string;
  owner_user_id: string;
  slug: string;
  display_name: string;
  brokerage_name: string;
  tagline: string;
  biography: string;
  public_email: string;
  public_phone: string;
  headshot_url: string;
  hero_image_url: string;
  template: TemplateName;
  primary_color: string;
  accent_color: string;
  background_color: string;
  published: boolean;
};

export type AgentSiteDraft = Omit<AgentSite, 'id' | 'owner_user_id'>;

export type AgentSiteDomain = {
  id: string;
  hostname: string;
  ownership_token: string;
  status: 'pending' | 'ownership_verified' | 'active';
};

export const defaultSite: AgentSiteDraft = {
  slug: '',
  display_name: '',
  brokerage_name: '',
  tagline: 'Helping you find your next home',
  biography: '',
  public_email: '',
  public_phone: '',
  headshot_url: '',
  hero_image_url: '',
  template: 'modern',
  primary_color: '#147D64',
  accent_color: '#F3972C',
  background_color: '#F6FAF7',
  published: false,
};

export const palettes = [
  { label: 'RealVolt Green + Orange', primary_color: '#147D64', accent_color: '#F3972C', background_color: '#F6FAF7' },
  { label: 'Navy + Gold', primary_color: '#143B60', accent_color: '#C99B38', background_color: '#F8F7F2' },
  { label: 'Black + Champagne', primary_color: '#1D2329', accent_color: '#C6A76A', background_color: '#F5F2EA' },
  { label: 'Terracotta + Sand', primary_color: '#9A4F36', accent_color: '#D7A96E', background_color: '#FFF9F1' },
];
