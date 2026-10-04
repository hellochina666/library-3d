import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { BookHit, Shelf } from '../types';
import { registerLayerMesh } from './registry';
import { aoBlobTexture, clothBumpTexture, clothTexture, coverColor, paperTexture, seededRandom, signTexture, woodBumpTexture, woodTexture } from './materials';

/** 板厚与立板厚度（米） */
const PLANK_T = 0.03;
const SIDE_T = 0.04;

/** 纯装饰网格不参与射线：书架 Group 带事件，子网格会被递归拾取 */
const noRaycast = () => null;

/** 悬停时把手型指针挂到 body，离开再收回（多本书连续悬停不会串状态） */
function hoverCursor(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : '';
}

interface Props {
  shelf: Shelf;
  /** 仅本架的藏书（Scene 里按 shelfId 分好组，避免每本新书触发全部书架重渲染） */
  books: BookHit[];
  shelfHi: boolean;
  hiLayerId: number | null;
  hiBookId: number | null;
  /** 摆放模式下关掉悬停与选层 */
  interactive: boolean;
  onPickLayer: (p: { shelfId: number; shelfCode: string; layerId: number; layerIndex: number }) => void;
  onFocusBook: (b: BookHit) => void;
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
export const ShelfMesh = memo(function ShelfMesh({
  shelf, books, shelfHi, hiLayerId, hiBookId, interactive, onPickLayer, onFocusBook, lockRef, onShelfDown,
}: Props) {
  const { width, depth, layerCount, layerHeight, slotsPerLayer } = shelf.type;

  const totalH = layerCount * layerHeight + 3 * PLANK_T;
  const innerW = width - 2 * SIDE_T - 0.06;
  const spacing = innerW / slotsPerLayer;

  const oak = woodTexture('warm');
  const oakBump = woodBumpTexture('warm');
  const frameTint = shelfHi ? '#f0b050' : '#ffffff';

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
      const arr = m.get(b.layerId) ?? [];
      arr.push(b);
      m.set(b.layerId, arr);
    }
    return m;
  }, [books]);

  return (
    <group
      position={[shelf.posX, 0, shelf.posZ]}
      rotation={[0, (shelf.rotation * Math.PI) / 180, 0]}
      onPointerDown={(e) => onShelfDown?.(shelf.id, e)}
      onClick={(e) => {
        // 摆放模式不吃点击；抓取松手那一下与视角拖拽（delta 大）也不算选层
        if (!interactive || lockRef?.current || e.delta > 6) return;
        e.stopPropagation();
        pickByHeight(e.point.y);
      }}
    >
      {/* 架底接触阴影（假 AO）：比 footprint 略大的一圈径向暗晕，消除悬浮感。
          raycast 置空：它不参与点击，否则摆放模式下会吞掉架子周围的地面点击 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]} renderOrder={1} raycast={noRaycast}>
        <planeGeometry args={[width + 0.5, depth + 0.5]} />
        <meshBasicMaterial map={aoBlobTexture()} transparent opacity={0.85} depthWrite={false} />
      </mesh>

      {/* 两侧立板 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (width - SIDE_T)) / 2, totalH / 2, 0]} castShadow>
          <boxGeometry args={[SIDE_T, totalH, depth]} />
          <meshStandardMaterial map={oak} bumpMap={oakBump} bumpScale={0.32} color={frameTint} roughness={0.62} metalness={0.03} envMapIntensity={0.55} />
        </mesh>
      ))}

      {/* 背板：奶油漆面板（现代简约），命中时整架泛暖 */}
      <mesh position={[0, totalH / 2, -depth / 2 + 0.011]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[width - 2 * SIDE_T, totalH, 0.018]} />
        <meshStandardMaterial color={shelfHi ? '#f3d9a4' : '#ddd0b6'} roughness={0.9} envMapIntensity={0.22} />
      </mesh>

      {/* 顶板 + 帽线、底座 */}
      <mesh position={[0, totalH - PLANK_T / 2, 0]} castShadow>
        <boxGeometry args={[width, PLANK_T, depth]} />
        <meshStandardMaterial map={oak} bumpMap={oakBump} bumpScale={0.32} color={frameTint} roughness={0.62} envMapIntensity={0.55} />
      </mesh>
      <mesh position={[0, totalH + 0.021, 0.006]} castShadow raycast={noRaycast}>
        <boxGeometry args={[width + 0.06, 0.038, depth + 0.04]} />
        <meshStandardMaterial map={oak} bumpMap={oakBump} bumpScale={0.32} color={frameTint} roughness={0.5} envMapIntensity={0.6} />
      </mesh>
      <mesh position={[0, PLANK_T / 2, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[width, PLANK_T, depth]} />
        <meshStandardMaterial map={oak} bumpMap={oakBump} bumpScale={0.32} color={frameTint} roughness={0.62} envMapIntensity={0.55} />
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
          books={byLayer.get(layer.id) ?? EMPTY_BOOKS}
          highlighted={hiLayerId === layer.id}
          highlightBookId={hiBookId}
          interactive={interactive}
          shelfId={shelf.id}
          shelfCode={shelf.code}
          onPick={onPickLayer}
          onFocusBook={onFocusBook}
        />
      ))}

      {/* 书架编号牌：两面三角形导视立牌，固定在书架顶部，随书架尺寸缩放 */}
      <ShelfTag
        code={shelf.code}
        sub={`${layerCount} 层 · ${shelf.zone ?? '—'}`}
        width={width}
        topY={totalH + 0.04}
        highlighted={shelfHi}
      />
    </group>
  );
});

