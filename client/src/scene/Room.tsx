import { useMemo } from 'react';
import * as THREE from 'three';
import { aoBlobTexture, artTexture, clothTexture, rugTexture, scanTexture, wallTexture, woodTexture } from './materials';

export interface RoomRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

interface Props {
  rect: RoomRect;
}

/** 扫描法线图的强度：墙面抹灰的起伏比地板更怕过冲，压到 0.6 才不像浮雕 */
const FLOOR_NORMAL_SCALE = new THREE.Vector2(1, 1);
const WALL_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);

/**
 * 程序化室内环境（温馨现代简约风）：
 * 奶油墙面 + 浅橡木地板 + 黑框大窗与纱帘、墙面壁灯、挂画、
 * 阅读长凳、边几台灯、绿植与落地灯。没有吊顶与吊灯，
 * 光源只来自窗光、壁灯与台灯。装饰不拦截指针事件（点击仍然只落在层板/书上）。
 */
export function Room({ rect }: Props) {
  const w = rect.maxX - rect.minX;
  const d = rect.maxZ - rect.minZ;
  const h = rect.height;
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;

  // 扫描贴图必须按真实物理尺寸铺贴：地板扫描件一拍是 2m×2m、墙面 3m×3m。
  // 老写法 repeat.set(w / 4, 1) 把一整张图纵向拉伸到墙高，就是「贴图糊」的直接成因。
  const floorRepeat: [number, number] = [w / 2, d / 2];
  const wallRepeat: [number, number] = [w / 3, h / 3];

  const wall2 = useMemo(() => {
    const t = wallTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(d / 4, 1);
    return t;
  }, [d]);

  const noRaycast = () => null;
  // 墙面装饰沿墙按比例分布；墙太窄时收进中段避免挤在一起
  const u = Math.min(w, 10);
  const z0 = cz - u / 2;
  const artW = Math.min(Math.max(w * 0.16, 0.5), 0.78);

  return (
    <group>
      {/* 地板：扫描 PBR 三件套。roughness 标量必须留 1，否则会把 roughnessMap 乘暗；
          clearcoat 是 laminate 表面那层清漆，与粗糙度贴图不冲突 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[w, d]} />
        <meshPhysicalMaterial
          map={scanTexture('laminate_floor_diff_2k.jpg', floorRepeat)}
          normalMap={scanTexture('laminate_floor_nor_gl_2k.jpg', floorRepeat, false)}
          normalScale={FLOOR_NORMAL_SCALE}
          roughnessMap={scanTexture('laminate_floor_rough_2k.jpg', floorRepeat, false)}
          roughness={1}
          metalness={0}
          clearcoat={0.28}
          clearcoatRoughness={0.5}
          envMapIntensity={0.8}
        />
      </mesh>

      {/* 后墙（-Z 侧）：暖调强调墙，衬托书架与挂画。左墙仍用程序纹理，便于同屏 A/B */}
      <mesh position={[cx, h / 2, rect.minZ]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          map={scanTexture('beige_wall_001_diff_2k.jpg', wallRepeat)}
          normalMap={scanTexture('beige_wall_001_nor_gl_2k.jpg', wallRepeat, false)}
          normalScale={WALL_NORMAL_SCALE}
          roughnessMap={scanTexture('beige_wall_001_rough_2k.jpg', wallRepeat, false)}
          roughness={1}
          metalness={0}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* 左墙（-X 侧，开窗）：奶油色，法线朝内，相机转到外侧时自动透明 */}
      <mesh position={[rect.minX, h / 2, cz]} rotation={[0, Math.PI / 2, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial map={wall2} bumpMap={wall2} bumpScale={0.12} color={'#f2ead9'} roughness={0.95} envMapIntensity={0.15} />
      </mesh>

      {/* 踢脚线：现代简约奶油白 */}
      <mesh position={[rect.minX + 0.03, 0.05, cz]} raycast={noRaycast}>
        <boxGeometry args={[0.04, 0.1, d]} />
        <meshStandardMaterial color={'#e9dfcc'} roughness={0.8} />
      </mesh>
      <mesh position={[cx, 0.05, rect.minZ + 0.03]} raycast={noRaycast}>
        <boxGeometry args={[w, 0.1, 0.04]} />
        <meshStandardMaterial color={'#e9dfcc'} roughness={0.8} />
      </mesh>

      {/* 左墙窗户：落地前窗 + 靠里一扇（房间深时），黑细框现代分格 */}
      <WindowGroup position={[rect.minX + 0.04, 0, cz]} rotation={[0, Math.PI / 2, 0]} width={Math.min(Math.max(d * 0.32, 1.6), 2.6)} raycast={noRaycast} />
      {d > 8 && (
        <WindowGroup position={[rect.minX + 0.04, 0, cz + d * 0.28]} rotation={[0, Math.PI / 2, 0]} width={Math.min(Math.max(d * 0.24, 1.2), 1.9)} raycast={noRaycast} />
      )}

      {/* 后墙装饰：壁灯 + 挂画，交替排布 */}
      <Sconce position={[z0 + u * 0.12, 1.95, rect.minZ + 0.05]} rotation={[0, 0, 0]} raycast={noRaycast} />
      <Sconce position={[z0 + u * 0.88, 1.95, rect.minZ + 0.05]} rotation={[0, 0, 0]} raycast={noRaycast} />
      <Painting position={[z0 + u * 0.36, 1.72, rect.minZ + 0.04]} rotation={[0, 0, 0]} width={artW} variant={0} raycast={noRaycast} />
      <Painting position={[z0 + u * 0.63, 1.72, rect.minZ + 0.04]} rotation={[0, 0, 0]} width={artW * 0.78} variant={1} raycast={noRaycast} />

      {/* 左墙也补一幅小画（第二扇窗之间） */}
      {d > 8 && (
        <Painting position={[rect.minX + 0.04, 1.72, cz - d * 0.26]} rotation={[0, Math.PI / 2, 0]} width={0.55} variant={2} raycast={noRaycast} />
      )}

      {/* 走道地毯：奶油底陶土边 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, cz + 0.4]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[Math.min(w * 0.8, 3.4), 2]} />
        <meshStandardMaterial map={rugTexture()} roughness={0.98} />
      </mesh>

      {/* 阅读长凳：靠窗摆放，木座面 + 黑钢腿 + 奶油坐垫 */}
      <group position={[rect.minX + 0.72, 0, cz + 0.35]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <AoBlob sx={1.7} sz={0.85} />
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[1.15, 0.045, 0.38]} />
          <meshStandardMaterial map={woodTexture('warm')} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.47, 0]} castShadow>
          <boxGeometry args={[1.08, 0.06, 0.33]} />
          <meshStandardMaterial map={clothTexture()} color={'#e3d3b8'} roughness={0.95} />
        </mesh>
        {[-0.48, 0.48].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]}>
            <boxGeometry args={[0.03, 0.4, 0.03]} />
            <meshStandardMaterial color={'#26221e'} roughness={0.4} metalness={0.7} />
          </mesh>
        ))}
      </group>

      {/* 边几 + 台灯 + 一摞书：长凳旁，暖光点光源 */}
      <group position={[rect.minX + 0.8, 0, cz + 1.75]} raycast={noRaycast}>
        <AoBlob sx={0.95} sz={0.95} />
        <mesh position={[0, 0.46, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.03, 24]} />
          <meshStandardMaterial map={woodTexture('dark')} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.23, 0]}>
          <cylinderGeometry args={[0.028, 0.034, 0.46, 12]} />
          <meshStandardMaterial color={'#26221e'} roughness={0.4} metalness={0.7} />
        </mesh>
        <TableLamp raycast={noRaycast} />
        {/* 一摞书 */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.13, 0.48 + 0.021 + i * 0.042, 0.08]} rotation={[0, i * 0.35 - 0.2, 0]} castShadow>
            <boxGeometry args={[0.2 - i * 0.015, 0.038, 0.15 - i * 0.01]} />
            <meshStandardMaterial color={['#b3654a', '#7d8a6a', '#c9a35a'][i]} roughness={0.85} />
          </mesh>
        ))}
      </group>

      {/* 落地灯：开放侧角落，三脚架 + 亚麻灯罩 */}
      <group position={[rect.maxX - 1.05, 0, rect.maxZ - 1.05]} raycast={noRaycast}>
        <AoBlob sx={0.85} sz={0.85} opacity={0.6} />
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.sin(a) * 0.09, 0.36, Math.cos(a) * 0.09]} rotation={[Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28]}>
              <cylinderGeometry args={[0.011, 0.014, 0.74, 8]} />
              <meshStandardMaterial color={'#3a322a'} roughness={0.5} metalness={0.4} />
            </mesh>
          );
        })}
        <mesh position={[0, 0.78, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.5, 8]} />
          <meshStandardMaterial color={'#3a322a'} roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 1.18, 0]}>
          <cylinderGeometry args={[0.13, 0.17, 0.24, 20, 1, true]} />
          <meshStandardMaterial color={'#efe2c8'} emissive={'#ffdca6'} emissiveIntensity={0.75} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0, 1.12, 0]} color={'#ffd2a0'} intensity={3.4} distance={6} decay={2} />
      </group>

      {/* 角落大绿植 + 窗台小盆栽（窗台面高约 0.77m） */}
      <PottedPlant position={[rect.minX + 0.75, 0, rect.minZ + 0.75]} scale={1.5} raycast={noRaycast} />
      <PottedPlant position={[rect.minX + 0.12, 0.77, cz - 0.6]} scale={0.42} raycast={noRaycast} />
    </group>
  );
}

