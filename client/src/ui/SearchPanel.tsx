import { useState } from 'react';
import { useStore } from '../store';

export function SearchPanel() {
  const [q, setQ] = useState('');
  const { search, results, highlight, shelves, focusBook, clearHighlight } = useStore();

  const hitShelf = highlight ? shelves.find((s) => s.id === highlight.shelfId) : null;

  return (
    <section className="panel">
      <h2>查找图书</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="书名 / 作者 / ISBN，如：明朝"
        />
        <div className="row">
          <button type="submit">定位</button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setQ('');
              clearHighlight();
              useStore.setState({ results: null });
            }}
          >
            清除
          </button>
        </div>
      </form>

      {results && (
        <div className="results">
          {results.length === 0 && <p className="muted">没有匹配的图书</p>}
          {results.map((b) => (
            <button
              key={b.id}
              className={`result ${highlight?.bookId === b.id ? 'active' : ''}`}
              onClick={() => focusBook(b)}
            >
              <span className="t">{b.title}</span>
              <span className="loc">
                {b.shelfCode} · 第 {b.layerIndex} 层 · 槽位 {b.slotIndex}
              </span>
            </button>
          ))}
        </div>
      )}

      {highlight && hitShelf && (
        <div className="loc-card">
          <strong>已定位</strong>
          <div>
            书架 <b>{hitShelf.code}</b>（{hitShelf.type.layerCount} 层，{hitShelf.zone ?? '—'}）
          </div>
          <div>
            第 <b>{highlight.layerIndex}</b> 层已高亮
          </div>
        </div>
      )}
    </section>
  );
}
