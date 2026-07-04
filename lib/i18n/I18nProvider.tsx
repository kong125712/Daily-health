"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { apiFetch } from "@/lib/client/api";
import type { AppLocale, ThemeMode } from "@/lib/types/domain";
import { dictionaries, normalizeLocale, type TranslationKey } from "./translations";

type SettingsResponse = {
  settings: {
    locale: AppLocale;
    theme: ThemeMode;
    defaultWaterTargetMl: number;
  };
};

type ProfileResponse = {
  settings: {
    locale: AppLocale;
    theme: ThemeMode;
    defaultWaterTargetMl: number;
  };
};

type AppContextValue = {
  locale: AppLocale;
  theme: ThemeMode;
  profileId: string | null;
  defaultWaterTargetMl: number;
  ready: boolean;
  t: (key: TranslationKey) => string;
  setLocale: (locale: AppLocale) => void;
  setTheme: (theme: ThemeMode) => void;
  setDefaultWaterTargetMl: (targetMl: number) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function createBrowserId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateProfileId() {
  const existing = localStorage.getItem("daily_health_profile_id");
  if (existing) {
    return existing;
  }
  const id = `local_${createBrowserId()}`;
  localStorage.setItem("daily_health_profile_id", id);
  return id;
}

function persistLocale(locale: AppLocale) {
  localStorage.setItem("daily_health_locale", locale);
  document.cookie = `daily_health_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [defaultWaterTargetMl, setDefaultWaterTargetMlState] = useState(2000);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedLocale = normalizeLocale(localStorage.getItem("daily_health_locale"));
    const storedTheme = (localStorage.getItem("daily_health_theme") as ThemeMode | null) ?? "light";
    setLocaleState(storedLocale);
    setThemeState(storedTheme === "dark" || storedTheme === "system" ? storedTheme : "light");
    persistLocale(storedLocale);

    const id = getOrCreateProfileId();
    setProfileId(id);

    apiFetch<ProfileResponse>("/api/profile", {
      method: "POST",
      body: { profileId: id },
      profileId: id,
      locale: storedLocale
    })
      .then((response) => {
        const dbLocale = normalizeLocale(response.settings.locale);
        setLocaleState(dbLocale);
        persistLocale(dbLocale);
        setThemeState(response.settings.theme);
        localStorage.setItem("daily_health_theme", response.settings.theme);
        setDefaultWaterTargetMlState(response.settings.defaultWaterTargetMl);
      })
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", resolved === "dark");
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  const saveSettings = useCallback(
    (updates: Partial<{ locale: AppLocale; theme: ThemeMode; defaultWaterTargetMl: number }>) => {
      if (!profileId) {
        return;
      }
      apiFetch<SettingsResponse>("/api/settings", {
        method: "PATCH",
        profileId,
        locale,
        body: {
          profileId,
          ...updates
        }
      }).catch((error: unknown) => console.error(error));
    },
    [locale, profileId]
  );

  const changeLocale = useCallback(
    (nextLocale: AppLocale) => {
      setLocaleState(nextLocale);
      persistLocale(nextLocale);
      saveSettings({ locale: nextLocale });
    },
    [saveSettings]
  );

  const changeTheme = useCallback(
    (nextTheme: ThemeMode) => {
      setThemeState(nextTheme);
      localStorage.setItem("daily_health_theme", nextTheme);
      saveSettings({ theme: nextTheme });
    },
    [saveSettings]
  );

  const changeWaterTarget = useCallback(
    (targetMl: number) => {
      setDefaultWaterTargetMlState(targetMl);
      saveSettings({ defaultWaterTargetMl: targetMl });
    },
    [saveSettings]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      locale,
      theme,
      profileId,
      defaultWaterTargetMl,
      ready,
      t: (key) => dictionaries[locale][key] ?? dictionaries.en[key],
      setLocale: changeLocale,
      setTheme: changeTheme,
      setDefaultWaterTargetMl: changeWaterTarget
    }),
    [changeLocale, changeTheme, changeWaterTarget, defaultWaterTargetMl, locale, profileId, ready, theme]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider.");
  }
  return context;
}
