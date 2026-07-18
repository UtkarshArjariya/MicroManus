import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MicroManus",
  description: "Usage-based deep-research AI agent workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
