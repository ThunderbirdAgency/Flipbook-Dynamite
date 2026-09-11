import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { authEnabled } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Flipbook Dynamite — Turn PDFs into interactive flipbooks",
  description:
    "Upload a PDF and get a realistic page-flipping book with clickable links and a shareable URL.",
  openGraph: {
    title: "Flipbook Dynamite",
    description: "Turn any PDF into an interactive page-flipping book.",
    url: appUrl,
    siteName: "Flipbook Dynamite",
  },
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
          <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
            {children}
          </ClerkProvider>
        ) : children}
      </body>
    </html>
  );
}
