import { useMemo } from 'react';
import * as THREE from 'three';
import { floorTexture, wallTexture, rugTexture, woodTexture } from './materials';

export interface RoomRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

interface Props {
  rect: RoomRect;
  /** 吊灯摆放点（走道上方） */
  lampPositions: [number, number][];
}

/**
 * 程序化室内环境：拼花木地板、暖色墙面、侧窗、踢脚线、吊顶、
 * 走道地毯、工业风吊灯与角落落地灯。只起氛围作用，
 * 不拦截指针事件（点击仍然只落在层板/书上）。
 */
export function Room({ rect, lampPositions }: Props) {
  const w = rect.maxX - rect.minX;
  const d = rect.maxZ - rect.minZ;
  const h = rect.height;
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const midZ = cz;

  const floor = useMemo(() => {
    const t = floorTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(w / 3.2, d / 3.2);
    return t;
  }, [w, d]);

  const wall = useMemo(() => {
    const t = wallTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(w / 4, 1);
    return t;
  }, [w]);

  const wall2 = useMemo(() => {
    const t = wallTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(d / 4, 1);
    return t;
  }, [d]);

  const noRaycast = () => null;

  return (
    <group>
      {/* 地板 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floor} roughness={0.55} metalness={0.02} />
      </mesh>

      {/* 左墙（-X 侧，开窗）：法线朝内，相机转到外侧时自动透明 */}
      <mesh position={[rect.minX, h / 2, cz]} rotation={[0, Math.PI / 2, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial map={wall2} roughness={0.92} />
      </mesh>

      {/* 后墙（-Z 侧） */}
      <mesh position={[cx, h / 2, rect.minZ]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={wall} roughness={0.92} />
      </mesh>

      {/* 吊顶：压暗，只允许从下方看到 */}
      <mesh position={[cx, h, cz]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={'#4a3d31'} roughness={1} />
      </mesh>

      {/* 踢脚线 */}
      <mesh position={[rect.minX + 0.03, 0.055, cz]} raycast={noRaycast}>
        <boxGeometry args={[0.045, 0.11, d]} />
        <meshStandardMaterial color={'#4c3521'} roughness={0.7} />
      </mesh>
      <mesh position={[cx, 0.055, rect.minZ + 0.03]} raycast={noRaycast}>
        <boxGeometry args={[w, 0.11, 0.045]} />
        <meshStandardMaterial color={'#4c3521'} roughness={0.7} />
      </mesh>

      {/* 侧窗：暖白天光入口 + 木框分格 */}
      <group position={[rect.minX + 0.04, 1.75, midZ]} rotation={[0, Math.PI / 2, 0]}>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[1.7, 2.05]} />
          <meshStandardMaterial color={'#000'} emissive={'#ffedcf'} emissiveIntensity={2.6} toneMapped={false} />
        </mesh>
        {[
          [0, 0, 0.05, 2.05],
          [-0.55, 0, 0.04, 2.05],
          [0.55, 0, 0.04, 2.05],
          [0, 0.55, 1.7, 0.04],
          [0, -0.55, 1.7, 0.04],
        ].map(([x, y, bw, bh], i) => (
          <mesh key={i} position={[x, y, 0.015]} raycast={noRaycast}>
            <boxGeometry args={[bw, bh, 0.035]} />
            <meshStandardMaterial map={woodTexture('dark')} color={'#caa'} roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.028]} raycast={noRaycast}>
          <boxGeometry args={[1.82, 2.18, 0.02]} />
          <meshStandardMaterial color={'#efe6d8'} transparent opacity={0.14} roughness={0.1} depthWrite={false} />
        </mesh>
      </group>

      {/* 走道地毯 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, midZ + 0.4]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[Math.min(w * 0.8, 3.4), 2]} />
        <meshStandardMaterial map={rugTexture()} roughness={0.98} />
      </mesh>

      {/* 工业风吊灯：吊杆 + 金属灯罩 + 发光灯泡 + 暖光点光源 */}
      {lampPositions.map(([lx, lz], i) => (
        <group key={i} position={[lx, 0, lz]}>
          <mesh position={[0, h - (h - 2.15) / 2, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.011, 0.011, h - 2.15, 8]} />
            <meshStandardMaterial color={'#1c1a17'} roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[0, 2.15, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.05, 0.17, 0.17, 24, 1, true]} />
            <meshStandardMaterial color={'#2b2622'} roughness={0.45} metalness={0.55} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 2.09, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.045, 16, 12]} />
            <meshStandardMaterial color={'#000'} emissive={'#ffcf87'} emissiveIntensity={6} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 2.02, 0]} color={'#ffb46b'} intensity={5.5} distance={7.5} decay={2} />
        </group>
      ))}

      {/* 角落落地灯 */}
      <group position={[rect.maxX - 1, 0, rect.maxZ - 1]}>
        <mesh position={[0, 0.72, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.016, 0.02, 1.44, 10]} />
          <meshStandardMaterial color={'#241f1a'} roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh position={[0, 1.42, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.1, 0.17, 0.22, 20, 1, true]} />
          <meshStandardMaterial color={'#3a2d22'} emissive={'#ff9d4d'} emissiveIntensity={0.55} roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.36, 0]} raycast={noRaycast}>
          <sphereGeometry args={[0.04, 12, 10]} />
          <meshStandardMaterial color={'#000'} emissive={'#ffc479'} emissiveIntensity={5} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 1.34, 0]} color={'#ffb46b'} intensity={3.2} distance={5.5} decay={2} />
      </group>
    </group>
  );
}
