CREATE TABLE "RecipeImageCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cacheKey" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sourceTitle" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "cropXPercent" REAL,
  "cropYPercent" REAL,
  "cropZoom" REAL,
  "aiSelected" BOOLEAN NOT NULL DEFAULT false,
  "aiReason" TEXT,
  "hits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "RecipeImageCache_cacheKey_key" ON "RecipeImageCache"("cacheKey");
CREATE INDEX "RecipeImageCache_query_idx" ON "RecipeImageCache"("query");
CREATE INDEX "RecipeImageCache_lastUsedAt_idx" ON "RecipeImageCache"("lastUsedAt");
