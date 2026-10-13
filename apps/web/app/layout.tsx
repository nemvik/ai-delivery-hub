import type { Metadata } from "next";
import "@fontsource-variable/figtree";
import "./globals.css";
export const metadata: Metadata = {
  title: "Delivery Hub",
  description: "Local review and QA, with evidence.",
};
// Applies the remembered light/dark choice before the first paint.
const themeScript = `try{var t=localStorage.getItem("hub-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
