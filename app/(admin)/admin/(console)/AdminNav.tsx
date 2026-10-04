"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// Icônes au trait (style Lucide), 18px, couleur héritée via CSS.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  ),
  users: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  support: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" />
    </Icon>
  ),
  mail: (
    <Icon>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </Icon>
  ),
  film: (
    <Icon>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5" />
    </Icon>
  ),
  logout: (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  ),
};

const GROUPS: { label: string; items: { href: string; label: string; icon: keyof typeof ICONS }[] }[] = [
  {
    label: "pilotage",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard" },
      { href: "/admin/users", label: "Utilisateurs", icon: "users" },
      { href: "/admin/support", label: "Support", icon: "support" },
    ],
  },
  {
    label: "exploitation",
    items: [
      { href: "/admin/montages", label: "Montages", icon: "film" },
      { href: "/admin/emails", label: "Emails", icon: "mail" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label} style={{ display: "contents" }}>
          <p className="admin-group-label">{group.label}</p>
          {group.items.map((item) => (
            <Link key={item.href} href={item.href} className="admin-nav-item" aria-current={isActive(item.href) ? "page" : undefined}>
              {ICONS[item.icon]}
              {item.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="admin-spacer" />
      <button type="button" onClick={logout} className="admin-nav-item" style={{ border: 0, background: "none", font: "inherit", cursor: "pointer", width: "100%", textAlign: "left" }}>
        {ICONS.logout}
        Se déconnecter
      </button>
    </>
  );
}
