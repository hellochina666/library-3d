import { create } from 'zustand';
import { api } from './api';
import type { BookHit, Highlight, Library, Shelf, ShelfType } from './types';

export interface PickedLayer {
  shelfId: number;
  shelfCode: string;
  layerId: number;
  layerIndex: number;
}

const LIB_KEY = 'library3d.currentLibraryId';

/** 摆放模式：place = 放新书架（选型号）；move = 挪动已有书架 */
export interface PlacementMode {
  mode: 'place' | 'move';
  typeId: number | null;
  shelfId: number | null;
  rotation: number;
}

const NO_PLACEMENT: PlacementMode = { mode: 'place', typeId: null, shelfId: null, rotation: 0 };

/** 在本馆已用编号之外，按 A-01、A-02… 顺序生成下一个书架编号 */
function nextCode(shelves: Shelf[]) {
  const used = new Set(shelves.map((s) => s.code));
  for (let letter = 0; letter < 26; letter++) {
    for (let n = 1; n <= 99; n++) {
      const c = `${String.fromCharCode(65 + letter)}-${String(n).padStart(2, '0')}`;
      if (!used.has(c)) return c;
    }
  }
  return `X-${Date.now() % 100000}`;
}

interface State {
  libraries: Library[];
  libraryId: number | null;
  shelves: Shelf[];
  types: ShelfType[];
  books: BookHit[];
  loading: boolean;
  error: string | null;

  query: string;
  results: BookHit[] | null;

  highlight: Highlight | null;
  pickedLayer: PickedLayer | null;
  /** 当前 Tab：检索 / 管理 / 摆放 / 统计 */
  tab: 'search' | 'manage' | 'layout' | 'stats';

  /** 3D 摆放模式：放新架 / 挪旧架 */
  placement: PlacementMode;
  placementMsg: string | null;

  loadAll: () => Promise<void>;
  loadLibraryData: () => Promise<void>;
  switchLibrary: (id: number) => Promise<void>;
  createLibrary: (name: string) => Promise<void>;
  renameLibrary: (id: number, name: string) => Promise<void>;
  deleteLibrary: (id: number) => Promise<void>;

  enterPlacement: (typeId: number) => void;
  enterMoveMode: (shelfId: number) => void;
  exitPlacement: () => void;
  rotatePlacement: () => void;
  placeShelf: (p: { typeId: number; posX: number; posZ: number; rotation: number }) => Promise<void>;
  moveShelfTo: (p: { posX: number; posZ: number; rotation: number }) => Promise<void>;

  search: (q: string) => Promise<void>;
  focusBook: (b: BookHit) => void;
  clearHighlight: () => void;
  pickLayer: (p: PickedLayer | null) => void;
  setTab: (t: State['tab']) => void;

  addBook: (input: {
    title: string;
    author?: string;
    isbn?: string;
    shelfId: number;
    layerId: number;
    slotIndex: number;
  }) => Promise<void>;
  moveBook: (
    id: number,
    body: { layerId?: number; slotIndex?: number; title?: string },
  ) => Promise<void>;
  removeBook: (id: number) => Promise<void>;

  addShelf: (input: {
    code: string;
    typeId: number;
    posX: number;
    posZ: number;
    rotation?: number;
    zone?: string;
  }) => Promise<void>;
  updateShelf: (id: number, body: Partial<Shelf>) => Promise<void>;
  removeShelf: (id: number) => Promise<void>;

  addType: (body: Partial<ShelfType>) => Promise<void>;
  removeType: (id: number) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  libraries: [],
  libraryId: null,
  shelves: [],
  types: [],
  books: [],
  loading: false,
  error: null,

  query: '',
  results: null,

  highlight: null,
  pickedLayer: null,
  tab: 'search',

  placement: NO_PLACEMENT,
  placementMsg: null,

