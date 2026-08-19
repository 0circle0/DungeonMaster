import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DungeonMaster',
  description: 'A text RPG runtime where an entire game is one JSON document. The format, the engine, and the studio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
