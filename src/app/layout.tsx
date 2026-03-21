import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { FilterProvider } from "@/lib/filter-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "마케팅 대시보드 | PPMI",
  description: "PPMI 마케팅 성과 대시보드 - 매출, 광고, ROAS, 퍼널 분석",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-zinc-100`}
      >
        <ThemeProvider>
          <FilterProvider>
            <Sidebar />
            <div className="md:pl-56 min-h-screen pb-16 md:pb-0">
              {children}
            </div>
          </FilterProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
