import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/layout/TopNav';

export const metadata: Metadata = {
  title: 'Armenia Poverty Analytics',
  description:
    'Interactive visualization of ILCS 2015 household survey and ArmStat regional poverty data for Armenia.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">
        <TopNav />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
