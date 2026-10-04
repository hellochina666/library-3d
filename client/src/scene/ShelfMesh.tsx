import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { BookHit, Highlight, Shelf } from '../types';
import { registerLayerMesh } from './registry';

/** 板厚与立板厚度（米） */
const PLANK_T = 0.03;
const SIDE_T = 0.04;

/** 按书名生成稳定颜色，让书架看起来有层次 */
function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.42, 0.55);
}

interface Props {
  shelf: Shelf;
  books: BookHit[];
  highlight: Highlight | null;
  onPickLayer: (p: { shelfId: number; shelfCode: string; layerId: number; layerIndex: number }) => void;
}

/**
 * 一个书架 = 一个 Group，位置/朝向直接来自数据库的 posX/posZ/rotation。
 * 层数由 shelf.type.layerCount 决定 —— 所以现实中不同的书架层数不同，
 * 在这里就自然体现为不同数量的层板。
 * 完全程序化生成，没有任何手绘模型。
 */
export function ShelfMesh({ shelf, books, highlight, onPickLayer }: Props) {
  const { width, depth, layerCount, layerHeight, slotsPerLayer } = shelf.type;

  const totalH = layerCount * layerHeight + 3 * PLANK_T;
  const innerW = width - 2 * SIDE_T - 0.06;
  const spacing = innerW / slotsPerLayer;
  const bookT = Math.min(0.05, spacing * 0.82);
  const bookH = layerHeight * 0.76;
  const bookD = depth * 0.7;

  const isShelfHi = highlight?.shelfId === shelf.id;
  const frameColor = isShelfHi ? '#f5b942' : '#a9764a';

  // 本架书籍按层分组
  const byLayer = useMemo(() => {
    const m = new Map<number, BookHit[]>();
    for (const b of books) {
      if (b.shelfId !== shelf.id) continue;
      const arr = m.get(b.layerId) ?? [];
      arr.push(b);
      m.set(b.layerId, arr);
    }
    return m;
  }, [books, shelf.id]);

  return (
    <group
      position={[shelf.posX, 0, shelf.posZ]}
      rotation={[0, (shelf.rotation * Math.PI) / 180, 0]}
    >
      {/* 两侧立板 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (width - SIDE_T)) / 2, totalH / 2, 0]} castShadow>
          <boxGeometry args={[SIDE_T, totalH, depth]} />
          <meshStandardMaterial color={frameColor} roughness={0.85} />
        </mesh>
      ))}

      {/* 背板 */}
      <mesh position={[0, totalH / 2, -depth / 2 + 0.012]} receiveShadow>
        <boxGeometry args={[width - 2 * SIDE_T, totalH, 0.02]} />
        <meshStandardMaterial color={isShelfHi ? '#d99f35' : '#8d6238'} roughness={0.95} />
      </mesh>

      {/* 顶板与底座 */}
      <mesh position={[0, totalH - PLANK_T / 2, 0]} castShadow>
        <boxGeometry args={[width, PLANK_T, depth]} />
        <meshStandardMaterial color={frameColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, PLANK_T / 2, 0]} receiveShadow>
        <boxGeometry args={[width, PLANK_T, depth]} />
        <meshStandardMaterial color={frameColor} roughness={0.85} />
      </mesh>

      {/* 层：按 layerCount 程序生成 */}
      {shelf.layers.map((layer) => (
        <LayerGroup
          key={layer.id}
          layerId={layer.id}
          layerIndex={layer.layerIndex}
          layerHeight={layerHeight}
          width={width}
          depth={depth}
          innerW={innerW}
          spacing={spacing}
          bookT={bookT}
          bookH={bookH}
          bookD={bookD}
          books={byLayer.get(layer.id) ?? []}
          highlighted={highlight?.layerId === layer.id}
          highlightBookId={highlight?.bookId ?? null}
          onPick={() =>
            onPickLayer({
              shelfId: shelf.id,
              shelfCode: shelf.code,
              layerId: layer.id,
              layerIndex: layer.layerIndex,
            })
          }
        />
      ))}

      {/* 书架编号标签 */}
      <Html position={[0, totalH + 0.18, 0]} center distanceFactor={7} zIndexRange={[10, 0]}>
        <div className="shelf-tag">
          <strong>{shelf.code}</strong>
          <span>{layerCount} 层 · {shelf.zone ?? '—'}</span>
        </div>
      </Html>
    </group>
  );
}

interface LayerProps {
  layerId: number;
  layerIndex: number;
  layerHeight: number;
  width: number;
  depth: number;
  innerW: number;
  spacing: number;
  bookT: number;
  bookH: number;
  bookD: number;
  books: BookHit[];
  highlighted: boolean;
  highlightBookId: number | null;
  onPick: () => void;
}

function LayerGroup({
  layerId,
  layerIndex,
  layerHeight,
  width,
  depth,
  innerW,
  spacing,
  bookT,
  bookH,
  bookD,
  books,
  highlighted,
  highlightBookId,
  onPick,
}: LayerProps) {
  const plankRef = useRef<THREE.Mesh>(null);

  // 把层板 mesh 登记到 registry：高亮时按 layerId 取出来描边
  useEffect(() => {
    registerLayerMesh(layerId, plankRef.current);
    return () => registerLayerMesh(layerId, null);
  }, [layerId]);

  // 该层地面的高度（层板顶面）
  const floorTop = 2 * PLANK_T + (layerIndex - 1) * layerHeight;
  const plankY = floorTop - PLANK_T / 2;

  return (
    <group>
      {/* 层板（点击可反查该层藏书） */}
      <mesh
        ref={plankRef}
        position={[0, plankY, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onPick();
        }}
      >
        <boxGeometry args={[width - 2 * SIDE_T, PLANK_T, depth]} />
        <meshStandardMaterial
          color={highlighted ? '#ffd76a' : '#c08b56'}
          emissive={highlighted ? '#ff9a00' : '#000000'}
          emissiveIntensity={highlighted ? 0.85 : 0}
          roughness={0.75}
        />
      </mesh>

      {/* 该层上的书，按 slotIndex 依次排开 */}
      {books.map((b) => {
        const x = -innerW / 2 + (b.slotIndex + 0.5) * spacing;
        const isHi = highlightBookId === b.id;
        return (
          <mesh
            key={b.id}
            position={[x, floorTop + bookH / 2, 0]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onPick();
            }}
          >
            <boxGeometry args={[bookT, bookH, bookD]} />
            <meshStandardMaterial
              color={hashColor(b.title)}
              emissive={isHi ? '#ffe066' : '#000000'}
              emissiveIntensity={isHi ? 1.4 : 0}
              roughness={0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}
