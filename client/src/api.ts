import type { BookHit, Shelf, ShelfType } from './types';

// 开发环境走 Vite 代理 /api -> http://localhost:3000；
// 生产环境（单端口，由 NestJS 同时提供静态页与 API）下 VITE_API_BASE 为空，直接请求同源。
const BASE: string = import.meta.env.VITE_API_BASE ?? '/api';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `请求失败 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ---- 布局 ----
  /** 书架布局树（3D 渲染的唯一数据源） */
  shelves: () => json<Shelf[]>('/shelves'),
  types: () => json<ShelfType[]>('/shelves/types'),
  createType: (body: Partial<ShelfType>) =>
    json<ShelfType>('/shelves/types', { method: 'POST', body: JSON.stringify(body) }),
  deleteType: (id: number) => json<ShelfType>(`/shelves/types/${id}`, { method: 'DELETE' }),

  createShelf: (body: {
    code: string;
    typeId: number;
    posX: number;
    posZ: number;
    rotation?: number;
    zone?: string;
  }) => json<Shelf>('/shelves', { method: 'POST', body: JSON.stringify(body) }),
  updateShelf: (id: number, body: Partial<Shelf>) =>
    json<Shelf>(`/shelves/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteShelf: (id: number) => json<Shelf>(`/shelves/${id}`, { method: 'DELETE' }),

  // ---- 图书 ----
  /** 全部书籍（带定位，用于在 3D 里摆书） */
  allBooks: () => json<BookHit[]>('/books'),
  /** 搜索：命中后返回 shelfId/layerId，前端据此高亮 */
  search: (q: string) => json<BookHit[]>(`/books?q=${encodeURIComponent(q)}`),
  booksOfLayer: (layerId: number) => json<BookHit[]>(`/books?layerId=${layerId}`),
  createBook: (body: {
    title: string;
    author?: string;
    isbn?: string;
    shelfId: number;
    layerId: number;
    slotIndex: number;
  }) => json<BookHit>('/books', { method: 'POST', body: JSON.stringify(body) }),
  /** 移动 / 编辑书籍 */
  moveBook: (
    id: number,
    body: { layerId?: number; slotIndex?: number; title?: string; author?: string; isbn?: string },
  ) => json<BookHit>(`/books/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBook: (id: number) => json<BookHit>(`/books/${id}`, { method: 'DELETE' }),
};
