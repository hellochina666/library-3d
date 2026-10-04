import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Outline, Vignette } from '@react-three/postprocessing';
import { ShelfMesh } from './ShelfMesh';
import { Room, type RoomRect } from './Room';
import { getLayerMesh, subscribeRegistry } from './registry';
import { buildGridLines, buildOccupiedCells, nearestSlot, planSlots, type Foot } from './rules';
import type { BookHit, Highlight, Shelf, ShelfType } from '../types';

export interface PlacementState {
  /** 当前选中的书架型号；null = 不在摆放模式 */
  type: ShelfType | null;
  rotation: number;
  /** 移动已有书架时，参与间距计算时要排除它自己 */
  excludeShelfId?: number | null;
  onPlace: (p: { posX: number; posZ: number; rotation: number }) => void;
  /** 长按抓取书架时进入移动模式 */
  onMoveEnter: (shelfId: number) => void;
  /** 取消摆放/移动（右键 / Esc / 无效落位） */
  onCancel: () => void;
}

interface Props {
  shelves: Shelf[];
  books: BookHit[];
  highlight: Highlight | null;
  placement?: PlacementState;
  onPickLayer: (p: {
    shelfId: number;
    shelfCode: string;
    layerId: number;
    layerIndex: number;
  }) => void;
}

