"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./Navbar";
import { useApp } from "@/lib/i18n/I18nProvider";

const mobileHrefs = new Set(["/", "/smart-scan", "/recipes", "/food-log", "/water", "/me"]);
const mobileItems = navItems.filter((item) => mobileHrefs.has(item.href));

export function BottomNavigation() {
  const pathname = usePathname();
  const { t } = useApp();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95" aria-label="Mobile navigation">
      <div className="mx-auto grid max-w-xl grid-cols-6 gap-1">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium ${
                active
                  ? "bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200"
                  : "text-slate-500 dark:text-slate-300"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate px-0.5 text-[11px] sm:text-xs">{t(item.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
