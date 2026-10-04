import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { BookHit, Highlight, Shelf } from '../types';
import { registerLayerMesh } from './registry';
import { clothTexture, coverColor, paperTexture, seededRandom, signTexture, woodTexture } from './materials';

/** 板厚与立板厚度（米） */
const PLANK_T = 0.03;
const SIDE_T = 0.04;

interface Props {
  shelf: Shelf;
  books: BookHit[];
  highlight: Highlight | null;
  onPickLayer: (p: { shelfId: number; shelfCode: string; layerId: number; layerIndex: number }) => void;
  /** 长按抓取期间的点击抑制锁：抓起→松开的同一次点击不应打开层面板 */
  lockRef?: React.RefObject<boolean>;
  /** 在书架上按下左键（供长按抓取检测） */
  onShelfDown?: (shelfId: number, e: ThreeEvent<PointerEvent>) => void;
}

/**
 * 一个书架 = 一个 Group，位置/朝向直接来自数据库的 posX/posZ/rotation。
 * 层数由 shelf.type.layerCount 决定；外形程序化拼装：
 * 浅橡木侧板与层板、奶油漆背板、顶部帽线，书籍带布面封面与书页块。
 */
export function ShelfMesh({ shelf, books, highlight, onPickLayer, lockRef, onShelfDown }: Props) {
  const { width, depth, layerCount, layerHeight, slotsPerLayer } = shelf.type;

  const totalH = layerCount * layerHeight + 3 * PLANK_T;
  const innerW = width - 2 * SIDE_T - 0.06;
  const spacing = innerW / slotsPerLayer;

  const isShelfHi = highlight?.shelfId === shelf.id;
  const oak = woodTexture('warm');
  const frameTint = isShelfHi ? '#f0b050' : '#ffffff';

  /** 按点击高度反查所在层：点框体、侧板、背板任意位置都能打开这一层的藏书面板 */
  const pickByHeight = (y: number) => {
    const idx = Math.min(
      layerCount,
      Math.max(1, Math.floor((y - 2 * PLANK_T) / layerHeight) + 1),
    );
    const layer = shelf.layers.find((l) => l.layerIndex === idx) ?? shelf.layers[0];
    if (!layer) return;
    onPickLayer({
      shelfId: shelf.id,
      shelfCode: shelf.code,
      layerId: layer.id,
      layerIndex: layer.layerIndex,
    });
  };

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
      onPointerDown={(e) => onShelfDown?.(shelf.id, e)}
      onClick={(e) => {
        // 抓取松手的那一下不算选层；拖完视角（delta 大）也不算
        if (lockRef?.current || e.delta > 6) return;
        e.stopPropagation();
        pickByHeight(e.point.y);
      }}
    >
      {/* 两侧立板 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (width - SIDE_T)) / 2, totalH / 2, 0]} castShadow>
          <boxGeometry args={[SIDE_T, totalH, depth]} />
          <meshStandardMaterial map={oak} color={frameTint} roughness={0.62} metalness={0.03} />
        </mesh>
      ))}

      {/* 背板：奶油漆面板（现代简约），命中时整架泛暖 */}
      <mesh position={[0, totalH / 2, -depth / 2 + 0.011]} receiveShadow>
        <boxGeometry args={[width - 2 * SIDE_T, totalH, 0.018]} />
        <meshStandardMaterial color={isShelfHi ? '#f3d9a4' : '#ddd0b6'} roughness={0.9} />
      </mesh>

      {/* 顶板 + 帽线、底座 */}
      <mesh position={[0, totalH - PLANK_T / 2, 0]} castShadow>
        <boxGeometry args={[width, PLANK_T, depth]} />
        <meshStandardMaterial map={oak} color={frameTint} roughness={0.62} />
      </mesh>
      <mesh position={[0, totalH + 0.021, 0.006]} castShadow>
        <boxGeometry args={[width + 0.06, 0.038, depth + 0.04]} />
        <meshStandardMaterial map={oak} color={frameTint} roughness={0.5} />
      </mesh>
      <mesh position={[0, PLANK_T / 2, 0]} receiveShadow>
        <boxGeometry args={[width, PLANK_T, depth]} />
        <meshStandardMaterial map={oak} color={frameTint} roughness={0.62} />
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
          shelfSeed={shelf.id * 131}
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

      {/* 书架编号牌：两面三角形导视立牌，固定在书架顶部，随书架尺寸缩放 */}
      <ShelfTag
        code={shelf.code}
        sub={`${layerCount} 层 · ${shelf.zone ?? '—'}`}
        width={width}
        topY={totalH + 0.04}
        highlighted={isShelfHi}
      />
    </group>
  );
}

