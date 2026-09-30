import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "UW Pickleball · Exec", template: "%s · UW Pickleball" },
  description: "University of Waterloo Pickleball Club executive dashboard.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
