import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Shelf } from '../types';

const NEW_ZONE = '__new__';

export function ShelfManager() {
  const { shelves, types, books, addShelf, updateShelf, removeShelf } = useStore();

  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Shelf>>({});

  const [form, setForm] = useState({
    code: '',
    typeId: 0,
    zone: '',
    newZone: '',
    posX: 0,
    posZ: 0,
    rotation: 0,
  });

  const zones = useMemo(
    () => [...new Set(shelves.map((s) => s.zone).filter(Boolean))] as string[],
    [shelves],
  );

  // 默认选第一个型号
  useEffect(() => {
    if (form.typeId === 0 && types.length > 0) setForm((f) => ({ ...f, typeId: types[0].id }));
  }, [types, form.typeId]);

  // 默认选第一个区域（否则下拉显示了但 state 仍为空，提交会丢掉区域）
  useEffect(() => {
    if (!form.zone && zones.length > 0) setForm((f) => ({ ...f, zone: zones[0] }));
  }, [zones, form.zone]);

  const zoneName = form.zone === NEW_ZONE ? form.newZone.trim() : form.zone;

  /** 按区域现有书架，自动建议编号（沿用前缀递增） */
  const suggestCode = (zone: string) => {
    const inZone = shelves.filter((s) => (s.zone ?? '') === zone);
    if (inZone.length === 0) {
      const letter = String.fromCharCode(65 + zones.length);
      return `${letter}-01`;
    }
    const nums = inZone
      .map((s) => {
        const m = /(\d+)\s*$/.exec(s.code);
        return m ? Number(m[1]) : 0;
      })
      .filter((n) => n > 0);
    const prefix = /^([^\d]+)/.exec(inZone[0].code)?.[1] ?? '';
    const next = nums.length ? Math.max(...nums) + 1 : inZone.length + 1;
    return `${prefix}${String(next).padStart(2, '0')}`;
  };

  /** 追加到该区域末尾；新区域则另起一排（Z 方向让开） */
  const suggestPosition = (zone: string) => {
    const inZone = shelves.filter((s) => (s.zone ?? '') === zone);
    if (inZone.length === 0) {
      const maxZ = shelves.length ? Math.max(...shelves.map((s) => s.posZ)) : -2.6;
      return { posX: 0, posZ: maxZ + 2.6, rotation: 0 };
    }
    const last = inZone.reduce((a, b) => (b.posX > a.posX ? b : a));
    return {
      posX: Number((last.posX + (last.type.width ?? 1) + 0.4).toFixed(2)),
      posZ: last.posZ,
      rotation: last.rotation,
    };
  };

  const applyAuto = () => {
    const z = form.zone === NEW_ZONE ? form.newZone.trim() : form.zone;
    setForm((f) => ({
      ...f,
      code: suggestCode(z),
      ...suggestPosition(z),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!form.code.trim()) return setErr('书架编号必填');
    if (!form.typeId) return setErr('请选择型号');
    if (shelves.some((s) => s.code === form.code.trim()))
      return setErr(`编号 ${form.code.trim()} 已存在`);

    setBusy(true);
    try {
      await addShelf({
        code: form.code.trim(),
        typeId: form.typeId,
        posX: Number(form.posX),
        posZ: Number(form.posZ),
        rotation: Number(form.rotation),
        zone: zoneName || undefined,
      });
      setOpen(false);
      setForm((f) => ({ ...f, code: '', newZone: '' }));
    } catch (e2: any) {
      setErr(String(e2?.message ?? e2));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (s: Shelf) => {
    setEditingId(s.id);
    setDraft({
      code: s.code,
      posX: s.posX,
      posZ: s.posZ,
      rotation: s.rotation,
      zone: s.zone ?? '',
    });
  };

  const saveEdit = async (id: number) => {
    setErr(null);
    try {
      await updateShelf(id, {
        code: draft.code,
        posX: Number(draft.posX),
        posZ: Number(draft.posZ),
        rotation: Number(draft.rotation),
        zone: draft.zone,
      });
      setEditingId(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const bookCount = (s: Shelf) => books.filter((b) => b.shelfId === s.id).length;

  return (
    <section className="panel">
      <h2>
        书架布局
        <button className="mini" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '+ 新增书架'}
        </button>
      </h2>
      <p className="muted">
        新增书架会按型号自动生成对应层数；位置默认追加到该区域末尾，可手动微调以匹配现实摆放。
      </p>

      {open && (
        <form onSubmit={submit} className="sub-form">
          <div className="grid2">
            <label>
              书架编号
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="如 A-04"
              />
            </label>
            <label>
              型号（决定层数）
              <select
                value={form.typeId}
                onChange={(e) => setForm({ ...form, typeId: Number(e.target.value) })}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{t.layerCount}层）
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            所属区域
            <select
              value={form.zone || (zones[0] ?? NEW_ZONE)}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
              <option value={NEW_ZONE}>+ 新建区域…</option>
            </select>
          </label>
          {form.zone === NEW_ZONE && (
            <label>
              新区域名称
              <input
                value={form.newZone}
                onChange={(e) => setForm({ ...form, newZone: e.target.value })}
                placeholder="如 二楼 社科区"
              />
            </label>
          )}

          <button type="button" className="ghost" onClick={applyAuto}>
            按区域自动排布编号与位置
          </button>

          <div className="grid3">
            <label>
              X 坐标
              <input
                type="number"
                step="0.1"
                value={form.posX}
                onChange={(e) => setForm({ ...form, posX: Number(e.target.value) })}
              />
            </label>
            <label>
              Z 坐标
              <input
                type="number"
                step="0.1"
                value={form.posZ}
                onChange={(e) => setForm({ ...form, posZ: Number(e.target.value) })}
              />
            </label>
            <label>
              朝向°
              <input
                type="number"
                step="90"
                value={form.rotation}
                onChange={(e) => setForm({ ...form, rotation: Number(e.target.value) })}
              />
            </label>
          </div>

          {err && <p className="err">{err}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '创建中…' : '创建书架'}
          </button>
        </form>
      )}

      <ul className="shelf-list">
        {shelves.map((s) => {
          const n = bookCount(s);
          const cap = s.layers.reduce(
            (sum, l) => sum + (l.capacity ?? s.type.slotsPerLayer),
            0,
          );
          return (
            <li key={s.id} className={editingId === s.id ? 'editing' : ''}>
              <div className="shelf-head">
                <div>
                  <b>{s.code}</b>
                  <span className="muted">
                    {' '}
                    {s.type.name} · {s.type.layerCount} 层
                  </span>
                </div>
                <div className="li-actions">
                  <span className="chip">
                    {n}/{cap} 本
                  </span>
                  <button
                    className="mini"
                    onClick={() => (editingId === s.id ? setEditingId(null) : startEdit(s))}
                  >
                    {editingId === s.id ? '取消' : '编辑'}
                  </button>
                  <button
                    className="mini danger"
                    onClick={async () => {
                      if (!confirm(`删除书架 ${s.code}？该架 ${n} 本书会一并删除，且不可恢复。`))
                        return;
                      try {
                        await removeShelf(s.id);
                      } catch (e: any) {
                        alert(String(e?.message ?? e));
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="muted small">
                {s.zone ?? '未分区'} · 位置 ({s.posX}, {s.posZ}) · 朝向 {s.rotation}°
              </div>

              {editingId === s.id && (
                <div className="edit-box">
                  <div className="grid2">
                    <label>
                      编号
                      <input
                        value={draft.code ?? ''}
                        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                      />
                    </label>
                    <label>
                      区域
                      <input
                        value={draft.zone ?? ''}
                        onChange={(e) => setDraft({ ...draft, zone: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="grid3">
                    <label>
                      X
                      <input
                        type="number"
                        step="0.1"
                        value={draft.posX ?? 0}
                        onChange={(e) => setDraft({ ...draft, posX: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Z
                      <input
                        type="number"
                        step="0.1"
                        value={draft.posZ ?? 0}
                        onChange={(e) => setDraft({ ...draft, posZ: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      朝向°
                      <input
                        type="number"
                        step="90"
                        value={draft.rotation ?? 0}
                        onChange={(e) => setDraft({ ...draft, rotation: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <button className="primary" onClick={() => saveEdit(s.id)}>
                    保存位置
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
