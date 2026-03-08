import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeByPilsenTime } from "@/components/ThemeByPilsenTime";

export const metadata: Metadata = {
  title: "Pilsen Murals — 3D Map",
  description: "Interactive 3D map of street art and murals",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="skip-link"
        >
          Skip to main content
        </a>
        <ThemeByPilsenTime />
        {children}
      </body>
    </html>
  );
}
