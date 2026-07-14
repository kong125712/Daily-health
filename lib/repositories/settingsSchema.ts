import { prisma } from "@/lib/db";

const appSettingsColumns = ["aiProvider", "geminiApiKey", "openaiApiKey"] as const;
let schemaReady: Promise<void> | null = null;

export function ensureAppSettingsSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>("PRAGMA table_info(\"AppSettings\")");
      const present = new Set(columns.map((column) => column.name));

      for (const column of appSettingsColumns) {
        if (!present.has(column)) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "AppSettings" ADD COLUMN "${column}" TEXT`);
        }
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}
