import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Планнер Жени",
  description: "Персональный недельный планировщик",
  applicationName: "Планнер Жени",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/planner-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/planner-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Планнер",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c4704a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${inter.variable} ${cormorant.variable}`}>
      <body>{children}</body>
    </html>
  );
}
