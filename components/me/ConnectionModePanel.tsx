"use client";

import { AlertTriangle, CheckCircle2, CircleX, Copy, ImageIcon, RefreshCw, Server, Smartphone, Wifi } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { RuntimeConnectionMode, RuntimeStatusResponse, ServiceStatusState } from "@/lib/types/domain";

const stateStyle: Record<ServiceStatusState, { classes: string; icon: typeof CheckCircle2; labelKey: "status.ok" | "status.warning" | "status.error" }> = {
  ok: {
    classes: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-100",
    icon: CheckCircle2,
    labelKey: "status.ok"
  },
  warning: {
    classes: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-100",
    icon: AlertTriangle,
    labelKey: "status.warning"
  },
  error: {
    classes: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100",
    icon: CircleX,
    labelKey: "status.error"
  }
};

const modeLabelKey: Record<RuntimeConnectionMode, "runtime.mode.loopback" | "runtime.mode.lan" | "runtime.mode.public"> = {
  loopback: "runtime.mode.loopback",
  lan: "runtime.mode.lan",
  public: "runtime.mode.public"
};

function StatusBadge({ state }: { state: ServiceStatusState }) {
  const { t } = useApp();
  const style = stateStyle[state];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${style.classes}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(style.labelKey)}
    </span>
  );
}

function DetailTile({ icon: Icon, label, value, detail }: { icon: typeof Server; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{label}</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-950 dark:text-white">{value}</p>
          {detail ? <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function imageLabelKey(status: RuntimeStatusResponse) {
  if (status.imageGeneration.provider === "disabled") return "runtime.image.disabled";
  if (status.imageGeneration.provider === "gemini") return "runtime.image.gemini";
  if (status.imageGeneration.provider === "replicate") return "runtime.image.replicate";
  return "runtime.image.local";
}

export function ConnectionModePanel() {
  const { locale, t } = useApp();
  const [status, setStatus] = useState<RuntimeStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<RuntimeStatusResponse>("/api/runtime-status", { locale });
      setStatus(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyAddress(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1800);
  }

  const notes = status ? (locale === "zh-CN" ? status.notesZh : status.notesEn) : [];
  const imageDetail = status?.imageGeneration.endpoint ?? status?.imageGeneration.model ?? status?.imageGeneration.provider ?? "";

  return (
    <section className="panel grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("me.connectionTitle")}</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t("me.connectionSubtitle")}</p>
        </div>
        <button className="btn-secondary shrink-0" type="button" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {t("me.refreshConnection")}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {status ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailTile icon={Server} label={t("me.serverAddress")} value={status.serverOrigin} detail={status.isHttps ? "HTTPS" : "HTTP"} />
            <DetailTile icon={Wifi} label={t("me.connectionMode")} value={t(modeLabelKey[status.connectionMode])} detail={status.serverHost} />
            <DetailTile
              icon={Smartphone}
              label={t("me.apkAccess")}
              value={status.apkReachable ? t("runtime.apk.reachable") : t("runtime.apk.notReachable")}
              detail={status.apkReachable ? t("runtime.apk.sameNetwork") : t("runtime.apk.needsLan")}
            />
            <DetailTile icon={ImageIcon} label={t("me.imageGeneration")} value={t(imageLabelKey(status))} detail={imageDetail} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge state={status.state} />
            <button className="btn-secondary" type="button" onClick={() => void copyAddress(status.serverOrigin)}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied === status.serverOrigin ? t("runtime.copied") : t("me.copyServerAddress")}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{t("me.lanCandidates")}</h3>
              {status.lanOrigins.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {status.lanOrigins.map((origin) => (
                    <button
                      key={origin}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/30"
                      type="button"
                      onClick={() => void copyAddress(origin)}
                    >
                      <span className="min-w-0 break-all">{origin}</span>
                      <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("runtime.noLanAddress")}</p>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{t("me.connectionNotes")}</h3>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : null}
    </section>
  );
}
