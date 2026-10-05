import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { BookHit, Shelf } from '../types';
import { registerLayerMesh } from './registry';
import {
  aoBlobTexture,
  bookClothBumpTexture,
  bookClothTexture,
  coverColor,
  fitGrainUVs,
  ledPoolTexture,
  paperTexture,
  seededRandom,
  signTexture,
  veneerMaps,
  type BookBinding,
} from './materials';

/** 板厚与立板厚度（米） */
const PLANK_T = 0.03;
const SIDE_T = 0.04;

/** 木饰面一拍的物理尺寸（米），与 materials.ts 里的扫描件一致 */
const OAK_TILE_M = 1.83;
const WALNUT_TILE_M = 1.8;

/** 橡木/胡桃饰面三件套：模块级加载一次，全站书架共享 */
const OAK_VENEER = veneerMaps('oak');
const WALNUT_VENEER = veneerMaps('walnut');

/** 扫描法线强度：饰面木纹比地板更细，压一点才不像浮雕 */
const WOOD_NORMAL_SCALE = new THREE.Vector2(0.8, 0.8);

/** 纯装饰网格不参与射线：书架 Group 带事件，子网格会被递归拾取 */
const noRaycast = () => null;

/** 悬停时把手型指针挂到 body，离开再收回（多本书连续悬停不会串状态） */
function hoverCursor(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : '';
}

/**
 * 实木书架部件：BoxGeometry 的 UV 按物理尺寸重排（1 纹理单位 = 一拍饰面），
 * 木纹永远顺着面的长边，每块料带随机相位 —— 同一架子里没有两块板纹路重样。
 */
const WoodPart = memo(function WoodPart({
  w, h, d, position, kind = 'oak', seed = 1, castShadow, receiveShadow, raycast, tint = '#ffffff',
}: {
  w: number;
  h: number;
  d: number;
  position: [number, number, number];
  kind?: 'oak' | 'walnut';
  seed?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  raycast?: () => null;
  tint?: string;
}) {
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(w, h, d);
    fitGrainUVs(g, [w, h, d], kind === 'oak' ? OAK_TILE_M : WALNUT_TILE_M, seededRandom(seed));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, d, kind, seed]);
  useEffect(() => () => geo.dispose(), [geo]);
  const v = kind === 'oak' ? OAK_VENEER : WALNUT_VENEER;
  return (
    <mesh geometry={geo} position={position} castShadow={castShadow} receiveShadow={receiveShadow} raycast={raycast}>
      <meshStandardMaterial
        map={v.map}
        normalMap={v.normalMap}
        normalScale={WOOD_NORMAL_SCALE}
        roughnessMap={v.roughnessMap}
        roughness={1}
        metalness={0}
        color={tint}
        envMapIntensity={0.6}
        emissive={'#3a2410'}
        emissiveIntensity={0.22}
      />
    </mesh>
  );
});

/**
 * 层板下的暖光灯带：贴齐层板前缘（微凸 1mm，任何角度都读得出亮线），
 * toneMapped=false 直出 HDR 经 Bloom 泛出柔光晕，悬停/命中该层时增亮。
 */
const LedStrip = memo(function LedStrip({ w, position, lit }: { w: number; position: [number, number, number]; lit: boolean }) {
  return (
    <mesh position={position} raycast={noRaycast}>
      <boxGeometry args={[w, 0.005, 0.012]} />
      <meshStandardMaterial
        color={'#1a1206'}
        emissive={'#ffc27a'}
        emissiveIntensity={lit ? 2.3 : 1.35}
        toneMapped={false}
      />
    </mesh>
  );
});

/** 灯带在层板顶面留下的光池：加色叠亮，假装灯带洒下来的暖光 */
const LedPool = memo(function LedPool({ w, d, y, lit }: { w: number; d: number; y: number; lit: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, d / 2 - d * 0.22]} renderOrder={2} raycast={noRaycast}>
      <planeGeometry args={[w, d * 0.44]} />
      <meshBasicMaterial
        map={ledPoolTexture()}
        transparent
        opacity={lit ? 0.95 : 0.62}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
});

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
 * 扫描橡木饰面的侧板与层板、奶油漆背板、顶部帽线，层板前缘暖光灯带，
 * 书籍为精装布面装订（书脊竹节 + 烫金框 + 可见书页块）。
 */
