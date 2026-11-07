import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import SWRegister from "@/components/SWRegister";
import { LangProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Math Coach",
  description: "Linear equations coaching with Apple Pencil",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Math Coach", statusBarStyle: "default" },
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
    <html lang="en">
      <body>
        <LangProvider>{children}</LangProvider>
        <SWRegister />
      </body>
    </html>
  );
}
