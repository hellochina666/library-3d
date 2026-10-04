import { useEffect, useMemo, useReducer, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { EffectComposer, Outline } from '@react-three/postprocessing';
import { ShelfMesh } from './ShelfMesh';
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

  // 相机聚焦点：命中层的大致高度
  const focus = useMemo<[number, number, number] | null>(() => {
    if (!highlight) return null;
    const s = shelves.find((x) => x.id === highlight.shelfId);
    if (!s) return null;
    return [s.posX, (highlight.layerIndex - 0.5) * s.type.layerHeight, s.posZ];
  }, [highlight, shelves]);

  return (
    <>
      <color attach="background" args={['#14171c']} />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[6, 9, 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-7, 5, -5]} intensity={0.35} />

      <Grid
        args={[60, 60]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#2a3038"
        sectionSize={2.5}
        sectionThickness={1.1}
        sectionColor="#3d76a5"
        fadeDistance={40}
        fadeStrength={1}
      />

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

      <CameraRig target={focus} />

      {/* 命中层描边高亮（OutlinePass） */}
      {selection.length > 0 && (
        <EffectComposer autoClear={false} multisampling={4}>
          <Outline
            selection={selection}
            visibleEdgeColor={0xffd23f}
            hiddenEdgeColor={0x7a4b00}
            edgeStrength={14}
          />
        </EffectComposer>
      )}
    </>
  );
}

/** 命中后相机平滑移到目标层 */
function CameraRig({ target }: { target: [number, number, number] | null }) {
  const ref = useRef<any>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (ref.current) ref.current.target.set(1.4, 1.0, 1.3);
  }, []);

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
      maxDistance={40}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
}
