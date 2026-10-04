import { useStore } from '../store';
import type { BookHit } from '../types';

/** 点击书本（3D 或检索结果）后浮在画布上的详情卡 */
export function BookCard({ book }: { book: BookHit }) {
  const { focusBook, pickBook } = useStore();

  return (
    <div className="book-card">
      <h3>
        <span>《{book.title}》</span>
        <button className="close" onClick={() => pickBook(null)}>
          关闭
        </button>
      </h3>
      <dl>
        <dt>作者</dt>
        <dd>{book.author || '—'}</dd>
        <dt>ISBN</dt>
        <dd>{book.isbn || '—'}</dd>
        <dt>位置</dt>
        <dd>
          {book.shelfCode} · 第 {book.layerIndex} 层 · 槽位 {book.slotIndex}
        </dd>
        <dt>区域</dt>
        <dd>{book.zone || '未分区'}</dd>
      </dl>
      <div className="bc-actions">
        <button className="mini primary" onClick={() => focusBook(book)}>
          高亮定位
        </button>
      </div>
    </div>
  );
}
