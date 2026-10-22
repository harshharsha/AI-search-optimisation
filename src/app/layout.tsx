import type { Metadata } from "next";
import { Bricolage_Grotesque, Onest } from "next/font/google";
import "./globals.css";
import { authRequired } from "../lib/auth";
import AppHeader from "../components/app-header";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
});
const body = Onest({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "AISOA: AI visibility tracker",
  description:
    "Open-source tracking of how AI models mention and cite your brand.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AppHeader showLogout={authRequired()} />
        {children}
      </body>
    </html>
  );
}