export function Scene({ shelves, books, highlight, placement, onPickLayer }: Props) {
  // registry 里的 mesh 登记是异步发生的，用它触发重算描边目标
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeRegistry(force), []);

  // —— 高亮的核心：按 layerId 从登记表取出真实 3D 物体交给 Outline ——
  const targetMesh = highlight ? getLayerMesh(highlight.layerId) : null;
  const selection = targetMesh ? [targetMesh] : [];

  // —— 长按抓取书架进入拖拽移动 ——
  // 按住书架 450ms 不动（或几乎不动）= 抓起；随后的指针移动由
  // PlacementGuide 跟随吸附，松开左键落位/取消。按下即移动或松开都取消计时。
  const enterMoveMode = placement?.onMoveEnter;
  const [dragMove, setDragMove] = useState<{
    shelfId: number;
    originX: number;
    originZ: number;
  } | null>(null);
  const lockRef = useRef(false);
  const pendingRef = useRef<{
    shelfId: number;
    timer: number;
    x: number;
    y: number;
    ox: number;
    oz: number;
  } | null>(null);

  const onShelfDown = (shelfId: number, e: ThreeEvent<PointerEvent>) => {
    if (!enterMoveMode || placement?.type) return; // 已在摆放/移动中不抢
    if (e.button !== 0) return; // 只响应左键长按
    // 指针射线与地面 y=0 的交点：抓起瞬间幽灵就从这里开始吸附
    const t = -e.ray.origin.y / e.ray.direction.y;
    const timer = window.setTimeout(() => {
      const p = pendingRef.current;
      pendingRef.current = null;
      if (!p) return;
      lockRef.current = true;
      enterMoveMode(shelfId);
      setDragMove({ shelfId, originX: p.ox, originZ: p.oz });
    }, 450);
    pendingRef.current = {
      shelfId,
      timer,
      x: e.clientX,
      y: e.clientY,
      ox: e.ray.origin.x + e.ray.direction.x * t,
      oz: e.ray.origin.z + e.ray.direction.z * t,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      // 按住后拖动超出 8px → 是在旋转视角，不算长按
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
        clearTimeout(p.timer);
        pendingRef.current = null;
      }
    };
    const onUp = () => {
      const p = pendingRef.current;
      if (p) {
        clearTimeout(p.timer);
        pendingRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const endDrag = () => {
    setDragMove(null);
    lockRef.current = false;
  };

  // placement 被清空（Esc/右键/成功落位）时，拖拽状态一并结束
  useEffect(() => {
    if (!placement?.type && dragMove) endDrag();
  }, [placement?.type, dragMove]);

  // 房间包围盒：由书架数据自动决定，换布局后房间跟着长大
  const rect = useMemo<RoomRect>(() => {
    let minX = 0,
      maxX = 4,
      minZ = 0,
      maxZ = 4;
    for (const s of shelves) {
      const r = Math.max(s.type.width, s.type.depth) / 2 + 0.15;
      minX = Math.min(minX, s.posX - r);
      maxX = Math.max(maxX, s.posX + r);
      minZ = Math.min(minZ, s.posZ - r);
      maxZ = Math.max(maxZ, s.posZ + r);
    }
    const pad = 2.6;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad, height: 3.1 };
  }, [shelves]);

  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const span = Math.max(rect.maxX - rect.minX, rect.maxZ - rect.minZ);

  // 相机聚焦点：命中层的大致高度
  const focus = useMemo<[number, number, number] | null>(() => {
    if (!highlight) return null;
    const s = shelves.find((x) => x.id === highlight.shelfId);
    if (!s) return null;
    return [s.posX, (highlight.layerIndex - 0.5) * s.type.layerHeight, s.posZ];
  }, [highlight, shelves]);

  return (
    <>
      {/* 明亮温馨：暖天光背景（略深于墙面，让墙的轮廓读得出来）+ 极浅暖雾 */}
      <color attach="background" args={['#e7ddca']} />
      <fogExp2 attach="fog" args={['#e7ddca', 0.012]} />

      {/* 光源全部来自窗光与灯具，无顶灯：暖阳主光（投影）+ 暖色环境 + 半球天光 */}
      <ambientLight intensity={0.26} color={'#fff1dc'} />
      <hemisphereLight args={['#fff4e0', '#b59a74', 0.32]} />
      <directionalLight
        position={[rect.minX - 3.5, 4.4, cz + 2.2]}
        castShadow
        color={'#ffdcae'}
        intensity={1.9}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-span / 2 - 2}
        shadow-camera-right={span / 2 + 2}
        shadow-camera-top={span / 2 + 2}
        shadow-camera-bottom={-span / 2 - 2}
        shadow-camera-near={0.5}
        shadow-camera-far={span + 18}
        target-position={[cx, 0.6, cz]}
      />
      <directionalLight position={[rect.maxX + 4, 3.2, rect.minZ - 2]} intensity={0.25} color={'#ffe6c4'} />

      {/* 室内硬装：地板/墙/窗/壁灯/挂画/台灯（位置/朝向不影响数据语义） */}
      <Room rect={rect} />

      {/* 环境反射：暖色天光 + 窗侧高光，让木头和金属有真实镜面过渡 */}
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#e6d8c0']} />
        <Lightformer form="rect" intensity={1.5} color={'#ffe2b8'} position={[rect.minX, 1.8, cz]} rotation={[0, Math.PI / 2, 0]} scale={[3, 2.5, 1]} />
        <Lightformer form="rect" intensity={0.55} color={'#fff3e0'} position={[cx, rect.height, cz]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={0.25} color={'#f6ddba'} position={[rect.maxX, 2, cz]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 4, 1]} />
      </Environment>

      {/* 所有书架：位置/层数/藏书全部由数据决定（摆放模式下暂不响应层点击） */}
      {shelves.map((s) => (
        <ShelfMesh
          key={s.id}
          shelf={s}
          books={books}
          highlight={highlight}
          onPickLayer={placement?.type ? () => {} : onPickLayer}
          lockRef={lockRef}
          onShelfDown={onShelfDown}
        />
      ))}

      {/* 摆放模式：方格地面 + 占用格子高亮 + 吸附幽灵 + 点击/松手落位 */}
      {placement?.type && (
        <PlacementGuide
          type={placement.type}
          rotation={placement.rotation}
          shelves={shelves}
          rect={rect}
          excludeShelfId={placement.excludeShelfId}
          onPlace={placement.onPlace}
          dragMove={dragMove}
          onDragEnd={endDrag}
          onCancel={placement.onCancel}
        />
      )}

      <CameraRig
        target={focus}
        home={[cx, 1.1, cz]}
        span={span}
        dragActive={dragMove != null}
        placementActive={placement?.type != null}
      />

      {/* 常驻后期管线：命中层描边 + 柔光 Bloom + 轻暗角（明亮温馨的通透感） */}
      <EffectComposer multisampling={4}>
        {selection.length > 0 && (
          <Outline
            selection={selection}
            visibleEdgeColor={0xffd23f}
            hiddenEdgeColor={0x9a6b00}
            edgeStrength={12}
          />
        )}
        <Bloom mipmapBlur intensity={0.2} luminanceThreshold={0.95} luminanceSmoothing={0.2} />
        <Vignette offset={0.14} darkness={0.5} />
        <Noise premultiply opacity={0.04} />
      </EffectComposer>
    </>
  );
}

