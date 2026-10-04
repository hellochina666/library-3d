import type { ShelfType } from '../types';

/**
 * 客户端摆放规则 —— 必须与 server/src/shelves/placement.ts 保持一致。
 * 这里做即时预览（绿色/红色幽灵），最终落位仍由后端权威校验。
 */

/** 同排相邻书架侧向间隙（米） */
export const GAP_X = 0.4;
/** 排与排之间走道宽度（米） */
export const GAP_Z = 0.9;
/** 与 server/src/shelves/placement.ts 同步的判定容差：正好卡在最小间距上的吸附点两边都算「放得下」 */
const COLLIDE_TOL = 0.005;

export interface Foot {
  width: number;
  depth: number;
  posX: number;
  posZ: number;
  rotation: number;
}

export function halfExtents(p: Pick<Foot, 'width' | 'depth' | 'rotation'>) {
  const r = (p.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return {
    hx: (p.width * c + p.depth * s) / 2,
    hz: (p.width * s + p.depth * c) / 2,
  };
}

export function conflicts(a: Foot, b: Foot) {
  const ea = halfExtents(a);
  const eb = halfExtents(b);
  return (
    Math.abs(a.posX - b.posX) < ea.hx + eb.hx + GAP_X - COLLIDE_TOL &&
    Math.abs(a.posZ - b.posZ) < ea.hz + eb.hz + GAP_Z - COLLIDE_TOL
  );
}

/** 当前型号的吸附步长：侧向 = 宽 + GAP_X，纵向 = 深 + GAP_Z */
export function snapStep(type: Pick<ShelfType, 'width' | 'depth'>, rotation: number) {
  const { hx, hz } = halfExtents({ width: type.width, depth: type.depth, rotation });
  return { stepX: hx * 2 + GAP_X, stepZ: hz * 2 + GAP_Z, hx, hz };
}

export function canPlace(candidate: Foot, others: Foot[]) {
  return !others.some((o) => conflicts(candidate, o));
}

export interface Slot {
  posX: number;
  posZ: number;
}

/** 带「此刻能否真的落位」判定的槽位 */
export interface PlannedSlot extends Slot {
  ok: boolean;
}

export interface SlotPlan {
  slots: PlannedSlot[];
  hx: number;
  hz: number;
}

/**
 * 候选落位点集合 = 全局点阵 ∪ 以每个已有书架为锚点的点阵。
 * 只靠全局点阵会出现「地面明明空着却放不下」：老书架的位置不在新点阵上，
 * 于是贴近它们的格子全被判定为冲突。把已摆放的书架也当成锚点，
 * 贴着现有一排永远能顺延出可用位置。
 */
export function planSlots(
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
  type: Pick<ShelfType, 'width' | 'depth'>,
  rotation: number,
  others: Foot[],
  anchors?: Slot[],
  reach = 4,
): SlotPlan {
  const { stepX, stepZ, hx, hz } = snapStep(type, rotation);
  const found = new Map<string, Slot>();
  const add = (x: number, z: number) => {
    if (x < rect.minX + hx || x > rect.maxX - hx) return;
    if (z < rect.minZ + hz || z > rect.maxZ - hz) return;
    const key = `${x.toFixed(2)}|${z.toFixed(2)}`;
    if (!found.has(key)) found.set(key, { posX: x, posZ: z });
  };

  for (let kx = Math.ceil((rect.minX + hx) / stepX); kx <= Math.floor((rect.maxX - hx) / stepX); kx++) {
    for (let kz = Math.ceil((rect.minZ + hz) / stepZ); kz <= Math.floor((rect.maxZ - hz) / stepZ); kz++) {
      add(kx * stepX, kz * stepZ);
    }
  }
  const anchorList: Slot[] = anchors ?? others.map((o) => ({ posX: o.posX, posZ: o.posZ }));
  for (const a of anchorList) {
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        add(a.posX + i * stepX, a.posZ + j * stepZ);
      }
    }
  }

  const slots: PlannedSlot[] = [...found.values()].map((s) => ({
    ...s,
    ok: canPlace(
      { width: type.width, depth: type.depth, posX: s.posX, posZ: s.posZ, rotation },
      others,
    ),
  }));
  return { slots, hx, hz };
}

/** 指针位置 → 最近的候选落位点 */
export function nearestSlot(plan: SlotPlan, x: number, z: number): PlannedSlot | null {
  let best: PlannedSlot | null = null;
  let min = Infinity;
  for (const s of plan.slots) {
    const d = (s.posX - x) ** 2 + (s.posZ - z) ** 2;
    if (d < min) {
      min = d;
      best = s;
    }
  }
  return best;
}

/**
 * 地面「空格提示」线段：绿 = 此刻真的能放，红 = 被占或间距不足。
 * 提示与实际校验共用同一份判定，不会出现「看着空却放不下」。
 */
export function buildSlotLines(plan: SlotPlan) {
  const { slots, hx, hz } = plan;
  const free: number[] = [];
  const blocked: number[] = [];
  const Y = 0.008;
  const pushRect = (buf: number[], cx: number, cz: number) => {
    const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz;
    buf.push(x0, Y, z0, x1, Y, z0);
    buf.push(x1, Y, z0, x1, Y, z1);
    buf.push(x1, Y, z1, x0, Y, z1);
    buf.push(x0, Y, z1, x0, Y, z0);
  };
  for (const s of slots) pushRect(s.ok ? free : blocked, s.posX, s.posZ);
  return { free: new Float32Array(free), blocked: new Float32Array(blocked) };
}
