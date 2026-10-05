import type { Metadata } from "next";
import localFont from "next/font/local";
import "./admin.css";

// Police hébergée avec l'app (cf. app/fonts) : voir app/layout.tsx.
const montserrat = localFont({
  variable: "--font-montserrat",
  src: [
    { path: "../../fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "naocast. admin",
  robots: { index: false, follow: false },
};

// Enveloppe commune (police + styles) au formulaire de connexion et à la
// console. Aucun contrôle d'accès ici : la page de connexion doit rester
// accessible, la garde est dans (console)/layout.tsx.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className={montserrat.variable}>{children}</div>;
}
