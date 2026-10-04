import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { useStore, type PickedLayer } from './store';
import { SearchPanel } from './ui/SearchPanel';
import { LayerPanel } from './ui/LayerPanel';
import { AddBookForm } from './ui/AddBookForm';
import { ShelfManager } from './ui/ShelfManager';
import { ShelfTypeManager } from './ui/ShelfTypeManager';
import { StatsPanel } from './ui/StatsPanel';
import { PlacementPanel } from './ui/PlacementPanel';

/** 检测浏览器是否支持 WebGL，避免不支持时整页白屏 */
function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const TABS = [
  { key: 'search', label: '检索' },
  { key: 'manage', label: '管理' },
  { key: 'layout', label: '摆放' },
  { key: 'stats', label: '统计' },
] as const;

export default function App() {
  const {
    loadAll, shelves, books, types, highlight, pickLayer, setTab, tab, loading, error,
    placement, placeShelf, moveShelfTo, rotatePlacement, exitPlacement, enterMoveMode,
  } = useStore();
  const [webgl] = useState(detectWebGL);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 摆放模式的键盘操作：R 旋转幽灵朝向，Esc 退出
  useEffect(() => {
    if (placement.typeId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') rotatePlacement();
      if (e.key === 'Escape') exitPlacement();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placement.typeId, rotatePlacement, exitPlacement]);

  // 摆放模式下右键 = 取消（同时禁掉浏览器菜单）
  useEffect(() => {
    if (placement.typeId == null) return;
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      exitPlacement();
    };
    window.addEventListener('contextmenu', onCtx);
    return () => window.removeEventListener('contextmenu', onCtx);
  }, [placement.typeId, exitPlacement]);

  // 在 3D 里点了某层，自动切到「检索」页看该层藏书
  const handlePickLayer = (p: PickedLayer) => {
    pickLayer(p);
    setTab('search');
  };

  const activeType = types.find((t) => t.id === placement.typeId) ?? null;

  return (
    <div className="app">
      <div className="canvas-wrap">
        {webgl ? (
          <Canvas
            shadows="soft"
            camera={{ position: [4.4, 2.3, 6.0], fov: 45 }}
            dpr={[1, 2]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <Scene
              shelves={shelves}
              books={books}
              highlight={highlight}
              placement={{
                type: activeType,
                rotation: placement.rotation,
                excludeShelfId: placement.mode === 'move' ? placement.shelfId : null,
                onPlace: (p) => {
                  if (placement.mode === 'move') return moveShelfTo(p);
                  if (placement.typeId != null) return placeShelf({ ...p, typeId: placement.typeId });
                },
                onMoveEnter: enterMoveMode,
                onCancel: exitPlacement,
              }}
              onPickLayer={handlePickLayer}
            />
          </Canvas>
        ) : (
          <div className="no-webgl">
            <h2>当前环境不支持 WebGL</h2>
            <p>
              3D 书架需要浏览器启用 WebGL，请在支持硬件加速的桌面浏览器中打开。
              右侧的检索、管理、统计功能不受影响，仍可正常使用。
            </p>
          </div>
        )}

        <div className="hud">
          <h1>3D 图书管理系统</h1>
          <p>
            书架排列、层数与真实馆藏一一对应 · 拖拽旋转 / 滚轮缩放 / 点击层板查看该层藏书
          </p>
        </div>

        {loading && <div className="badge">加载中…</div>}
        {error && (
          <div className="err-box">
            无法连接后端：{error}
            <br />
            请在 <code>server/</code> 目录执行 <code>npm run start</code>
          </div>
        )}
      </div>

      <aside className="sidebar">
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'search' && (
          <>
            <SearchPanel />
            <LayerPanel />
          </>
        )}
        {tab === 'manage' && (
          <>
            <AddBookForm />
            <ShelfManager />
            <ShelfTypeManager />
          </>
        )}
        {tab === 'layout' && <PlacementPanel />}
        {tab === 'stats' && <StatsPanel />}
      </aside>
    </div>
  );
}