/** 家具脚下的接触阴影（假 AO）：径向暗晕贴片 */
function AoBlob({ sx, sz, opacity = 0.75 }: { sx: number; sz: number; opacity?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]} renderOrder={1} raycast={() => null}>
      <planeGeometry args={[sx, sz]} />
      <meshBasicMaterial map={aoBlobTexture()} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** 装饰件通用：不参与射线拾取 */
type DecorProps = {
  position: [number, number, number];
  rotation?: [number, number, number];
  raycast: () => null;
};

/** 黑细框大窗：亮天空玻璃 + 分格 + 窗台 + 两侧纱帘 */
function WindowGroup({
  position,
  rotation,
  width,
  raycast,
}: DecorProps & { width: number }) {
  const winH = 1.7;
  const y = 0.78 + winH / 2;
  const mull = Math.max(2, Math.round(width / 0.8));
  return (
    <group position={position} rotation={rotation}>
      {/* 天空发光面 */}
      <mesh position={[0, y, 0]} raycast={raycast}>
        <planeGeometry args={[width, winH]} />
        <meshStandardMaterial color={'#0c0c0c'} emissive={'#fff3da'} emissiveIntensity={2.1} toneMapped={false} />
      </mesh>
      {/* 黑细框：外框 + 竖向分格 + 一道横梁 */}
      <mesh position={[0, y, 0.012]} raycast={raycast}>
        <boxGeometry args={[width + 0.07, winH + 0.07, 0.03]} />
        <meshStandardMaterial color={'#2b2b2b'} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, y, 0.032]} raycast={raycast}>
        <boxGeometry args={[width - 0.02, winH - 0.02, 0.014]} />
        <meshStandardMaterial color={'#0c0c0c'} emissive={'#fff3da'} emissiveIntensity={2.1} toneMapped={false} />
      </mesh>
      {Array.from({ length: mull - 1 }, (_, i) => {
        const x = (i + 1) * (width / mull) - width / 2;
        return (
          <mesh key={i} position={[x, y, 0.045]} raycast={raycast}>
            <boxGeometry args={[0.035, winH, 0.03]} />
            <meshStandardMaterial color={'#2b2b2b'} roughness={0.5} metalness={0.3} />
          </mesh>
        );
      })}
      <mesh position={[0, y + winH * 0.18, 0.045]} raycast={raycast}>
        <boxGeometry args={[width, 0.03, 0.03]} />
        <meshStandardMaterial color={'#2b2b2b'} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* 窗台 */}
      <mesh position={[0, 0.78 - 0.03, 0.05]} raycast={raycast} castShadow>
        <boxGeometry args={[width + 0.16, 0.035, 0.14]} />
        <meshStandardMaterial map={woodTexture('warm')} roughness={0.6} />
      </mesh>
      {/* 两侧亚麻纱帘 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.14), 1.35, 0.09]} raycast={raycast} castShadow>
          <boxGeometry args={[0.16, 2.35, 0.05]} />
          <meshStandardMaterial color={'#f3ead8'} roughness={1} transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}

/** 墙面壁灯：黄铜短臂 + 奶油半圆灯罩 + 暖光点光源 */
function Sconce({ position, rotation, raycast }: DecorProps) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.008]} raycast={raycast}>
        <cylinderGeometry args={[0.055, 0.055, 0.016, 20]} />
        <meshStandardMaterial color={'#b08d57'} roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.05, 0.05]} rotation={[Math.PI / 2, 0, 0]} raycast={raycast}>
        <cylinderGeometry args={[0.012, 0.012, 0.09, 10]} />
        <meshStandardMaterial color={'#b08d57'} roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.115, 0.085]} rotation={[Math.PI / 2.6, 0, 0]} raycast={raycast}>
        <sphereGeometry args={[0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={'#f2e7d2'} roughness={0.65} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.1, 0.088]} raycast={raycast}>
        <sphereGeometry args={[0.038, 14, 10]} />
        <meshStandardMaterial color={'#000'} emissive={'#ffd9a4'} emissiveIntensity={3.2} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.12, 0.22]} color={'#ffd2a0'} intensity={2.4} distance={5} decay={2} />
    </group>
  );
}

