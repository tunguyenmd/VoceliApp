import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Fraunces } from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible was designed with the Braille Institute for low-vision readers; Fraunces gives warmth to headings.
const body = Atkinson_Hyperlegible_Next({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const display = Fraunces({ variable: "--font-display-face", subsets: ["latin"], display: "swap", axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: "Voceli: advance care planning in your own voice",
  description: "Talk through what matters to you, record your wishes in your own voice, and share them with the people you love.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fbf8f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
