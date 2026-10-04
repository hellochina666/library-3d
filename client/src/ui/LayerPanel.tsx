import { useMemo, useState } from 'react';
import { useStore } from '../store';

/** 点击 3D 层板后，反查该层放了哪些书，并支持移动 / 删除 */
export function LayerPanel() {
  const { pickedLayer, books, shelves, focusBook, moveBook, removeBook } = useStore();
  const [movingId, setMovingId] = useState<number | null>(null);
  const [target, setTarget] = useState<{ shelfId: number; layerId: number; slotIndex: number }>({
    shelfId: 0,
    layerId: 0,
    slotIndex: 0,
  });
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(
    () => (pickedLayer ? books.filter((b) => b.layerId === pickedLayer.layerId) : []),
    [books, pickedLayer],
  );

  if (!pickedLayer) {
    return (
      <section className="panel">
        <h2>层详情</h2>
        <p className="muted">在 3D 场景里点击任意一层，这里会列出该层的藏书。</p>
      </section>
    );
  }

  const targetShelf = shelves.find((s) => s.id === target.shelfId) ?? null;
  const targetLayers = targetShelf?.layers ?? [];
  const occupied = new Set(
    books.filter((b) => b.layerId === target.layerId).map((b) => b.slotIndex),
  );
  const capacity =
    targetLayers.find((l) => l.id === target.layerId)?.capacity ??
    targetShelf?.type.slotsPerLayer ??
    0;

  const startMove = (bookId: number, currentLayerId: number) => {
    setErr(null);
    const shelf = shelves.find((s) => s.layers.some((l) => l.id === currentLayerId));
    setTarget({
      shelfId: shelf?.id ?? 0,
      layerId: currentLayerId,
      slotIndex: 0,
    });
    setMovingId(bookId);
  };

  const doMove = async (bookId: number) => {
    setErr(null);
    if (!target.shelfId || !target.layerId) return setErr('请选择目标书架与层');
    if (occupied.has(target.slotIndex)) return setErr(`槽位 ${target.slotIndex} 已被占用`);
    if (target.slotIndex >= capacity) return setErr(`目标层容量仅 ${capacity}`);
    try {
      await moveBook(bookId, {
        layerId: target.layerId,
        slotIndex: target.slotIndex,
      });
      setMovingId(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  return (
    <section className="panel">
      <h2>
        书架 {pickedLayer.shelfCode} · 第 {pickedLayer.layerIndex} 层
        <span className="chip">{list.length} 本</span>
      </h2>

      {list.length === 0 ? (
        <p className="muted">本层暂无图书</p>
      ) : (
        <ul className="layer-books">
          {list.map((b) => (
            <li key={b.id} className={movingId === b.id ? 'moving' : ''}>
              <div className="bk-main">
                <button className="link" onClick={() => focusBook(b)}>
                  《{b.title}》
                </button>
                <span className="muted">槽位 {b.slotIndex}</span>
              </div>
              <div className="li-actions">
                <button className="mini" onClick={() => startMove(b.id, b.layerId)}>
                  移动
                </button>
                <button
                  className="mini danger"
                  onClick={async () => {
                    if (!confirm(`确认下架《${b.title}》？`)) return;
                    try {
                      await removeBook(b.id);
                    } catch (e: any) {
                      alert(String(e?.message ?? e));
                    }
                  }}
                >
                  下架
                </button>
              </div>

              {movingId === b.id && (
                <div className="edit-box">
                  <div className="grid2">
                    <label>
                      目标书架
                      <select
                        value={target.shelfId}
                        onChange={(e) =>
                          setTarget({
                            ...target,
                            shelfId: Number(e.target.value),
                            layerId:
                              shelves.find((s) => s.id === Number(e.target.value))?.layers[0]?.id ??
                              0,
                          })
                        }
                      >
                        {shelves.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code}（{s.type.layerCount}层）
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      目标层
                      <select
                        value={target.layerId}
                        onChange={(e) => setTarget({ ...target, layerId: Number(e.target.value) })}
                      >
                        {targetLayers.map((l) => (
                          <option key={l.id} value={l.id}>
                            第 {l.layerIndex} 层
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    槽位（容量 {capacity}，已占用 {occupied.size}）
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, capacity - 1)}
                      value={target.slotIndex}
                      onChange={(e) =>
                        setTarget({ ...target, slotIndex: Number(e.target.value) })
                      }
                    />
                  </label>
                  {err && <p className="err">{err}</p>}
                  <div className="row">
                    <button className="primary" onClick={() => doMove(b.id)}>
                      确认移动
                    </button>
                    <button className="ghost" onClick={() => setMovingId(null)}>
                      取消
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
