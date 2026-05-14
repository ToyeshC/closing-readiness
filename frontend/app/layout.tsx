import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Consult&Co — Financial Readiness",
  description: "Closing-readiness and data-quality engine for Dutch SME advisory work.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--color-brand-cream)] text-[var(--color-brand-ink)]">
        {children}
      </body>
    </html>
  );
}