/** 三角导视牌的坡面倾角（度） */
const TAG_SLOPE = 55;

/**
 * 书架顶部的三角形导视牌（图书馆 aisle sign）：
 * 两块斜面板互相依靠成「人字形」，正反两面各贴一张牌面纹理，
 * 从哪个方向看文字都是正的。整体是世界空间网格 —— 朝向固定在书架上
 * （不再始终面朝屏幕），参与常规深度测试（不再始终置顶），
 * 尺寸随书架宽度推导，随场景缩放。
 */
function ShelfTag({
  code,
  sub,
  width,
  topY,
  highlighted,
}: {
  code: string;
  sub: string;
  width: number;
  topY: number;
  highlighted: boolean;
}) {
  const face = useMemo(() => signTexture(code, sub, highlighted), [code, sub, highlighted]);

  // 尺寸从书架宽度推导：牌宽 ≈ 架宽的 6 成，脊高按比例并限幅
  const signW = Math.min(Math.max(width * 0.62, 0.46), 1.0);
  const ridgeH = Math.min(Math.max(width * 0.11, 0.08), 0.13);
  const slope = (TAG_SLOPE * Math.PI) / 180;
  const baseHalf = ridgeH / Math.tan(slope); // 半个底宽
  const boardLen = ridgeH / Math.sin(slope); // 斜面板长度
  const tilt = Math.PI / 2 - slope; // 从竖直位置向后仰的角度
  const boardColor = highlighted ? '#f7c95e' : '#f4ecdb';

  // 端部三角封板（ShapeGeometry 在 XY 平面，旋转后立在 ZY 平面）
  const capGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-baseHalf, 0);
    s.lineTo(baseHalf, 0);
    s.lineTo(0, ridgeH);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [baseHalf, ridgeH]);
  useEffect(() => () => capGeo.dispose(), [capGeo]);

  return (
    <group position={[0, topY, 0]}>
      {/* 底座：深木色窄条，压住两块斜面板的脚 */}
      <mesh position={[0, 0.008, 0]} castShadow>
        <boxGeometry args={[signW, 0.016, baseHalf * 2 + 0.02]} />
        <meshStandardMaterial map={woodTexture('dark')} roughness={0.55} />
      </mesh>

      {/* 正面斜板：+Z 面贴牌面纹理 */}
      <mesh position={[0, 0.016 + ridgeH / 2, baseHalf / 2]} rotation={[-tilt, 0, 0]} castShadow>
        <boxGeometry args={[signW, boardLen, 0.012]} />
        <meshStandardMaterial attach="material-4" map={face} roughness={0.5} />
        <meshStandardMaterial attach="material-5" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-0" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-2" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-3" color={boardColor} roughness={0.55} />
      </mesh>

      {/* 背面斜板：-Z 面贴牌面纹理（从背面看文字同样是正的） */}
      <mesh position={[0, 0.016 + ridgeH / 2, -baseHalf / 2]} rotation={[tilt, 0, 0]} castShadow>
        <boxGeometry args={[signW, boardLen, 0.012]} />
        <meshStandardMaterial attach="material-4" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-5" map={face} roughness={0.5} />
        <meshStandardMaterial attach="material-0" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-2" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-3" color={boardColor} roughness={0.55} />
      </mesh>

      {/* 两端三角封板 */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={capGeo} position={[(s * signW) / 2, 0.016, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <meshStandardMaterial color={highlighted ? '#eab948' : '#eadfc8'} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
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
  shelfSeed: number;
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
  shelfSeed,
  books,
  highlighted,
  highlightBookId,
  onPick,
}: LayerProps) {
  const plankRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    registerLayerMesh(layerId, plankRef.current);
    return () => registerLayerMesh(layerId, null);
  }, [layerId]);

  // 该层地面的高度（层板顶面）
  const floorTop = 2 * PLANK_T + (layerIndex - 1) * layerHeight;
  const plankY = floorTop - PLANK_T / 2;

  return (
    <group>
      {/* 该层的整格拾取体积（不可见）：从正面点任意高度都算命中这一层 */}
      <mesh position={[0, floorTop + layerHeight / 2, 0]}>
        <boxGeometry args={[width - 2 * SIDE_T, layerHeight, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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
          map={woodTexture('warm')}
          color={highlighted ? '#ffd76a' : '#ffffff'}
          emissive={highlighted ? '#ff8c00' : '#000000'}
          emissiveIntensity={highlighted ? 0.5 : 0}
          roughness={0.6}
        />
      </mesh>

      {/* 该层上的书，按 slotIndex 依次排开 */}
      {books.map((b) => (
        <BookMesh
          key={b.id}
          book={b}
          floorTop={floorTop}
          innerW={innerW}
          spacing={spacing}
          layerHeight={layerHeight}
          depth={depth}
          shelfSeed={shelfSeed}
          isHi={highlightBookId === b.id}
          onPick={onPick}
        />
      ))}
    </group>
  );
}

interface BookProps {
  book: BookHit;
  floorTop: number;
  innerW: number;
  spacing: number;
  layerHeight: number;
  depth: number;
  shelfSeed: number;
  isHi: boolean;
  onPick: () => void;
}

/**
 * 一本"写实"的书 = 布面封面板块 + 内嵌的书页块 + 书脊烫金饰带。
 * 高矮厚薄与轻微倾斜按 id 播种的伪随机决定：同一本书每次刷新姿态一致，
 * 但整排书看起来像真实排架，而不是复制粘贴的方块。
 */
function BookMesh({ book, floorTop, innerW, spacing, layerHeight, depth, shelfSeed, isHi, onPick }: BookProps) {
  const { t, h, tilt, zOff, hasBand } = useMemo(() => {
    const rnd = seededRandom(book.id * 7919 + shelfSeed);
    const maxT = spacing * 0.92;
    return {
      t: Math.min(maxT, 0.022 + rnd() * 0.03),
      h: layerHeight * (0.62 + rnd() * 0.22),
      tilt: rnd() < 0.12 ? (rnd() - 0.5) * 0.16 : 0,
      zOff: -depth * 0.06 + rnd() * depth * 0.05,
      hasBand: rnd() < 0.5,
    };
  }, [book.id, shelfSeed, spacing, layerHeight, depth]);

  const x = -innerW / 2 + (book.slotIndex + 0.5) * spacing;
  const cover = useMemo(() => coverColor(book.title), [book.title]);
  const bookD = depth * 0.72;

  return (
    <group
      position={[x, floorTop, zOff]}
      rotation={[0, 0, tilt]}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
    >
      {/* 封面（布面） */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[t, h, bookD]} />
        <meshStandardMaterial
          map={clothTexture()}
          color={isHi ? '#ffe066' : cover}
          emissive={isHi ? '#ffdf70' : '#000000'}
          emissiveIntensity={isHi ? 0.55 : 0}
          roughness={0.82}
        />
      </mesh>
      {/* 书页块：略窄略短，从顶部与书口露出米白页边 */}
      <mesh position={[0, h / 2 + 0.003, -0.004]}>
        <boxGeometry args={[t * 0.8, h - 0.012, bookD - 0.014]} />
        <meshStandardMaterial map={paperTexture()} color={'#e6d9ba'} roughness={0.95} />
      </mesh>
      {/* 书脊烫金饰带 */}
      {hasBand && h > 0.16 && (
        <mesh position={[0, h * 0.74, bookD / 2 + 0.0008]}>
          <boxGeometry args={[t * 0.62, 0.008, 0.002]} />
          <meshStandardMaterial color={'#c39a4e'} roughness={0.35} metalness={0.55} />
        </mesh>
      )}
    </group>
  );
}