export const ShelfMesh = memo(function ShelfMesh({
  shelf, books, shelfHi, hiLayerId, hiBookId, interactive, onPickLayer, onFocusBook, lockRef, onShelfDown,
}: Props) {
  const { width, depth, layerCount, layerHeight, slotsPerLayer } = shelf.type;

  const totalH = layerCount * layerHeight + 3 * PLANK_T;
  const innerW = width - 2 * SIDE_T - 0.06;
  const spacing = innerW / slotsPerLayer;

  const frameTint = shelfHi ? '#f0b050' : '#ffffff';
  const frameSeed = shelf.id * 131;

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

      {/* 两侧立板：扫描橡木饰面 */}
      {[-1, 1].map((s) => (
        <WoodPart key={s} w={SIDE_T} h={totalH} d={depth} position={[(s * (width - SIDE_T)) / 2, totalH / 2, 0]} seed={frameSeed + s} castShadow tint={frameTint} />
      ))}

      {/* 背板：奶油漆面板（现代简约），命中时整架泛暖 */}
      <mesh position={[0, totalH / 2, -depth / 2 + 0.011]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[width - 2 * SIDE_T, totalH, 0.018]} />
        <meshStandardMaterial color={shelfHi ? '#f3d9a4' : '#ddd0b6'} roughness={0.9} envMapIntensity={0.22} />
      </mesh>

      {/* 顶板 + 帽线、底座 */}
      <WoodPart w={width} h={PLANK_T} d={depth} position={[0, totalH - PLANK_T / 2, 0]} seed={frameSeed + 11} castShadow tint={frameTint} />
      <WoodPart w={width + 0.06} h={0.038} d={depth + 0.04} position={[0, totalH + 0.021, 0.006]} seed={frameSeed + 12} castShadow raycast={noRaycast} tint={frameTint} />
      <WoodPart w={width} h={PLANK_T} d={depth} position={[0, PLANK_T / 2, 0]} seed={frameSeed + 13} receiveShadow raycast={noRaycast} tint={frameTint} />

      {/* 顶层天花板的灯带（其余层由各自上方层板下的灯带照亮） */}
      <LedStrip w={innerW + 0.02} position={[0, totalH - PLANK_T - 0.0035, depth / 2 - 0.005]} lit={shelfHi} />

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
          shelfSeed={frameSeed}
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
      {/* 底座：深胡桃饰面窄条，压住两块斜面板的脚 */}
      <WoodPart w={signW} h={0.016} d={baseHalf * 2 + 0.02} position={[0, 0.008, 0]} kind="walnut" seed={41} raycast={noRaycast} castShadow />

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

  // 层板几何：UV 按物理尺寸铺橡木饰面（每层随机相位，板板纹路不同）
  const plankGeo = useMemo(() => {
    const w = width - 2 * SIDE_T;
    const g = new THREE.BoxGeometry(w, PLANK_T, depth);
    fitGrainUVs(g, [w, PLANK_T, depth], OAK_TILE_M, seededRandom(shelfSeed * 3 + layerIndex));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, depth, shelfSeed, layerIndex]);
  useEffect(() => () => plankGeo.dispose(), [plankGeo]);

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
        geometry={plankGeo}
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
        <meshStandardMaterial
          map={OAK_VENEER.map}
          normalMap={OAK_VENEER.normalMap}
          normalScale={WOOD_NORMAL_SCALE}
          roughnessMap={OAK_VENEER.roughnessMap}
          roughness={1}
          metalness={0}
          color={highlighted ? '#ffd76a' : hover ? '#ffe9c4' : '#ffffff'}
          emissive={highlighted ? '#ff8c00' : '#000000'}
          emissiveIntensity={highlighted ? 0.5 : 0}
          envMapIntensity={lit ? 0.75 : 0.6}
        />
      </mesh>

      {/* 层板前缘下的暖光灯带 + 层板顶面的光池：往下照亮这一格的书 */}
      <LedStrip w={width - 2 * SIDE_T - 0.02} position={[0, plankY - PLANK_T / 2 - 0.0035, depth / 2 - 0.005]} lit={lit} />
      <LedPool w={width - 2 * SIDE_T - 0.01} d={depth} y={floorTop + 0.0006} lit={lit} />

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
 * 一本"精装"书：布面硬壳（书脊竹节棱线 + 全周烫金框 + 烫金书名标签）
 * + 从顶部与书口真正露出的米白书页块。
 * 高矮厚薄与轻微倾斜按 id 播种的伪随机决定：同一本书每次刷新姿态一致，
 * 但整排书看起来像真实排架，而不是复制粘贴的方块。
 * 装订版式（竹节数量/标签位置）也按种子在两套里选，整排书细节不重样。
 */
const BookMesh = memo(function BookMesh({
  book, floorTop, innerW, spacing, layerHeight, depth, shelfSeed, isHi, interactive, onFocusBook,
}: BookProps) {
  const { t, h, tilt, zOff, binding, rough } = useMemo(() => {
    const rnd = seededRandom(book.id * 7919 + shelfSeed);
    const maxT = spacing * 0.92;
    return {
      t: Math.min(maxT, 0.022 + rnd() * 0.03),
      h: layerHeight * (0.62 + rnd() * 0.22),
      tilt: rnd() < 0.12 ? (rnd() - 0.5) * 0.16 : 0,
      zOff: -depth * 0.06 + rnd() * depth * 0.05,
      binding: (rnd() < 0.55 ? 0 : 1) as BookBinding,
      // 每本书的布面粗糙度略有差异，避免整排书反射一模一样（塑料感的来源）
      rough: 0.72 + rnd() * 0.18,
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
      {/* 精装硬壳：微圆角布面，书脊面与封面共用装订贴图（竹节/烫金框/标签随染色变铜箔） */}
      <RoundedBox args={[t, h, bookD]} radius={Math.min(0.0035, t * 0.14)} smoothness={3} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial
          map={bookClothTexture(binding)}
          bumpMap={bookClothBumpTexture(binding)}
          bumpScale={0.55}
          color={isHi ? '#ffe066' : hover ? cover.clone().multiplyScalar(1.55) : cover}
          emissive={isHi ? '#ffdf70' : hover ? '#3a2a12' : '#000000'}
          emissiveIntensity={isHi ? 0.55 : hover ? 0.5 : 0}
          roughness={rough}
          envMapIntensity={hover || isHi ? 0.75 : 0.45}
        />
      </RoundedBox>
      {/* 书页块：与封面同轴心，顶部微凸 4.5mm、书口侧探出 1mm —— 米白页边真正可见 */}
      <mesh position={[t * 0.05, h / 2 + 0.002, -bookD * 0.03]} raycast={noRaycast}>
        <boxGeometry args={[t * 0.94, h + 0.005, bookD * 0.85]} />
        <meshStandardMaterial map={paperTexture()} color={'#e6dabd'} roughness={0.95} envMapIntensity={0.2} />
      </mesh>
    </group>
  );
});
