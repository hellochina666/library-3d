export interface ShelfType {
  id: number;
  name: string;
  layerCount: number;
  layerHeight: number;
  width: number;
  depth: number;
  slotsPerLayer: number;
}

export interface Layer {
  id: number;
  shelfId: number;
  layerIndex: number;
  capacity: number | null;
  _count?: { books: number };
}

export interface Shelf {
  id: number;
  code: string;
  typeId: number;
  posX: number;
  posZ: number;
  rotation: number;
  zone: string | null;
  type: ShelfType;
  layers: Layer[];
}

/** 搜索命中的一本书，带完整定位信息（供 3D 高亮） */
export interface BookHit {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  slotIndex: number;
  shelfId: number;
  shelfCode: string;
  layerId: number;
  layerIndex: number;
  zone: string | null;
}

export interface Highlight {
  shelfId: number;
  layerId: number;
  layerIndex: number;
  bookId: number | null;
}
