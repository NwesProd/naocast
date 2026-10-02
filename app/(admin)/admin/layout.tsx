import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./admin.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
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
