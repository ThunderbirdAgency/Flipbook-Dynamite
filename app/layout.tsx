import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { authEnabled } from "@/lib/auth";
import { siteMetadata } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Site-wide search identity (canonical base, robots, social cards, Search
// Console proof) lives in lib/seo so it is testable; pages add their own
// title, description and canonical path on top.
export const metadata: Metadata = {
  ...siteMetadata,
  title: "Flipbook Dynamite — Turn PDFs into interactive flipbooks",
  description:
    "Upload a PDF and get a realistic page-flipping book with clickable links and a shareable URL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {authEnabled ? (
          // Clerk beacons usage data to clerk-telemetry.com, a host the CSP's
          // connect-src deliberately excludes. Left on, every page load would log
          // a violation for a request we do not want made anyway — noise that
          // would bury a real one. Disabled at the source instead.
          <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" telemetry={false}>
            {children}
          </ClerkProvider>
        ) : children}
      </body>
    </html>
  );
}
