import type * as THREE from 'three';

/**
 * 层板 mesh 登记表：layerId -> Object3D
 * 高亮时按 layerId 取出对应 mesh 交给 OutlinePass 描边。
 * 这是「数据 id」与「3D 物体」之间的桥梁 —— 一一对应的关键。
 */
const layerMeshes = new Map<number, THREE.Object3D>();
const listeners = new Set<() => void>();
let version = 0;

export function registerLayerMesh(layerId: number, obj: THREE.Object3D | null) {
  if (obj) layerMeshes.set(layerId, obj);
  else layerMeshes.delete(layerId);
  version++;
  listeners.forEach((l) => l());
}

export function getLayerMesh(layerId: number): THREE.Object3D | null {
  return layerMeshes.get(layerId) ?? null;
}

export function subscribeRegistry(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function registryVersion() {
  return version;
}
