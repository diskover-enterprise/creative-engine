"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/brands", label: "Brands" },
  { href: "/products", label: "Products" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <span className="text-sm font-semibold tracking-wide">
          Creative Engine
        </span>
        <nav className="flex gap-6">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "text-sm font-medium text-foreground"
                    : "text-sm font-medium text-foreground/50 hover:text-foreground"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
