import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import SWRegister from "@/components/SWRegister";

export const metadata: Metadata = {
  title: "수학 코치",
  description: "애플펜슬로 푸는 일차방정식 코칭",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "수학 코치", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f7f5ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