  /** 一次性加载：馆列表 + 当前馆的布局与藏书，3D 场景完全由这份数据驱动 */
  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      let [libraries, types] = await Promise.all([api.libraries(), api.types()]);
      if (libraries.length === 0) {
        const first = await api.createLibrary('默认图书馆');
        libraries = [first];
      }
      const saved = Number(localStorage.getItem(LIB_KEY));
      const libraryId = libraries.some((l) => l.id === saved) ? saved : libraries[0].id;
      localStorage.setItem(LIB_KEY, String(libraryId));
      set({ libraries, types, libraryId, loading: false });
      await get().loadLibraryData();
    } catch (e: any) {
      set({ error: String(e?.message ?? e), loading: false });
    }
  },

  /** 拉取当前馆的书架布局与藏书（切换馆 / 摆放后刷新都走这里） */
  loadLibraryData: async () => {
    const { libraryId } = get();
    if (!libraryId) return;
    const [shelves, books] = await Promise.all([api.shelves(libraryId), api.allBooks(libraryId)]);
    set({ shelves, books, highlight: null, pickedLayer: null, results: null, query: '' });
  },

  switchLibrary: async (id) => {
    localStorage.setItem(LIB_KEY, String(id));
    set({ libraryId: id, placement: NO_PLACEMENT, placementMsg: null });
    await get().loadLibraryData();
  },

  createLibrary: async (name) => {
    const lib = await api.createLibrary(name);
    set((s) => ({ libraries: [...s.libraries, lib] }));
    await get().switchLibrary(lib.id);
  },

  renameLibrary: async (id, name) => {
    const lib = await api.renameLibrary(id, name);
    set((s) => ({ libraries: s.libraries.map((l) => (l.id === id ? { ...l, name: lib.name } : l)) }));
  },

  deleteLibrary: async (id) => {
    await api.deleteLibrary(id);
    const libraries = await api.libraries();
    const wasCurrent = get().libraryId === id;
    set({ libraries });
    if (libraries.length === 0) {
      const first = await api.createLibrary('默认图书馆');
      set({ libraries: [first] });
      await get().switchLibrary(first.id);
    } else if (wasCurrent) {
      await get().switchLibrary(libraries[0].id);
    } else {
      await get().loadLibraryData();
    }
  },

  enterPlacement: (typeId) =>
    set({ placement: { mode: 'place', typeId, shelfId: null, rotation: 0 }, placementMsg: null }),

  enterMoveMode: (shelfId) => {
    const s = get().shelves.find((x) => x.id === shelfId);
    if (!s) return;
    set({
      placement: { mode: 'move', typeId: s.typeId, shelfId, rotation: s.rotation },
      placementMsg: `移动 ${s.code}：在绿色空格点击新位置`,
    });
  },

  exitPlacement: () => set({ placement: NO_PLACEMENT, placementMsg: null }),
  rotatePlacement: () =>
    set((s) => ({ placement: { ...s.placement, rotation: (s.placement.rotation + 90) % 360 } })),

  /** 3D 里点击绿色空格 → 落位（后端仍会做权威间距校验）；成功后自动退出摆放 */
  placeShelf: async ({ typeId, posX, posZ, rotation }) => {
    const { libraryId, shelves, types } = get();
    if (!libraryId) return;
    const type = types.find((t) => t.id === typeId);
    if (!type) return;
    const code = nextCode(shelves);
    try {
      await api.createShelf({ code, libraryId, typeId, posX, posZ, rotation });
      set({ placement: NO_PLACEMENT, placementMsg: `已放置 ${code}（${type.name}）` });
      await get().loadLibraryData();
    } catch (e: any) {
      set({ placementMsg: `放不下：${String(e?.message ?? e)}` });
    }
  },

  /** 移动模式：把已有书架挪到新空格（PUT 同样过后端间距校验）；成功后自动退出 */
  moveShelfTo: async ({ posX, posZ, rotation }) => {
    const { placement, shelves } = get();
    if (placement.mode !== 'move' || placement.shelfId == null) return;
    const s = shelves.find((x) => x.id === placement.shelfId);
    try {
      await api.updateShelf(placement.shelfId, { posX, posZ, rotation });
      set({ placement: NO_PLACEMENT, placementMsg: `已移动 ${s?.code ?? ''}` });
      await get().loadLibraryData();
    } catch (e: any) {
      set({ placementMsg: `放不下：${String(e?.message ?? e)}` });
    }
  },

  /** 搜索：限定当前馆，命中即带出 shelfId/layerId，交给 3D 高亮 */
  search: async (q) => {
    set({ query: q });
    if (!q.trim()) {
      set({ results: null, highlight: null });
      return;
    }
    try {
      const results = await api.search(q.trim(), get().libraryId ?? undefined);
      set({ results });
      if (results.length > 0) get().focusBook(results[0]);
      else set({ highlight: null });
    } catch (e: any) {
      set({ error: String(e?.message ?? e) });
    }
  },

  focusBook: (b) =>
    set({
      highlight: {
        shelfId: b.shelfId,
        layerId: b.layerId,
        layerIndex: b.layerIndex,
        bookId: b.id,
      },
      pickedLayer: {
        shelfId: b.shelfId,
        shelfCode: b.shelfCode,
        layerId: b.layerId,
        layerIndex: b.layerIndex,
      },
    }),

  clearHighlight: () => set({ highlight: null }),

  pickLayer: (p) => set({ pickedLayer: p }),

  setTab: (t) => set({ tab: t }),

  addBook: async (input) => {
    await api.createBook(input);
    await get().loadLibraryData(); // 落库后重新拉全量，保证 3D 与数据一致
    const b = get().books.find(
      (x) => x.layerId === input.layerId && x.slotIndex === input.slotIndex,
    );
    if (b) get().focusBook(b);
  },

  moveBook: async (id, body) => {
    await api.moveBook(id, body);
    await get().loadLibraryData();
  },

  removeBook: async (id) => {
    await api.deleteBook(id);
    await get().loadLibraryData();
    // 若删的正是当前高亮的书，清掉高亮
    if (get().highlight?.bookId === id) set({ highlight: null });
  },

  addShelf: async (input) => {
    const { libraryId } = get();
    if (!libraryId) throw new Error('请先选择图书馆');
    await api.createShelf({ ...input, libraryId });
    await get().loadLibraryData();
  },

  updateShelf: async (id, body) => {
    await api.updateShelf(id, body);
    await get().loadLibraryData();
  },

  removeShelf: async (id: number) => {
    await api.deleteShelf(id);
    await get().loadLibraryData();
    // 架子没了，清掉相关高亮与选中
    const { highlight, pickedLayer } = get();
    if (highlight?.shelfId === id) set({ highlight: null });
    if (pickedLayer?.shelfId === id) set({ pickedLayer: null });
  },

  addType: async (body) => {
    await api.createType(body);
    const types = await api.types();
    set({ types });
    await get().loadLibraryData();
  },

  removeType: async (id: number) => {
    await api.deleteType(id);
    const types = await api.types();
    set({ types });
  },
}));
