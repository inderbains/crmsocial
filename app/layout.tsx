import type { Metadata } from 'next';
import './globals.css';
import { WebsiteQuickLink } from '@/components/rv-agent-site/WebsiteQuickLink';

export const metadata:Metadata={
  title:'RealVolt Social Studio',description:'Your brand, your content, your next connection.'
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}<WebsiteQuickLink/></body></html>;
}
