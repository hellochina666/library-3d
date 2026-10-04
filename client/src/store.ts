import { create } from 'zustand';
import { api } from './api';
import type { BookHit, Highlight, Shelf, ShelfType } from './types';

export interface PickedLayer {
  shelfId: number;
  shelfCode: string;
  layerId: number;
  layerIndex: number;
}

interface State {
  shelves: Shelf[];
  types: ShelfType[];
  books: BookHit[];
  loading: boolean;
  error: string | null;

  query: string;
  results: BookHit[] | null;

  highlight: Highlight | null;
  pickedLayer: PickedLayer | null;
  /** 当前 Tab：检索 / 管理 / 布局 / 统计 */
  tab: 'search' | 'manage' | 'layout' | 'stats';

  loadAll: () => Promise<void>;
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

  /** 表格生成布局：整体重建（清空旧布局），成功后自动重拉全量 */
  applyLayout: (
    items: { code: string; layerCount: number; row: number; col: number }[],
  ) => Promise<{ created: number; cleared: { shelves: number; books: number } | null }>;

  addType: (body: Partial<ShelfType>) => Promise<void>;
  removeType: (id: number) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
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

  /** 一次性加载布局 + 全部藏书，3D 场景完全由这份数据驱动 */
  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [shelves, types, books] = await Promise.all([
        api.shelves(),
        api.types(),
        api.allBooks(),
      ]);
      set({ shelves, types, books, loading: false });
    } catch (e: any) {
      set({ error: String(e?.message ?? e), loading: false });
    }
  },

  /** 搜索：命中即带出 shelfId/layerId，交给 3D 高亮 */
  search: async (q) => {
    set({ query: q });
    if (!q.trim()) {
      set({ results: null, highlight: null });
      return;
    }
    try {
      const results = await api.search(q.trim());
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
    await get().loadAll(); // 落库后重新拉全量，保证 3D 与数据一致
    const b = get().books.find(
      (x) => x.layerId === input.layerId && x.slotIndex === input.slotIndex,
    );
    if (b) get().focusBook(b);
  },

  moveBook: async (id, body) => {
    await api.moveBook(id, body);
    await get().loadAll();
  },

  removeBook: async (id) => {
    await api.deleteBook(id);
    await get().loadAll();
    // 若删的正是当前高亮的书，清掉高亮
    if (get().highlight?.bookId === id) set({ highlight: null });
  },

  addShelf: async (input) => {
    await api.createShelf(input);
    await get().loadAll();
  },

  updateShelf: async (id, body) => {
    await api.updateShelf(id, body);
    await get().loadAll();
  },

  removeShelf: async (id: number) => {
    await api.deleteShelf(id);
    await get().loadAll();
    // 架子没了，清掉相关高亮与选中
    const { highlight, pickedLayer } = get();
    if (highlight?.shelfId === id) set({ highlight: null });
    if (pickedLayer?.shelfId === id) set({ pickedLayer: null });
  },

  /** 表格生成布局：整体重建图书馆。成功后清掉高亮并重拉全量 */
  applyLayout: async (items) => {
    const res = await api.applyLayout({ clear: true, items });
    set({ highlight: null, pickedLayer: null, results: null, query: '' });
    await get().loadAll();
    return { created: res.created, cleared: res.cleared };
  },

  addType: async (body) => {
    await api.createType(body);
    await get().loadAll();
  },

  removeType: async (id) => {
    await api.deleteType(id);
    await get().loadAll();
  },
}));
