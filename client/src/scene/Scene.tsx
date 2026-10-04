import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Outline, Vignette } from '@react-three/postprocessing';
import { ShelfMesh } from './ShelfMesh';
import { Room, type RoomRect } from './Room';
import { getLayerMesh, subscribeRegistry } from './registry';
import { buildSlotLines, nearestSlot, planSlots, type Foot } from './rules';
import type { BookHit, Highlight, Shelf, ShelfType } from '../types';

export interface PlacementState {
  /** 当前选中的书架型号；null = 不在摆放模式 */
  type: ShelfType | null;
  rotation: number;
  /** 移动已有书架时，参与间距计算时要排除它自己 */
  excludeShelfId?: number | null;
  onPlace: (p: { posX: number; posZ: number; rotation: number }) => void;
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
      <color attach="background" args={['#120e0a']} />
      <fogExp2 attach="fog" args={['#1a130c', 0.035]} />

      {/* 三点布光：左侧窗暖阳光（投影主光）+ 冷色补光 + 半球环境 */}
      <ambientLight intensity={0.16} color={'#ffe8c8'} />
      <hemisphereLight args={['#ffdfb0', '#42291a', 0.35]} />
      <directionalLight
        position={[rect.minX - 3.5, 4.6, cz + 2.5]}
        castShadow
        color={'#ffd9a6'}
        intensity={2.6}
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
      <directionalLight position={[rect.maxX + 4, 3.2, rect.minZ - 2]} intensity={0.4} color={'#8aa6c9'} />

      {/* 室内硬装：地板/墙/窗/地毯/吊灯（位置/朝向不影响数据语义） */}
      <Room rect={rect} lampPositions={[[cx - 0.9, cz], [cx + 0.9, cz]]} />

      {/* 环境反射：暖色顶部 + 窗侧高光，让木头和金属有真实镜面过渡 */}
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#15100b']} />
        <Lightformer form="rect" intensity={1.6} color={'#ffd7a1'} position={[rect.minX, 1.8, cz]} rotation={[0, Math.PI / 2, 0]} scale={[3, 2.5, 1]} />
        <Lightformer form="rect" intensity={0.5} color={'#ffca8a'} position={[cx, rect.height, cz]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={0.22} color={'#9db8dd'} position={[rect.maxX, 2, cz]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 4, 1]} />
      </Environment>

      {/* 所有书架：位置/层数/藏书全部由数据决定（摆放模式下暂不响应层点击） */}
      {shelves.map((s) => (
        <ShelfMesh
          key={s.id}
          shelf={s}
          books={books}
          highlight={highlight}
          onPickLayer={placement?.type ? () => {} : onPickLayer}
        />
      ))}

      {/* 摆放模式：地面空格提示 + 吸附幽灵 + 点击落位 */}
      {placement?.type && (
        <PlacementGuide
          type={placement.type}
          rotation={placement.rotation}
          shelves={shelves}
          rect={rect}
          excludeShelfId={placement.excludeShelfId}
          onPlace={placement.onPlace}
        />
      )}

      <CameraRig target={focus} home={[cx, 1.1, cz]} span={span} />

      {/* 常驻后期管线：命中层描边 + 柔光 Bloom + 暗角 + 胶片噪点（电影感） */}
      <EffectComposer multisampling={4}>
        {selection.length > 0 && (
          <Outline
            selection={selection}
            visibleEdgeColor={0xffd23f}
            hiddenEdgeColor={0x7a4b00}
            edgeStrength={12}
          />
        )}
        <Bloom mipmapBlur intensity={0.32} luminanceThreshold={0.85} luminanceSmoothing={0.18} />
        <Vignette offset={0.16} darkness={0.72} />
        <Noise premultiply opacity={0.05} />
      </EffectComposer>
    </>
  );
}

/** 命中后相机平滑移到目标层 */
function CameraRig({
  target,
  home,
  span,
}: {
  target: [number, number, number] | null;
  home: [number, number, number];
  span: number;
}) {
  const ref = useRef<any>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (ref.current) {
      ref.current.target.set(home[0], home[1], home[2]);
      ref.current.update();
    }
  }, [home[0], home[1], home[2]]);

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
}

/**
 * 摆放引导层：
 * 1) 巨大的不可见拾取平面收集指针位置（拖动视角不会误放：e.delta 过滤）；
 * 2) 地面画出当前型号的「空格」，并按落位的真实判定着色 ——
 *    绿 = 放得下，红 = 被占或走道间距不足，所见即所得；
 * 3) 幽灵书架吸附最近空格，带占地轮廓与整体外缘线；
 * 4) 左键成功落地后由 store 自动退出摆放模式。
 */
function PlacementGuide({ type, rotation, shelves, rect, excludeShelfId, onPlace }: GuideProps) {
  const [ghost, setGhost] = useState<{ x: number; z: number; valid: boolean } | null>(null);

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

  // 候选落位点 + 真实可放性；提示线、吸附、幽灵三色共用这一份判定
  const plan = useMemo(() => planSlots(rect, type, rotation, others, anchors), [rect, type, rotation, others, anchors]);
  const { freeGeo, blockedGeo } = useMemo(() => {
    const r = buildSlotLines(plan);
    const mk = (pos: Float32Array) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return g;
    };
    return { freeGeo: mk(r.free), blockedGeo: mk(r.blocked) };
  }, [plan]);
  useEffect(
    () => () => {
      freeGeo.dispose();
      blockedGeo.dispose();
    },
    [freeGeo, blockedGeo],
  );

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
          if (e.delta > 6) return; // 刚做完轨道旋转拖动，不算点击
          if (ghost?.valid) onPlace({ posX: ghost.x, posZ: ghost.z, rotation });
        }}
      >
        <planeGeometry args={[w + 30, d + 30]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 空格提示：绿=此刻真能放，红=放不下 */}
      <lineSegments geometry={freeGeo}>
        <lineBasicMaterial color={'#6fd08c'} transparent opacity={0.55} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={blockedGeo}>
        <lineBasicMaterial color={'#a04a42'} transparent opacity={0.35} depthWrite={false} />
      </lineSegments>

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
          <lineSegments geometry={footGeo} position={[0, 0.016, 0]}>
            <lineBasicMaterial color={ghost.valid ? '#eafff0' : '#ffd0c8'} transparent opacity={0.95} />
          </lineSegments>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
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
