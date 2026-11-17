import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RealVolt | Real Estate CRM & Brokerage Software',
  description: 'Real estate CRM, SignVolt, Open Houses, Social Studio and Agent Websites in one workspace. Agent and brokerage plans.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  // No floating WebsiteQuickLink: the Website Studio is in the workspace menu.
  return <html lang="en"><body>{children}</body></html>;
}
