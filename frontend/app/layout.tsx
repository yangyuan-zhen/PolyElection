import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PolyElection | 选举量化情报站",
  description:
    "PolyElection dashboard built with Next.js, TypeScript and a FastAPI backend.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable)}
    >
      <head></head>
      <body className={`dark ${inter.className}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
