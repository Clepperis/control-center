import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Control Center — asmeninė darbo erdvė",
  description: "Asmeninis AI valdymo centras",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="lt">
      <body>{children}</body>
    </html>
  );
}
