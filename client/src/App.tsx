import { useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { useStore, type PanelState } from './store';
import { useTier } from './hooks/useViewport';
import { SearchPanel } from './ui/SearchPanel';
import { LayerPanel } from './ui/LayerPanel';
import { AddBookForm } from './ui/AddBookForm';
import { ShelfManager } from './ui/ShelfManager';
import { ShelfTypeManager } from './ui/ShelfTypeManager';
import { StatsPanel } from './ui/StatsPanel';
import { PlacementPanel } from './ui/PlacementPanel';
import { BookCard } from './ui/BookCard';

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

/** 抽屉/侧栏在两种布局下的形态：非窄屏没有「仅标签条」这一档 */
function effectivePanel(tier: string, panel: PanelState): PanelState {
  if (tier === 'phone') return panel;
  return panel === 'hidden' ? 'hidden' : 'open';
}

const TOGGLE_TEXT: Record<PanelState, string> = {
  open: '收起面板',
  min: '展开面板',
  hidden: '显示菜单',
};

export default function App() {
  const {
    loadAll, shelves, books, types, highlight, pickedBook, pickLayer, pickBook, setTab, tab, loading, error,
    placement, placementMsg, placeShelf, moveShelfTo, rotatePlacement, exitPlacement,
    panel, setPanel,
  } = useStore();
  const [webgl] = useState(detectWebGL);
  const tier = useTier();
  const state = effectivePanel(tier, panel);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 手机首次进入：抽屉默认收成标签条，别一上来挡住 3D 场景
  useEffect(() => {
    if (tier === 'phone' && panel === 'open') setPanel('min');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  // 窄屏屏幕矮，抽屉展开时放不下详情卡：选中书就把它让出来
  useEffect(() => {
    if (tier === 'phone' && pickedBook) setPanel('min');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedBook?.id]);

  // 浮动按钮只做「展开 / 收起」：三态循环会让"展开面板"这个标签骗人
  const cyclePanel = () => {
    if (tier !== 'phone') return setPanel(state === 'open' ? 'hidden' : 'open');
    setPanel(panel === 'open' ? 'min' : 'open');
  };

  const onTab = (key: (typeof TABS)[number]['key']) => {
    setTab(key);
    // 窄屏：抽屉收起时点标签要顺手展开；展开状态下点当前标签则收起
    if (tier === 'phone') {
      if (panel !== 'open') setPanel('open');
      else if (tab === key) setPanel('min');
    }
  };

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

  // Esc 顺手关掉书本详情卡
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pickBook(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickBook]);

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
  const handlePickLayer = useCallback(
    (p: { shelfId: number; shelfCode: string; layerId: number; layerIndex: number }) => {
      pickLayer(p);
      setTab('search');
    },
    [pickLayer, setTab],
  );

  const activeType = types.find((t) => t.id === placement.typeId) ?? null;
  const phone = tier === 'phone';

  return (
    <div className={`app app--${tier}`} data-panel={state}>
      <div className="canvas-wrap">
        {webgl ? (
          // 手机像素比封顶 1.25：高分屏跑满 DPR 是最直接的掉帧来源
          <Canvas
            shadows="soft"
            camera={{ position: [4.4, 2.3, 6.0], fov: 45 }}
            dpr={phone ? [0.75, 1.25] : [1, 2]}
            performance={{ min: phone ? 0.5 : 0.7 }}
            gl={{ antialias: !phone, powerPreference: 'high-performance' }}
            onPointerMissed={() => pickBook(null)}
          >
            <Scene
              shelves={shelves}
              books={books}
              highlight={highlight}
              quality={phone ? 'phone' : 'desktop'}
              placement={{
                type: activeType,
                rotation: placement.rotation,
                excludeShelfId: placement.mode === 'move' ? placement.shelfId : null,
                onPlace: (p) => {
                  if (placement.mode === 'move') return moveShelfTo(p);
                  if (placement.typeId != null) return placeShelf({ ...p, typeId: placement.typeId });
                },
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
          <p>书架排列、层数与真实馆藏一一对应 · 点击书本看详情，点击层板看该层藏书</p>
        </div>

        <div className="view-tools">
          {loading && <span className="badge">加载中…</span>}
          {placementMsg && <span className="badge">{placementMsg}</span>}
          <button className="icon-btn" onClick={cyclePanel}>
            {TOGGLE_TEXT[state]}
          </button>
        </div>

        {pickedBook && <BookCard book={pickedBook} />}

        {error && (
          <div className="err-box">
            无法连接后端：{error}
            <br />
            请在 <code>server/</code> 目录执行 <code>npm run start</code>
          </div>
        )}
      </div>

      <aside className="sidebar" data-state={state}>
        <div className="sheet-bar">
          <span className="grab" />
          <span className="sheet-title">控制面板</span>
          <button className="icon-btn" onClick={() => setPanel('hidden')}>
            隐藏
          </button>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={() => onTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel-body">
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
        </div>
      </aside>
    </div>
  );
}
