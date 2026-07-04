"use client";

import Link from "next/link";
import { Activity, DatabaseBackup, Download, Server, Settings, Upload, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { useApp } from "@/lib/i18n/I18nProvider";
import { apiFetch } from "@/lib/client/api";
import { Toast, type ToastState } from "@/components/shared/Toast";

type BackupImportResponse = {
  summary: {
    foodLogs: number;
    recipes: number;
    scans: number;
    waterEntries: number;
    exerciseLogs: number;
    sleepLogs: number;
    weightLogs: number;
  };
};

const toolLinks = [
  {
    href: "/profile",
    titleKey: "me.profile",
    detailKey: "me.profileDetail",
    icon: UserRound
  },
  {
    href: "/status",
    titleKey: "me.status",
    detailKey: "me.statusDetail",
    icon: Server
  },
  {
    href: "/settings",
    titleKey: "me.settings",
    detailKey: "me.settingsDetail",
    icon: Settings
  }
] as const;

export default function MePage() {
  const { profileId, locale, t } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function exportBackup() {
    if (!profileId) return;
    setExporting(true);
    try {
      const response = await fetch("/api/backup", {
        headers: {
          accept: "application/json",
          "x-profile-id": profileId,
          "x-app-locale": locale
        }
      });
      if (!response.ok) {
        throw new Error(t("me.exportFailed"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `daily-health-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(t("me.exportSuccess"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("me.exportFailed"), "error");
    } finally {
      setExporting(false);
    }
  }

  async function importBackup(file: File) {
    if (!profileId) return;
    const confirmed = window.confirm(t("me.importConfirm"));
    if (!confirmed) return;
    setImporting(true);
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await apiFetch<BackupImportResponse>("/api/backup", {
        method: "POST",
        profileId,
        locale,
        body: { profileId, backup }
      });
      showToast(
        t("me.importSuccess")
          .replace("{foodLogs}", response.summary.foodLogs.toString())
          .replace("{recipes}", response.summary.recipes.toString()),
        "success"
      );
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("me.importFailed"), "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <main className="page-shell">
      <Toast toast={toast} />
      <section className="page-header">
        <h1 className="page-title">{t("me.title")}</h1>
        <p className="page-subtitle">{t("me.subtitle")}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {toolLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="panel transition hover:border-emerald-200 hover:bg-emerald-50/40 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/20">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950 dark:text-white">{t(item.titleKey)}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t(item.detailKey)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="panel grid gap-5">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-leaf" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("me.backupTitle")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="btn-primary justify-center" type="button" onClick={() => void exportBackup()} disabled={exporting || importing}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? t("common.loading") : t("me.exportData")}
          </button>
          <button className="btn-secondary justify-center" type="button" disabled={exporting || importing} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {importing ? t("common.loading") : t("me.importData")}
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importBackup(file);
          }}
        />
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">{t("me.localProfile")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{profileId ?? "-"}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
