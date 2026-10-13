import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Delivery Hub",
  description: "Local review and QA, with evidence.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
