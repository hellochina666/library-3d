import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';

/**
 * 布局表格编辑器（三期：自定义生成 3D 图书馆）
 *
 * 语义：每个格子对应地面上的一个位置。
 *   - 格子里填「编号:层数」，如 A-01:5 → 放一个 5 层的书架
 *   - 留空 → 该位置没有书架（过道）
 * 生成时整体重建图书馆（旧书架与藏书会被清空）。
 */

const GRID_KEY = 'library3d.layout.grid';
const MAX_ROWS = 10;
const MAX_COLS = 12;

/** 默认示例：3 排 4 列，7 个书架（含空格），层数各不相同 */
const SAMPLE: string[][] = [
  ['A-01:4', 'A-02:4', 'A-03:5', ''],
  ['B-01:5', '', 'B-02:6', ''],
  ['C-01:4', 'C-02:4', 'C-03:4', 'C-04:5'],
];

function emptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
}

/** 从 localStorage 恢复上次填的表格；没有则用示例 */
function loadGrid(): { rows: number; cols: number; grid: string[][] } {
  try {
    const raw = localStorage.getItem(GRID_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (
        Array.isArray(p.grid) &&
        p.grid.length >= 1 &&
        p.grid.length <= MAX_ROWS &&
        Array.isArray(p.grid[0]) &&
        p.grid[0].length >= 1 &&
        p.grid[0].length <= MAX_COLS
      ) {
        const rows = p.grid.length;
        const cols = Math.max(...p.grid.map((r: string[]) => r.length));
        return { rows, cols, grid: emptyGrid(rows, cols).map((r, i) => r.map((_, j) => p.grid[i]?.[j] ?? '')) };
      }
    }
  } catch {
    /* 忽略坏数据 */
  }
  return { rows: SAMPLE.length, cols: SAMPLE[0].length, grid: SAMPLE.map((r) => [...r]) };
}

/** 解析格子内容「编号:层数」，兼容全角冒号与「层」字后缀 */
const CELL_RE = /^([^\s:：]{1,24})\s*[:：]\s*(\d{1,2})\s*层?$/;

interface Parsed {
  items: { code: string; layerCount: number; row: number; col: number }[];
  /** 格子错误信息（key = r,c） */
  cellErr: Map<string, string>;
  /** 预览用的层数分布 */
  dist: { layerCount: number; count: number }[];
}

