"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  CalendarDays,
  Droplets,
  HeartPulse,
  Home,
  LayoutGrid,
  Salad,
  ScanSearch,
  Utensils
} from "lucide-react";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export const navItems: Array<{
  href: string;
  label: TranslationKey;
  icon: typeof Home;
}> = [
  { href: "/", label: "nav.home", icon: Home },
  { href: "/smart-scan", label: "nav.smartScan", icon: ScanSearch },
  { href: "/recipes", label: "nav.recipes", icon: Salad },
  { href: "/food-log", label: "nav.foodLog", icon: Utensils },
  { href: "/water", label: "nav.water", icon: Droplets },
  { href: "/exercise", label: "nav.exercise", icon: Activity },
  { href: "/wellness", label: "nav.wellness", icon: HeartPulse },
  { href: "/history", label: "nav.history", icon: CalendarDays },
  { href: "/my-recipes", label: "nav.myRecipes", icon: BookOpen },
  { href: "/me", label: "nav.me", icon: LayoutGrid }
];

export function Navbar() {
  const pathname = usePathname();
  const { t } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf text-white">
            <HeartPulse className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-semibold text-slate-950 dark:text-white">{t("app.name")}</span>
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                  active
                    ? "bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
