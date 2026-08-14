import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DungeonMaster — module editor',
  description: 'Load a JSON module, edit the whole system and story, export a module.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
