import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research LaTeX Studio Beta",
  description: "High-fidelity LaTeX recovery and conversion for academic documents"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
