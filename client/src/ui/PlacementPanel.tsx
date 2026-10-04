import { useState } from 'react';
import { useStore } from '../store';

/**
 * 「摆放」Tab：多图书馆管理 + 书架模型拖放。
 * 选中一个型号后进入摆放模式：3D 地面出现空格间距提示，
 * 幽灵书架吸附到最近空格，点击落位；R 旋转朝向，Esc 退出。
 */
export function PlacementPanel() {
  const {
    libraries, libraryId, shelves, types,
    placement, placementMsg,
    switchLibrary, createLibrary, renameLibrary, deleteLibrary,
    enterPlacement, enterMoveMode, exitPlacement, rotatePlacement,
  } = useStore();

  const [newName, setNewName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const active = placement.typeId != null;
  const moving = placement.mode === 'move';
  const activeType = types.find((t) => t.id === placement.typeId);
  const movingShelf = shelves.find((s) => s.id === placement.shelfId);

  const doCreate = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      setErr(null);
      await createLibrary(n);
      setNewName('');
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const doRename = async () => {
    if (!libraryId) return;
    const cur = libraries.find((l) => l.id === libraryId);
    const n = prompt('图书馆名称', cur?.name ?? '');
    if (!n || n.trim() === cur?.name) return;
    try {
      setErr(null);
      await renameLibrary(libraryId, n.trim());
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const doDelete = async () => {
    if (!libraryId) return;
    const cur = libraries.find((l) => l.id === libraryId);
    if (!confirm(`删除「${cur?.name}」？该馆 ${shelves.length} 个书架及全部藏书会一并删除，不可恢复。`)) return;
    try {
      setErr(null);
      await deleteLibrary(libraryId);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  return (
    <>
      <section className="panel">
        <h2>图书馆</h2>
        <p className="muted">每个图书馆是一套独立的 3D 布局，切换后场景与检索都只作用于当前馆。</p>
        <div className="grid2">
          <label>
            当前馆
            <select
              value={libraryId ?? ''}
              onChange={(e) => switchLibrary(Number(e.target.value))}
            >
              {libraries.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}（{l.id === libraryId ? shelves.length : l._count?.shelves ?? 0} 架）
                </option>
              ))}
            </select>
          </label>
          <label>
            新建图书馆
            <div className="row">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如 二楼新书馆"
                onKeyDown={(e) => e.key === 'Enter' && doCreate()}
              />
              <button className="mini" onClick={doCreate}>建</button>
            </div>
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={doRename}>重命名当前馆</button>
          <button className="ghost danger" onClick={doDelete}>删除当前馆</button>
        </div>
      </section>

      <section className="panel">
        <h2>
          摆放书架
          {active && (
            <button className="mini" onClick={exitPlacement}>退出摆放</button>
          )}
        </h2>
        {types.length === 0 && <p className="muted">先在「管理」里创建书架型号。</p>}
        <ul className="shelf-list">
          {types.map((t) => (
            <li key={t.id}>
              <div className="shelf-head">
                <div>
                  <b>{t.name}</b>
                  <span className="muted"> {t.layerCount} 层 · 宽{t.width}m × 深{t.depth}m · 每层{t.slotsPerLayer}位</span>
                </div>
                <button
                  className={!moving && active && placement.typeId === t.id ? 'mini primary' : 'mini'}
                  onClick={() => enterPlacement(t.id)}
                >
                  {!moving && active && placement.typeId === t.id ? '摆放中' : '拖入场景'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {active ? (
          <p className="muted">
            {moving ? (
              <>
                正在移动 <b>{movingShelf?.code}</b>：地面<b>绿色</b>空格 = 放得下，<b>红色</b> = 与相邻书架间距不足。
                在绿色空格<b>单击左键</b>即落位并自动退出；按 <b>R</b> 旋转朝向（当前 {placement.rotation}°），<b>Esc</b> 取消。
              </>
            ) : (
              <>
                把鼠标移到 3D 地面：会出现「{activeType?.name}」的占地空格提示（侧向间隙 0.4m、走道 0.9m）。
                地面<b>绿色</b>框 = 真实可落位，<b>红色</b> = 间距不足；幽灵上的亮线是模型占地范围。
                <b>单击左键</b>落地并自动退出摆放，按 <b>R</b> 旋转朝向（当前 {placement.rotation}°），<b>Esc</b> 取消。编号自动生成。
              </>
            )}
          </p>
        ) : (
          <p className="muted">选择一个型号进入摆放模式，在空地上直接摆出真实布局。</p>
        )}

        {active && (
          <div className="row" style={{ marginTop: 4 }}>
            <button className="ghost" onClick={rotatePlacement}>旋转 90°</button>
          </div>
        )}
        {placementMsg && <p className={placementMsg.startsWith('放不下') ? 'err' : 'ok'}>{placementMsg}</p>}
        {err && <p className="err">{err}</p>}
      </section>

      <section className="panel">
        <h2>移动书架</h2>
        <p className="muted">
          点击「移动」后进入同样的空格提示，只是这次挪的是已有书架（层数与藏书保持不变）。
        </p>
        {shelves.length === 0 && <p className="muted">当前馆还没有书架。</p>}
        <ul className="shelf-list">
          {shelves.map((s) => {
            const on = moving && placement.shelfId === s.id;
            return (
              <li key={s.id}>
                <div className="shelf-head">
                  <div>
                    <b>{s.code}</b>
                    <span className="muted">
                      {' '}{s.type.name} · ({s.posX}, {s.posZ}) · {s.rotation}°
                    </span>
                  </div>
                  <button
                    className={on ? 'mini primary' : 'mini'}
                    onClick={() => (on ? exitPlacement() : enterMoveMode(s.id))}
                  >
                    {on ? '取消移动' : '移动'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
