import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';

export function AddBookForm() {
  const { shelves, books, addBook } = useStore();

  const [shelfId, setShelfId] = useState<number | null>(null);
  const [layerId, setLayerId] = useState<number | null>(null);
  const [slot, setSlot] = useState(0);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shelf = shelves.find((s) => s.id === shelfId) ?? null;
  const layers = shelf?.layers ?? [];

  // 默认选第一个书架
  useEffect(() => {
    if (shelfId === null && shelves.length > 0) setShelfId(shelves[0].id);
  }, [shelves, shelfId]);

  // 换书架时层重置
  useEffect(() => {
    setLayerId(layers.length > 0 ? layers[0].id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfId]);

  const occupied = useMemo(
    () => new Set(books.filter((b) => b.layerId === layerId).map((b) => b.slotIndex)),
    [books, layerId],
  );
  const capacity =
    shelf != null && layerId != null
      ? layers.find((l) => l.id === layerId)?.capacity ?? shelf.type.slotsPerLayer
      : 0;

  const firstFree = () => {
    let i = 0;
    while (occupied.has(i) && i < capacity) i++;
    return i;
  };

  // 换层时自动推荐空位
  useEffect(() => {
    if (layerId != null) setSlot(firstFree());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return setErr('书名必填');
    if (shelfId == null) return setErr('必须选择书架');
    if (layerId == null) return setErr('必须选择层');
    if (slot < 0 || slot >= capacity) return setErr(`槽位需在 0 ~ ${capacity - 1} 之间`);
    if (occupied.has(slot)) return setErr(`槽位 ${slot} 已被占用，请换一个或点「自动空位」`);

    setBusy(true);
    try {
      await addBook({
        title: title.trim(),
        author: author.trim() || undefined,
        isbn: isbn.trim() || undefined,
        shelfId,
        layerId,
        slotIndex: slot,
      });
      setTitle('');
      setAuthor('');
      setIsbn('');
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>新增图书（必须指定架 / 层 / 槽位）</h2>
      <form onSubmit={submit}>
        <label>
          书名
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="必填" />
        </label>
        <div className="grid2">
          <label>
            作者
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <label>
            ISBN
            <input value={isbn} onChange={(e) => setIsbn(e.target.value)} />
          </label>
        </div>

        <div className="grid3">
          <label>
            书架
            <select
              value={shelfId ?? ''}
              onChange={(e) => setShelfId(Number(e.target.value))}
            >
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}（{s.type.layerCount}层）
                </option>
              ))}
            </select>
          </label>
          <label>
            第几层
            <select
              value={layerId ?? ''}
              onChange={(e) => setLayerId(Number(e.target.value))}
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  第 {l.layerIndex} 层
                </option>
              ))}
            </select>
          </label>
          <label>
            槽位
            <input
              type="number"
              min={0}
              max={Math.max(0, capacity - 1)}
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="row">
          <button type="button" className="ghost" onClick={() => setSlot(firstFree())}>
            自动空位（推荐 {firstFree()}）
          </button>
          <span className="muted">
            容量 {capacity} · 已用 {occupied.size}
          </span>
        </div>

        {err && <p className="err">{err}</p>}

        <button type="submit" disabled={busy} className="primary">
          {busy ? '写入中…' : '上架这本书'}
        </button>
      </form>
    </section>
  );
}
