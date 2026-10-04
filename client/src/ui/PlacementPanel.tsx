import { useState } from 'react';
import { useStore } from '../store';

/**
 * 「摆放」Tab：多图书馆管理 + 书架摆放。
 * 选型号进入摆放模式：0.6m 正方形网格 + 占用格子高亮，幽灵吸附最近方格，
 * 左键落位、右键/ Esc 取消；也可以在 3D 里长按书架直接拖动重排。
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
                正在移动 <b>{movingShelf?.code}</b>：地面按 0.6m 方格均分，浅绿地砖 =
                当前型号放得下的位置，陶土色格子 = 已被占用，幽灵<b>绿色</b> = 放得下、<b>红色</b> = 间距不足。
                长按抓起的<b>松开左键</b>即落位；点击「移动」进来的在绿色方格<b>单击左键</b>落位。
                按 <b>R</b> 旋转朝向（当前 {placement.rotation}°），<b>右键</b>或 <b>Esc</b> 取消。
              </>
            ) : (
              <>
                地面按 0.6m <b>正方形方格</b>均分：<b>浅绿地砖</b>就是这个型号放得下的位置，陶土色格子 =
                已有书架占用，幽灵吸附最近方格，<b>绿色</b> = 真实可落位、<b>红色</b> = 间距不足。<b>单击左键</b>落地并自动退出摆放，
                按 <b>R</b> 旋转朝向（当前 {placement.rotation}°），<b>右键</b> / <b>Esc</b> 取消。编号自动生成。
              </>
            )}
          </p>
        ) : (
          <p className="muted">
            选择一个型号进入摆放模式，地面会铺出所有可落位的浅绿地砖；也可以直接在 3D 里<b>长按</b>任意书架把它抓起来挪位置。
          </p>
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
          点击「移动」进入吸附模式后单击落位；更直接的方式是在 3D 场景里
          <b>按住书架约半秒</b>把它抓起来，拖到新位置<b>松开左键</b>落位（层数与藏书保持不变），右键取消。
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
