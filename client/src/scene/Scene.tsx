import { useEffect, useMemo, useReducer, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Outline, Vignette } from '@react-three/postprocessing';
import { ShelfMesh } from './ShelfMesh';
import { Room, type RoomRect } from './Room';
import { getLayerMesh, subscribeRegistry } from './registry';
import type { BookHit, Highlight, Shelf } from '../types';

interface Props {
  shelves: Shelf[];
  books: BookHit[];
  highlight: Highlight | null;
  onPickLayer: (p: {
    shelfId: number;
    shelfCode: string;
    layerId: number;
    layerIndex: number;
  }) => void;
}

export function Scene({ shelves, books, highlight, onPickLayer }: Props) {
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

      {/* 所有书架：位置/层数/藏书全部由数据决定 */}
      {shelves.map((s) => (
        <ShelfMesh
          key={s.id}
          shelf={s}
          books={books}
          highlight={highlight}
          onPickLayer={onPickLayer}
        />
      ))}

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