/** 挂画：深木框 + 米白卡纸留白 + 程序化抽象画芯 */
function Painting({
  position,
  rotation,
  width,
  variant,
  raycast,
}: DecorProps & { width: number; variant: number }) {
  const art = useMemo(() => artTexture(variant), [variant]);
  const height = width * 1.24;
  return (
    <group position={position} rotation={rotation}>
      <mesh raycast={raycast} castShadow>
        <boxGeometry args={[width + 0.05, height + 0.05, 0.035]} />
        <meshStandardMaterial map={woodTexture('dark')} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0, 0.019]} raycast={raycast}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={'#f6efe2'} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.02]} raycast={raycast}>
        <planeGeometry args={[width * 0.82, height * 0.84]} />
        <meshStandardMaterial map={art} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** 台灯：陶土底座 + 亚麻灯罩 + 暖光 */
function TableLamp({ raycast }: { raycast: () => null }) {
  return (
    <group position={[-0.1, 0.475, 0]}>
      <mesh position={[0, 0.09, 0]} castShadow raycast={raycast}>
        <cylinderGeometry args={[0.05, 0.062, 0.18, 18]} />
        <meshStandardMaterial color={'#c4795a'} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.26, 0]} raycast={raycast}>
        <cylinderGeometry args={[0.095, 0.125, 0.15, 20, 1, true]} />
        <meshStandardMaterial color={'#f2e6cc'} emissive={'#ffd9a4'} emissiveIntensity={0.85} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 0.24, 0]} color={'#ffd2a0'} intensity={3} distance={4.8} decay={2} />
    </group>
  );
}

