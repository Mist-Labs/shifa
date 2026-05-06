import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'SHIFA Coordinator Dashboard',
  description: 'Coordinator operations console for SHIFA field surveillance',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#0D1117', color: '#F0F6FC' }}>
        {children}
      </body>
    </html>
  );
}