const EMPTY_BOOKS: BookHit[] = [];

/** 三角导视牌的坡面倾角（度） */
const TAG_SLOPE = 55;

/**
 * 书架顶部的三角形导视牌（图书馆 aisle sign）：
 * 两块斜面板互相依靠成「人字形」，正反两面各贴一张牌面纹理，
 * 从哪个方向看文字都是正的。整体是世界空间网格 —— 朝向固定在书架上
 * （不再始终面朝屏幕），参与常规深度测试（不再始终置顶），
 * 尺寸随书架宽度推导，随场景缩放。
 */
const ShelfTag = memo(function ShelfTag({
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
      <mesh position={[0, 0.008, 0]} castShadow raycast={noRaycast}>
        <boxGeometry args={[signW, 0.016, baseHalf * 2 + 0.02]} />
        <meshStandardMaterial map={woodTexture('dark')} roughness={0.55} />
      </mesh>

      {/* 正面斜板：+Z 面贴牌面纹理 */}
      <mesh position={[0, 0.016 + ridgeH / 2, baseHalf / 2]} rotation={[-tilt, 0, 0]} castShadow raycast={noRaycast}>
        <boxGeometry args={[signW, boardLen, 0.012]} />
        <meshStandardMaterial attach="material-4" map={face} roughness={0.5} />
        <meshStandardMaterial attach="material-5" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-0" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-2" color={boardColor} roughness={0.55} />
        <meshStandardMaterial attach="material-3" color={boardColor} roughness={0.55} />
      </mesh>

      {/* 背面斜板：-Z 面贴牌面纹理（从背面看文字同样是正的） */}
      <mesh position={[0, 0.016 + ridgeH / 2, -baseHalf / 2]} rotation={[tilt, 0, 0]} castShadow raycast={noRaycast}>
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
        <mesh key={s} geometry={capGeo} position={[(s * signW) / 2, 0.016, 0]} rotation={[0, (s * Math.PI) / 2, 0]} raycast={noRaycast}>
          <meshStandardMaterial color={highlighted ? '#eab948' : '#eadfc8'} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
});

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
  interactive: boolean;
  shelfId: number;
  shelfCode: string;
  onPick: Props['onPickLayer'];
  onFocusBook: Props['onFocusBook'];
}

const LayerGroup = memo(function LayerGroup({
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
  interactive,
  shelfId,
  shelfCode,
  onPick,
  onFocusBook,
}: LayerProps) {
  const plankRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    registerLayerMesh(layerId, plankRef.current);
    return () => registerLayerMesh(layerId, null);
  }, [layerId]);

  // 该层地面的高度（层板顶面）
  const floorTop = 2 * PLANK_T + (layerIndex - 1) * layerHeight;
  const plankY = floorTop - PLANK_T / 2;
  const lit = highlighted || hover;

  return (
    <group>
      {/* 该层的整格拾取体积（不可见）：从正面点任意高度都算命中这一层 */}
      <mesh position={[0, floorTop + layerHeight / 2, 0]}>
        <boxGeometry args={[width - 2 * SIDE_T, layerHeight, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 层板（悬停即热，点击反查该层藏书） */}
      <mesh
        ref={plankRef}
        position={[0, plankY, 0]}
        castShadow
        receiveShadow
        onPointerOver={interactive ? () => setHover(true) : undefined}
        onPointerOut={interactive ? () => setHover(false) : undefined}
        onClick={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          onPick({ shelfId, shelfCode, layerId, layerIndex });
        }}
      >
        <boxGeometry args={[width - 2 * SIDE_T, PLANK_T, depth]} />
        <meshStandardMaterial
          map={woodTexture('warm')}
          bumpMap={woodBumpTexture('warm')}
          bumpScale={0.3}
          color={highlighted ? '#ffd76a' : hover ? '#ffe9c4' : '#ffffff'}
          emissive={highlighted ? '#ff8c00' : '#000000'}
          emissiveIntensity={highlighted ? 0.5 : 0}
          roughness={0.6}
          envMapIntensity={lit ? 0.75 : 0.5}
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
          interactive={interactive}
          onFocusBook={onFocusBook}
        />
      ))}
    </group>
  );
});

