"use client";

import { AlertTriangle, Bug, CheckCircle2, CircleX, Database, Image, Network, RefreshCw, Server, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { AppErrorLogView, ServiceStatusItem, ServiceStatusResponse, ServiceStatusState } from "@/lib/types/domain";
import { LoadingState } from "@/components/shared/LoadingState";

type ErrorLogsResponse = {
  logs: AppErrorLogView[];
};

const iconMap: Record<ServiceStatusItem["id"], typeof Server> = {
  app: Server,
  database: Database,
  ai: Sparkles,
  nutrition: Sparkles,
  recipeImages: Image,
  epicure: Network,
  mealdb: Image,
  localImage: Image
};

const stateStyle: Record<ServiceStatusState, { panel: string; icon: typeof CheckCircle2; labelKey: "status.ok" | "status.warning" | "status.error" }> = {
  ok: {
    panel: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-100",
    icon: CheckCircle2,
    labelKey: "status.ok"
  },
  warning: {
    panel: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-100",
    icon: AlertTriangle,
    labelKey: "status.warning"
  },
  error: {
    panel: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/35 dark:text-rose-100",
    icon: CircleX,
    labelKey: "status.error"
  }
};

const severityStyle: Record<AppErrorLogView["severity"], string> = {
  info: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-100",
  warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-100",
  error: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/35 dark:text-rose-100"
};

function StatusBadge({ state }: { state: ServiceStatusState }) {
  const { t } = useApp();
  const style = stateStyle[state];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${style.panel}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(style.labelKey)}
    </span>
  );
}

function ErrorLogCard({ log }: { log: AppErrorLogView }) {
  const { locale, t } = useApp();
  const details = [
    log.path ? `${t("status.errorPath")}: ${log.method ? `${log.method} ` : ""}${log.path}` : null,
    log.statusCode ? `${t("status.errorStatusCode")}: ${log.statusCode}` : null,
    log.userAgent ? `${t("status.errorUserAgent")}: ${log.userAgent}` : null
  ].filter(Boolean);

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(log.createdAt).toLocaleString(locale)}</p>
          <h3 className="mt-1 break-words text-sm font-semibold text-slate-950 dark:text-white">{log.message}</h3>
        </div>
        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${severityStyle[log.severity]}`}>
          {log.severity}
        </span>
      </div>
      <div className="mt-3 grid gap-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        <p>{t("status.errorSource")}: {log.source}</p>
        {details.map((detail) => (
          <p key={detail} className="break-words">{detail}</p>
        ))}
      </div>
    </article>
  );
}

function ServiceCard({ item }: { item: ServiceStatusItem }) {
  const { locale } = useApp();
  const Icon = iconMap[item.id];
  const title = locale === "zh-CN" ? item.titleZh : item.titleEn;
  const summary = locale === "zh-CN" ? item.summaryZh : item.summaryEn;
  const details = locale === "zh-CN" ? item.detailsZh : item.detailsEn;

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{summary}</p>
          </div>
        </div>
        <StatusBadge state={item.state} />
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-500 dark:text-slate-400">
        {item.latencyMs != null ? <p>{item.latencyMs} ms</p> : null}
        {details.map((detail) => (
          <p key={detail} className="break-words">{detail}</p>
        ))}
      </div>
    </article>
  );
}

export default function StatusPage() {
  const { locale, profileId, t } = useApp();
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);
  const [errorLogs, setErrorLogs] = useState<AppErrorLogView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, logsResponse] = await Promise.all([
        apiFetch<ServiceStatusResponse>("/api/service-status", { profileId, locale }),
        apiFetch<ErrorLogsResponse>("/api/error-logs?limit=8", { locale }).catch(() => ({ logs: [] }))
      ]);
      setStatus(response);
      setErrorLogs(logsResponse.logs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, profileId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <h1 className="page-title">{t("status.title")}</h1>
        <p className="page-subtitle">{t("status.subtitle")}</p>
      </section>
      <section className="panel flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("status.overall")}</p>
          <div className="mt-2">
            {status ? <StatusBadge state={status.overall} /> : <span className="text-sm text-slate-500">{t("common.loading")}</span>}
          </div>
          {status ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t("status.checkedAt")}: {new Date(status.checkedAt).toLocaleString(locale)}
            </p>
          ) : null}
        </div>
        <button className="btn-secondary" type="button" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {t("status.refresh")}
        </button>
      </section>
      {loading && !status ? <LoadingState /> : null}
      {error ? (
        <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </section>
      ) : null}
      {status ? (
        <section className="grid gap-4 md:grid-cols-2">
          {status.items.map((item) => (
            <ServiceCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}
      <section className="panel grid gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200">
            <Bug className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("status.recentErrors")}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("status.recentErrorsSubtitle")}</p>
          </div>
        </div>
        {errorLogs.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {errorLogs.map((log) => (
              <ErrorLogCard key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("status.noRecentErrors")}</p>
        )}
      </section>
    </main>
  );
}
