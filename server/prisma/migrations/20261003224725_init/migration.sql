-- CreateTable
CREATE TABLE "ShelfType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "layerCount" INTEGER NOT NULL,
    "layerHeight" REAL NOT NULL DEFAULT 0.34,
    "width" REAL NOT NULL DEFAULT 1.0,
    "depth" REAL NOT NULL DEFAULT 0.32,
    "slotsPerLayer" INTEGER NOT NULL DEFAULT 40,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "posX" REAL NOT NULL DEFAULT 0,
    "posZ" REAL NOT NULL DEFAULT 0,
    "rotation" REAL NOT NULL DEFAULT 0,
    "zone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shelf_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ShelfType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Layer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shelfId" INTEGER NOT NULL,
    "layerIndex" INTEGER NOT NULL,
    "capacity" INTEGER,
    CONSTRAINT "Layer_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Book" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "shelfId" INTEGER NOT NULL,
    "layerId" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Book_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Book_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "Layer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShelfType_name_key" ON "ShelfType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_code_key" ON "Shelf"("code");

-- CreateIndex
CREATE INDEX "Shelf_zone_idx" ON "Shelf"("zone");

-- CreateIndex
CREATE INDEX "Layer_shelfId_idx" ON "Layer"("shelfId");

-- CreateIndex
CREATE UNIQUE INDEX "Layer_shelfId_layerIndex_key" ON "Layer"("shelfId", "layerIndex");

-- CreateIndex
CREATE INDEX "Book_title_idx" ON "Book"("title");

-- CreateIndex
CREATE INDEX "Book_isbn_idx" ON "Book"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "Book_layerId_slotIndex_key" ON "Book"("layerId", "slotIndex");