interface BookProps {
  book: BookHit;
  floorTop: number;
  innerW: number;
  spacing: number;
  layerHeight: number;
  depth: number;
  shelfSeed: number;
  isHi: boolean;
  interactive: boolean;
  onFocusBook: Props['onFocusBook'];
}

/**
 * 一本"写实"的书 = 布面封面板块 + 内嵌的书页块 + 书脊烫金饰带。
 * 高矮厚薄与轻微倾斜按 id 播种的伪随机决定：同一本书每次刷新姿态一致，
 * 但整排书看起来像真实排架，而不是复制粘贴的方块。
 */
const BookMesh = memo(function BookMesh({
  book, floorTop, innerW, spacing, layerHeight, depth, shelfSeed, isHi, interactive, onFocusBook,
}: BookProps) {
  const { t, h, tilt, zOff, hasBand, rough } = useMemo(() => {
    const rnd = seededRandom(book.id * 7919 + shelfSeed);
    const maxT = spacing * 0.92;
    return {
      t: Math.min(maxT, 0.022 + rnd() * 0.03),
      h: layerHeight * (0.62 + rnd() * 0.22),
      tilt: rnd() < 0.12 ? (rnd() - 0.5) * 0.16 : 0,
      zOff: -depth * 0.06 + rnd() * depth * 0.05,
      hasBand: rnd() < 0.5,
      // 每本书的布面粗糙度略有差异，避免整排书反射一模一样（塑料感的来源）
      rough: 0.74 + rnd() * 0.2,
    };
  }, [book.id, shelfSeed, spacing, layerHeight, depth]);

  const [hover, setHover] = useState(false);
  const x = -innerW / 2 + (book.slotIndex + 0.5) * spacing;
  const cover = useMemo(() => coverColor(book.title), [book.title]);
  const bookD = depth * 0.72;

  return (
    <group
      position={[x, floorTop, zOff]}
      rotation={[0, 0, tilt]}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              setHover(true);
              hoverCursor(true);
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              setHover(false);
              hoverCursor(false);
            }
          : undefined
      }
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onFocusBook(book);
      }}
    >
      {/* 封面（布面，微圆角：棱边能接住高光，不再是硬邦邦的塑料方块） */}
      <RoundedBox args={[t, h, bookD]} radius={Math.min(0.004, t * 0.16)} smoothness={3} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial
          map={clothTexture()}
          bumpMap={clothBumpTexture()}
          bumpScale={0.6}
          color={isHi ? '#ffe066' : hover ? cover.clone().multiplyScalar(1.55) : cover}
          emissive={isHi ? '#ffdf70' : hover ? '#3a2a12' : '#000000'}
          emissiveIntensity={isHi ? 0.55 : hover ? 0.5 : 0}
          roughness={rough}
          envMapIntensity={hover || isHi ? 0.75 : 0.42}
        />
      </RoundedBox>
      {/* 书页块：略窄略短，从顶部与书口露出米白页边 */}
      <mesh position={[0, h / 2 + 0.003, -0.004]} raycast={noRaycast}>
        <boxGeometry args={[t * 0.8, h - 0.012, bookD - 0.014]} />
        <meshStandardMaterial map={paperTexture()} color={'#e6d9ba'} roughness={0.95} envMapIntensity={0.18} />
      </mesh>
      {/* 书脊烫金饰带 */}
      {hasBand && h > 0.16 && (
        <mesh position={[0, h * 0.74, bookD / 2 + 0.0008]} raycast={noRaycast}>
          <boxGeometry args={[t * 0.62, 0.008, 0.002]} />
          <meshStandardMaterial color={'#c39a4e'} roughness={0.35} metalness={0.55} />
        </mesh>
      )}
    </group>
  );
});
