-- 多图书馆支持：新建 Library 表，Shelf 重建加 libraryId（回填到默认馆），
-- code 唯一约束从全局改为「馆内唯一」。

-- CreateTable
CREATE TABLE "Library" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Library_name_key" ON "Library"("name");

-- 默认馆：现有全部书架归属它
INSERT INTO "Library"("name") VALUES ('默认图书馆');

-- Redesign Shelf：SQLite 无法 ALTER 加外键，重建表（与 Prisma 官方迁移策略一致）
CREATE TABLE "Shelf_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "libraryId" INTEGER NOT NULL DEFAULT 1,
    "typeId" INTEGER NOT NULL,
    "posX" REAL NOT NULL DEFAULT 0,
    "posZ" REAL NOT NULL DEFAULT 0,
    "rotation" REAL NOT NULL DEFAULT 0,
    "zone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shelf_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ShelfType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shelf_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Shelf_new"("id", "code", "libraryId", "typeId", "posX", "posZ", "rotation", "zone", "createdAt")
SELECT "id", "code", 1, "typeId", "posX", "posZ", "rotation", "zone", "createdAt" FROM "Shelf";

DROP TABLE "Shelf";
ALTER TABLE "Shelf_new" RENAME TO "Shelf";

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_libraryId_code_key" ON "Shelf"("libraryId", "code");

-- CreateIndex
CREATE INDEX "Shelf_zone_idx" ON "Shelf"("zone");

-- CreateIndex
CREATE INDEX "Shelf_libraryId_idx" ON "Shelf"("libraryId");
