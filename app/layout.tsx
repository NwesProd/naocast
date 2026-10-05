import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Polices hébergées avec l'app (sous-ensemble latin, licence SIL OFL, cf. app/fonts) plutôt que
// téléchargées depuis Google Fonts au build : un accroc réseau chez Google faisait échouer le
// déploiement entier.
const spaceGrotesk = localFont({
  variable: "--font-space-grotesk",
  src: [
    { path: "./fonts/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

const plusJakartaSans = localFont({
  variable: "--font-plus-jakarta-sans",
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "naocast.",
  description: "Ton podcast manager",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-text font-body">{children}</body>
    </html>
  );
}
