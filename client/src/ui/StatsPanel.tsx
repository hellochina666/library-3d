import { useMemo } from 'react';
import { useStore } from '../store';
import type { BookHit, Shelf } from '../types';

function computeStats(shelves: Shelf[], books: BookHit[]) {
  let totalLayers = 0;
  let totalCapacity = 0;

  const zoneMap = new Map<string, { shelves: number; layers: number; capacity: number; used: number }>();
  const load: { label: string; used: number; capacity: number }[] = [];

  for (const s of shelves) {
    const zone = s.zone ?? '未分区';
    if (!zoneMap.has(zone)) {
      zoneMap.set(zone, { shelves: 0, layers: 0, capacity: 0, used: 0 });
    }
    const g = zoneMap.get(zone)!;
    g.shelves += 1;

    for (const l of s.layers) {
      const cap = l.capacity ?? s.type.slotsPerLayer;
      const used = l._count?.books ?? books.filter((b) => b.layerId === l.id).length;
      totalLayers += 1;
      totalCapacity += cap;
      g.layers += 1;
      g.capacity += cap;
      g.used += used;
      load.push({ label: `${s.code} 第 ${l.layerIndex} 层`, used, capacity: cap });
    }
  }

  const zones = [...zoneMap.entries()]
    .map(([zone, v]) => ({
      zone,
      ...v,
      ratio: v.capacity > 0 ? v.used / v.capacity : 0,
    }))
    .sort((a, b) => b.ratio - a.ratio);

  const hottest = load
    .map((l) => ({ ...l, ratio: l.capacity > 0 ? l.used / l.capacity : 0 }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5);

  return {
    totalShelves: shelves.length,
    totalLayers,
    totalCapacity,
    totalBooks: books.length,
    usage: totalCapacity > 0 ? books.length / totalCapacity : 0,
    zones,
    hottest,
  };
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export function StatsPanel() {
  const { shelves, books } = useStore();
  const s = useMemo(() => computeStats(shelves, books), [shelves, books]);

  if (shelves.length === 0) {
    return (
      <section className="panel">
        <h2>库存统计</h2>
        <p className="muted">暂无书架数据</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>库存统计</h2>

      <div className="stat-grid">
        <div className="stat-card">
          <b>{s.totalBooks}</b>
          <span>藏书总数</span>
        </div>
        <div className="stat-card">
          <b>{s.totalShelves}</b>
          <span>书架</span>
        </div>
        <div className="stat-card">
          <b>{s.totalLayers}</b>
          <span>层数</span>
        </div>
        <div className="stat-card">
          <b>{pct(s.usage)}</b>
          <span>总占用率</span>
        </div>
      </div>

      <div className="bar big">
        <div
          className={`bar-inner ${s.usage > 0.85 ? 'danger' : s.usage > 0.6 ? 'warn' : ''}`}
          style={{ width: `${Math.min(100, s.usage * 100)}%` }}
        />
      </div>
      <p className="muted">
        总容量 {s.totalCapacity} 槽位 · 已用 {s.totalBooks} · 剩余 {s.totalCapacity - s.totalBooks}
      </p>

      <h3 className="sub">各区域占用率</h3>
      {s.zones.map((z) => (
        <div key={z.zone} className="zone-row">
          <div className="zone-head">
            <span>{z.zone}</span>
            <span className="muted">
              {z.shelves} 架 / {z.layers} 层 · {z.used}/{z.capacity} · {pct(z.ratio)}
            </span>
          </div>
          <div className="bar">
            <div
              className={`bar-inner ${z.ratio > 0.85 ? 'danger' : z.ratio > 0.6 ? 'warn' : ''}`}
              style={{ width: `${Math.min(100, z.ratio * 100)}%` }}
            />
          </div>
        </div>
      ))}

      <h3 className="sub">最满的层 TOP 5</h3>
      {s.hottest.length === 0 ? (
        <p className="muted">暂无数据</p>
      ) : (
        <ul className="hot-list">
          {s.hottest.map((h) => (
            <li key={h.label}>
              <span>{h.label}</span>
              <span className="muted">
                {h.used}/{h.capacity} · {pct(h.ratio)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
