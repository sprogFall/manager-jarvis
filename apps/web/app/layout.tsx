import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Manager Jarvis Web',
  description: 'Docker 管理前端控制台',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