/** 盆栽绿植：陶盆 + 散叶（扁球叶片，按种子随机姿态） */
function PottedPlant({
  position,
  scale,
  raycast,
}: DecorProps & { scale: number }) {
  const leaves = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number]; s: number; c: string }[] = [];
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rnd() * 0.5;
      const rad = 0.1 + rnd() * 0.16;
      out.push({
        p: [Math.sin(a) * rad, 0.52 + rnd() * 0.42, Math.cos(a) * rad],
        r: [rnd() * 0.9 - 0.45, a, rnd() * 0.9 - 0.45],
        s: 0.09 + rnd() * 0.07,
        c: rnd() > 0.5 ? '#6f8b5e' : '#5d7a4e',
      });
    }
    return out;
  }, []);

  return (
    <group position={position} rotation={[0, position[2] * 7, 0]}>
      <group scale={scale}>
        <mesh position={[0, 0.14, 0]} castShadow raycast={raycast}>
          <cylinderGeometry args={[0.15, 0.11, 0.28, 18]} />
          <meshStandardMaterial color={'#c98d6b'} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.285, 0]} raycast={raycast}>
          <cylinderGeometry args={[0.14, 0.14, 0.012, 18]} />
          <meshStandardMaterial color={'#3a2c1e'} roughness={1} />
        </mesh>
        <mesh position={[0, 0.44, 0]} raycast={raycast}>
          <cylinderGeometry args={[0.014, 0.02, 0.34, 8]} />
          <meshStandardMaterial color={'#6b543a'} roughness={0.9} />
        </mesh>
        {leaves.map((l, i) => (
          <mesh key={i} position={l.p} rotation={l.r} scale={[l.s * 2.1, l.s * 0.6, l.s]} raycast={raycast} castShadow>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={l.c} roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
