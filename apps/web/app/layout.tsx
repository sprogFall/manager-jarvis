import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';

import './globals.css';

const titleFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-title',
  weight: ['400', '500', '700'],
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Manager Jarvis Web',
  description: 'Docker 管理前端控制台',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${titleFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
