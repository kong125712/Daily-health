import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import { dictionaries, normalizeLocale, type TranslationKey } from "../../../../lib/i18n/translations";
import type { AppLocale, ThemeMode } from "../domain";
import type { CachedAuthStatus } from "../auth/status";
import { revalidateCloudSession } from "../auth/cloud";
import { writeCachedAuthStatus } from "../auth/statusStore";
import { resolveAdapter } from "../data/resolveAdapter";
import type { DataAdapter } from "../data/DataAdapter";

type AppContextValue = {
  adapter: DataAdapter;
  authStatus: CachedAuthStatus;
  locale: AppLocale;
  theme: ThemeMode;
  defaultWaterTargetMl: number;
  initialized: boolean;
  t: (key: TranslationKey) => string;
  activateLocalMode: () => Promise<void>;
  activateCloudSession: (status: CachedAuthStatus) => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  // This synchronous selection is the no-spinner startup decision. Network
  // revalidation can replace it later without blocking first paint.
  const [selection, setSelection] = useState(() => resolveAdapter());
  const [locale, setLocaleState] = useState<AppLocale>("en");
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [defaultWaterTargetMl, setDefaultWaterTargetMl] = useState(2000);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    void selection.adapter.ensureProfile()
      .then(({ settings }) => {
        if (!active) return;
        setLocaleState(normalizeLocale(settings.locale));
        setThemeState(settings.theme);
        setDefaultWaterTargetMl(settings.defaultWaterTargetMl);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitialized(true);
      });
    return () => { active = false; };
  }, [selection.adapter]);

  useEffect(() => {
    let active = true;
    void revalidateCloudSession(selection.status).then(async (next) => {
      if (!active || !next) return;
      if (JSON.stringify(next) === JSON.stringify(selection.status)) return;
      await writeCachedAuthStatus(next);
      if (active) setSelection(resolveAdapter());
    });
    return () => { active = false; };
  }, [selection.status]);

  const activateLocalMode = useCallback(async () => {
    const next = { ...selection.status, subscribed: false, localMirror: false, testMode: true, accessToken: null } satisfies CachedAuthStatus;
    if (Platform.OS !== "web") await writeCachedAuthStatus(next);
    setSelection(resolveAdapter());
  }, [selection.status]);

  const activateCloudSession = useCallback(async (status: CachedAuthStatus) => {
    await writeCachedAuthStatus(status);
    setSelection(resolveAdapter());
  }, []);

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    const settings = await selection.adapter.saveSettings({ locale: nextLocale });
    setDefaultWaterTargetMl(settings.defaultWaterTargetMl);
  }, [selection.adapter]);

  const setTheme = useCallback(async (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    await selection.adapter.saveSettings({ theme: nextTheme });
  }, [selection.adapter]);

  const value = useMemo<AppContextValue>(() => ({
    adapter: selection.adapter,
    authStatus: selection.status,
    locale,
    theme,
    defaultWaterTargetMl,
    initialized,
    t: (key) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
    activateLocalMode,
    activateCloudSession,
    setLocale,
    setTheme
  }), [activateCloudSession, activateLocalMode, defaultWaterTargetMl, initialized, locale, selection, setLocale, setTheme, theme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider.");
  return context;
}
