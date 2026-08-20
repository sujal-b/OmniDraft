import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omnidraft — Turn One Idea into Multi-Platform Content",
  description: "Turn one raw thought into platform-ready drafts for LinkedIn, X, Newsletter, and Blog with Omnidraft.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
