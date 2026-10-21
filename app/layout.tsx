import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CRE Data Analyzer · El Salvador", template: "%s · CRE Data Analyzer" },
  description: "Commercial real estate data quality, comparison and AI-assisted investigation for El Salvador.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Suspense fallback={<div className="h-14 border-b border-border bg-surface-1 lg:fixed lg:inset-y-0 lg:w-60 lg:border-r" />}>
          <Sidebar />
        </Suspense>
        <main className="px-4 py-6 sm:px-6 lg:ml-60 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