/** 命中后相机平滑移到目标层；摆放期间接管鼠标键位（左键落位/右键取消，不能抢） */
function CameraRig({
  target,
  home,
  span,
  dragActive,
  placementActive,
}: {
  target: [number, number, number] | null;
  home: [number, number, number];
  span: number;
  dragActive: boolean;
  placementActive: boolean;
}) {
  const ref = useRef<any>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (ref.current) {
      ref.current.target.set(home[0], home[1], home[2]);
      ref.current.update();
    }
  }, [home[0], home[1], home[2]]);

  // 拖拽书架时完全接管（不许转视角）；摆放期间右键改为「取消」，禁掉平移
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.enabled = !dragActive;
    c.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      ...(placementActive ? {} : { RIGHT: THREE.MOUSE.PAN }),
    } as any;
  }, [dragActive, placementActive]);

  useFrame((_, dt) => {
    if (!ref.current || !target) return;
    ref.current.target.lerp(tmp.set(target[0], target[1], target[2]), Math.min(1, dt * 2.5));
  });

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.8}
      maxDistance={Math.max(16, span * 2.4)}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
}

interface GuideProps {
  type: ShelfType;
  rotation: number;
  shelves: Shelf[];
  rect: RoomRect;
  excludeShelfId?: number | null;
  onPlace: (p: { posX: number; posZ: number; rotation: number }) => void;
  /** 长按抓取的拖拽会话；null = 普通的「点击落位」流程 */
  dragMove: { shelfId: number; originX: number; originZ: number } | null;
  /** 拖拽结束（松开左键）——无论落位与否都要结束拖拽会话 */
  onDragEnd: () => void;
  /** 取消摆放/移动 */
  onCancel: () => void;
}

/**
 * 摆放引导层：
 * 1) 巨大的不可见拾取平面收集指针位置（拖动视角不会误放：e.delta 过滤）；
 * 2) 地面按 CELL 等分画出正方形网格，已有书架覆盖的格子用陶土色高亮
 *    （占了几格一目了然）；幽灵书架吸附最近候选点，绿 = 放得下、红 = 间距不足；
 * 3) 左键单击落位；长按抓起的书架跟随指针移动，松开左键即在当前位置落位；
 * 4) 右键 / Esc 取消；左键成功落地后由 store 自动退出摆放模式。
 */