export function LayoutGrid() {
  const { shelves, books, applyLayout, setTab } = useStore();

  const init = useMemo(loadGrid, []);
  const [rows, setRows] = useState(init.rows);
  const [cols, setCols] = useState(init.cols);
  const [grid, setGrid] = useState<string[][]>(init.grid);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 表格内容自动存草稿，刷新不丢
  useEffect(() => {
    try {
      localStorage.setItem(GRID_KEY, JSON.stringify({ rows, cols, grid }));
    } catch {
      /* 存不了就算了 */
    }
  }, [rows, cols, grid]);

  /** 解析整张表格 */
  const parsed = useMemo<Parsed>(() => {
    const items: Parsed['items'] = [];
    const cellErr = new Map<string, string>();
    const distMap = new Map<number, number>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const raw = (grid[r]?.[c] ?? '').trim();
        if (!raw) continue; // 空格 = 没有书架
        const m = CELL_RE.exec(raw);
        if (!m) {
          cellErr.set(`${r},${c}`, '格式应为 编号:层数，如 A-01:5');
          continue;
        }
        const code = m[1];
        const layerCount = Number(m[2]);
        if (layerCount < 1 || layerCount > 20) {
          cellErr.set(`${r},${c}`, `层数须在 1~20（${code}）`);
          continue;
        }
        const dup = items.find((it) => it.code === code);
        if (dup) {
          cellErr.set(`${r},${c}`, `编号 ${code} 与第 ${dup.row + 1}排第${dup.col + 1}列重复`);
          continue;
        }
        items.push({ code, layerCount, row: r, col: c });
        distMap.set(layerCount, (distMap.get(layerCount) ?? 0) + 1);
      }
    }
    const dist = [...distMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([layerCount, count]) => ({ layerCount, count }));
    return { items, cellErr, dist };
  }, [grid, rows, cols]);

  const resize = (nr: number, nc: number) => {
    nr = Math.min(MAX_ROWS, Math.max(1, nr));
    nc = Math.min(MAX_COLS, Math.max(1, nc));
    setRows(nr);
    setCols(nc);
    setGrid((g) => Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => g[r]?.[c] ?? '')));
  };

  const setCell = (r: number, c: number, v: string) => {
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));
  };

  /** 把当前 3D 布局反解析回表格（按 posZ 聚成排、posX 聚成列） */
  const importCurrent = () => {
    setErr(null);
    setMsg(null);
    if (shelves.length === 0) {
      setErr('当前图书馆还没有书架，无从导入');
      return;
    }
    const cluster = (vals: number[]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const keys: number[] = [];
      for (const v of sorted) {
        if (keys.length === 0 || v - keys[keys.length - 1] > 0.6) keys.push(v);
      }
      return keys;
    };
    const nearest = (keys: number[], v: number) =>
      keys.reduce((best, k, i) => (Math.abs(k - v) < Math.abs(keys[best] - v) ? i : best), 0);

    const rowKeys = cluster(shelves.map((s) => s.posZ));
    const colKeys = cluster(shelves.map((s) => s.posX));
    const g = emptyGrid(rowKeys.length, colKeys.length);
    for (const s of shelves) {
      g[nearest(rowKeys, s.posZ)][nearest(colKeys, s.posX)] = `${s.code}:${s.type.layerCount}`;
    }
    setRows(rowKeys.length);
    setCols(colKeys.length);
    setGrid(g);
    setMsg(`已导入 ${shelves.length} 个书架到表格，可修改后重新生成`);
  };

  const generate = async () => {
    setErr(null);
    setMsg(null);
    const n = parsed.items.length;
    if (n === 0) {
      setErr('表格里没有任何有效书架，至少填一个「编号:层数」');
      return;
    }
    if (parsed.cellErr.size > 0) {
      setErr('表格里有格式错误的格子（红框），修正后再生成');
      return;
    }
    const ok = confirm(
      books.length > 0 || shelves.length > 0
        ? `将整体重建图书馆：\n\n· 删除现有 ${shelves.length} 个书架 / ${books.length} 本书（不可恢复）\n· 按表格创建 ${n} 个新书架（各层为空）\n\n确定继续？`
        : `将按表格创建 ${n} 个书架。确定继续？`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await applyLayout(parsed.items);
      setMsg(`已生成 ${res.created} 个书架，切换到「检索」页查看 3D 效果`);
      setTab('search');
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const totalBooks = books.length;

  return (
    <section className="panel">
      <h2>布局表格 → 3D 图书馆</h2>
      <p className="muted">
        每格对应地面一个位置：填 <b>编号:层数</b>（如 A-01:5）就放书架，<b>留空就是没有书架</b>。
        生成会<b>整体重建</b>图书馆（现有 {shelves.length} 架 / {totalBooks} 本书将被替换）。
      </p>

      <div className="lg-toolbar">
        <span className="muted small">
          {rows} 排 × {cols} 列
        </span>
        <button className="mini" onClick={() => resize(rows, cols - 1)} disabled={cols <= 1}>
          −列
        </button>
        <button className="mini" onClick={() => resize(rows, cols + 1)} disabled={cols >= MAX_COLS}>
          +列
        </button>
        <button className="mini" onClick={() => resize(rows - 1, cols)} disabled={rows <= 1}>
          −排
        </button>
        <button className="mini" onClick={() => resize(rows + 1, cols)} disabled={rows >= MAX_ROWS}>
          +排
        </button>
        <span className="lg-sep" />
        <button className="mini" onClick={() => { setRows(SAMPLE.length); setCols(SAMPLE[0].length); setGrid(SAMPLE.map((r) => [...r])); setMsg(null); setErr(null); }}>
          载入示例
        </button>
        <button className="mini" onClick={importCurrent}>
          导入当前布局
        </button>
        <button className="mini" onClick={() => { setGrid(emptyGrid(rows, cols)); setMsg(null); setErr(null); }}>
          清空
        </button>
      </div>

      <div className="lg-table-wrap">
        <table className="lg-table">
          <thead>
            <tr>
              <th className="lg-corner" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c}>{c + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th>第{r + 1}排</th>
                {Array.from({ length: cols }, (_, c) => {
                  const bad = parsed.cellErr.has(`${r},${c}`);
                  return (
                    <td key={c}>
                      <input
                        className={bad ? 'lg-cell bad' : 'lg-cell'}
                        value={grid[r]?.[c] ?? ''}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        placeholder="空=无"
                        title={bad ? parsed.cellErr.get(`${r},${c}`) : '编号:层数，如 A-01:5'}
                        spellCheck={false}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg-preview">
        {parsed.items.length === 0 ? (
          <span className="muted small">还没有有效书架 —— 试着先「载入示例」</span>
        ) : (
          <span className="muted small">
            将创建 <b>{parsed.items.length}</b> 个书架：
            {parsed.dist.map((d) => (
              <span key={d.layerCount} className="chip">
                {d.layerCount}层 ×{d.count}
              </span>
            ))}
          </span>
        )}
      </div>

      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <button
        className="primary"
        onClick={generate}
        disabled={busy || parsed.items.length === 0 || parsed.cellErr.size > 0}
      >
        {busy ? '生成中…' : `生成 3D 布局（${parsed.items.length} 架）`}
      </button>
    </section>
  );
}
