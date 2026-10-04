import { useState } from 'react';
import { useStore } from '../store';

export function ShelfTypeManager() {
  const { types, shelves, addType, removeType } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    layerCount: 5,
    layerHeight: 0.34,
    width: 1.0,
    depth: 0.32,
    slotsPerLayer: 30,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usedCount = (typeId: number) => shelves.filter((s) => s.typeId === typeId).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!form.name.trim()) return setErr('型号名称必填');
    if (form.layerCount < 1 || form.layerCount > 20) return setErr('层数需在 1~20 之间');
    setBusy(true);
    try {
      await addType({
        name: form.name.trim(),
        layerCount: Number(form.layerCount),
        layerHeight: Number(form.layerHeight),
        width: Number(form.width),
        depth: Number(form.depth),
        slotsPerLayer: Number(form.slotsPerLayer),
      });
      setForm({ ...form, name: '' });
      setOpen(false);
    } catch (e2: any) {
      setErr(String(e2?.message ?? e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>
        书架型号
        <button className="mini" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '+ 新增型号'}
        </button>
      </h2>
      <p className="muted">型号决定书架有几层 —— 现实中不同书架层数不同，就靠它区分。</p>

      {open && (
        <form onSubmit={submit} className="sub-form">
          <label>
            型号名称
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：标准五层架"
            />
          </label>
          <div className="grid3">
            <label>
              层数
              <input
                type="number"
                min={1}
                max={20}
                value={form.layerCount}
                onChange={(e) => setForm({ ...form, layerCount: Number(e.target.value) })}
              />
            </label>
            <label>
              层高(m)
              <input
                type="number"
                step="0.01"
                value={form.layerHeight}
                onChange={(e) => setForm({ ...form, layerHeight: Number(e.target.value) })}
              />
            </label>
            <label>
              每层槽位
              <input
                type="number"
                min={1}
                value={form.slotsPerLayer}
                onChange={(e) => setForm({ ...form, slotsPerLayer: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="grid2">
            <label>
              宽(m)
              <input
                type="number"
                step="0.1"
                value={form.width}
                onChange={(e) => setForm({ ...form, width: Number(e.target.value) })}
              />
            </label>
            <label>
              进深(m)
              <input
                type="number"
                step="0.02"
                value={form.depth}
                onChange={(e) => setForm({ ...form, depth: Number(e.target.value) })}
              />
            </label>
          </div>
          {err && <p className="err">{err}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '保存中…' : '创建型号'}
          </button>
        </form>
      )}

      <ul className="type-list">
        {types.map((t) => {
          const n = usedCount(t.id);
          return (
            <li key={t.id}>
              <div>
                <b>{t.name}</b>
                <span className="muted">
                  {' '}
                  {t.layerCount} 层 · 层高 {t.layerHeight}m · {t.slotsPerLayer} 槽/层 · {t.width}×
                  {t.depth}m
                </span>
              </div>
              <div className="li-actions">
                <span className="chip">{n} 个书架在用</span>
                <button
                  className="mini danger"
                  disabled={n > 0}
                  title={n > 0 ? '还有书架在用，不能删除' : '删除该型号'}
                  onClick={async () => {
                    try {
                      await removeType(t.id);
                    } catch (e: any) {
                      alert(String(e?.message ?? e));
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
