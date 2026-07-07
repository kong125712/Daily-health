CREATE TABLE "AppErrorLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT,
  "source" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'error',
  "message" TEXT NOT NULL,
  "path" TEXT,
  "method" TEXT,
  "statusCode" INTEGER,
  "stack" TEXT,
  "userAgent" TEXT,
  "detailsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AppErrorLog_createdAt_idx" ON "AppErrorLog"("createdAt");
CREATE INDEX "AppErrorLog_profileId_createdAt_idx" ON "AppErrorLog"("profileId", "createdAt");
CREATE INDEX "AppErrorLog_source_createdAt_idx" ON "AppErrorLog"("source", "createdAt");