function PlacementGuide({
  type,
  rotation,
  shelves,
  rect,
  excludeShelfId,
  onPlace,
  dragMove,
  onDragEnd,
  onCancel,
}: GuideProps) {
  const [ghost, setGhost] = useState<{ x: number; z: number; valid: boolean } | null>(null);
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;

  // 参与间距判定的书架（移动模式下排除自己），
  // 但被移动的那个仍然当作吸附锚点，方便原地微调一档
  const { others, anchors } = useMemo(() => {
    const feet: Foot[] = [];
    const all: Foot[] = [];
    for (const s of shelves) {
      const f = {
        width: s.type.width,
        depth: s.type.depth,
        posX: s.posX,
        posZ: s.posZ,
        rotation: s.rotation,
      };
      all.push(f);
      if (s.id !== excludeShelfId) feet.push(f);
    }
    return { others: feet, anchors: all };
  }, [shelves, excludeShelfId]);

  // 候选落位点 + 真实可放性；幽灵吸附与落位共用这一份判定
  const plan = useMemo(
    () => planSlots(rect, type, rotation, others, anchors),
    [rect, type, rotation, others, anchors],
  );

  // 地面正方形网格线 + 已占用格子填充
  const gridGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buildGridLines(rect), 3));
    return g;
  }, [rect]);
  const occGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buildOccupiedCells(others), 3));
    return g;
  }, [others]);
  useEffect(
    () => () => {
      gridGeo.dispose();
      occGeo.dispose();
    },
    [gridGeo, occGeo],
  );

  // 抓起瞬间：幽灵从按下的位置开始吸附
  useEffect(() => {
    if (!dragMove) return;
    const slot = nearestSlot(plan, dragMove.originX, dragMove.originZ);
    setGhost(slot ? { x: slot.posX, z: slot.posZ, valid: slot.ok } : null);
  }, [dragMove, plan]);

  // 拖拽移动：松开左键 → 在当前位置落位（有效且真的挪动了）或取消
  useEffect(() => {
    if (!dragMove) return;
    const onUp = () => {
      onDragEnd();
      const g = ghostRef.current;
      const o = shelves.find((s) => s.id === dragMove.shelfId);
      if (!g || !o) {
        onCancel();
        return;
      }
      const moved = Math.hypot(g.x - o.posX, g.z - o.posZ) > 0.35;
      if (g.valid && moved) onPlace({ posX: g.x, posZ: g.z, rotation });
      else onCancel();
    };
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, [dragMove, shelves, rotation, onPlace, onDragEnd, onCancel]);

  const w = rect.maxX - rect.minX;
  const d = rect.maxZ - rect.minZ;
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const ghostH = type.layerCount * type.layerHeight + 0.09;

  // 幽灵外缘线 + 占地矩形：突出模型真实的 footprint
  const edgeGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(type.width, ghostH, type.depth)),
    [type.width, type.depth, ghostH],
  );
  useEffect(() => () => edgeGeo.dispose(), [edgeGeo]);
  const footGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const x = type.width / 2;
    const z = type.depth / 2;
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z, -x, 0, -z]),
        3,
      ),
    );
    return g;
  }, [type.width, type.depth]);
  useEffect(() => () => footGeo.dispose(), [footGeo]);

  const evaluate = (px: number, pz: number) => {
    const slot = nearestSlot(plan, px, pz);
    if (!slot) return setGhost(null);
    setGhost({ x: slot.posX, z: slot.posZ, valid: slot.ok });
  };

  return (
    <group>
      {/* 指针拾取平面（覆盖全地面，透明到看不见但可射线命中） */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cx, 0.004, cz]}
        onPointerMove={(e) => {
          e.stopPropagation();
          evaluate(e.point.x, e.point.z);
        }}
        onPointerOut={() => setGhost(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (dragMove) return; // 拖拽会话的落位由 pointerup 统一处理
          if (e.delta > 6) return; // 刚做完轨道旋转拖动，不算点击
          if (ghost?.valid) onPlace({ posX: ghost.x, posZ: ghost.z, rotation });
        }}
      >
        <planeGeometry args={[w + 30, d + 30]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 正方形网格：0.6m 等分，平均铺满房间 */}
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial color={'#6b5233'} transparent opacity={0.4} depthWrite={false} />
      </lineSegments>

      {/* 已有书架占用的格子（移动中的书架不算占用） */}
      <mesh geometry={occGeo}>
        <meshBasicMaterial color={'#d05548'} transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* 幽灵书架：半透明体积 + 占地轮廓线 + 外缘线 */}
      {ghost && (
        <group position={[ghost.x, 0, ghost.z]} rotation={[0, (rotation * Math.PI) / 180, 0]}>
          <mesh position={[0, ghostH / 2, 0]}>
            <boxGeometry args={[type.width, ghostH, type.depth]} />
            <meshStandardMaterial
              color={ghost.valid ? '#3fae63' : '#d0453f'}
              transparent
              opacity={0.42}
              depthWrite={false}
              emissive={ghost.valid ? '#0c3d1d' : '#3d0c0a'}
              emissiveIntensity={0.6}
            />
          </mesh>
          <lineSegments geometry={edgeGeo} position={[0, ghostH / 2, 0]}>
            <lineBasicMaterial color={ghost.valid ? '#c9f5cf' : '#ffb1a8'} transparent opacity={0.9} />
          </lineSegments>
          <lineSegments geometry={footGeo} position={[0, 0.028, 0]}>
            <lineBasicMaterial color={ghost.valid ? '#eafff0' : '#ffd0c8'} transparent opacity={0.95} />
          </lineSegments>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
            <planeGeometry args={[type.width, type.depth]} />
            <meshBasicMaterial
              color={ghost.valid ? '#5fd47f' : '#c0483f'}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
