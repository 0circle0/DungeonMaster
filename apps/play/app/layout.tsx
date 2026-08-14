import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DungeonMaster — play',
  description: 'Play a module in the browser: click-first, command bar kept.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
