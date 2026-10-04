import type { ShelfType } from '../types';

/**
 * 客户端摆放规则 —— 必须与 server/src/shelves/placement.ts 的间距判定保持一致。
 * 这里做即时预览（幽灵绿/红、占用格子），最终落位仍由后端权威校验。
 *
 * 地面网格：全局按 CELL 等分的**正方形**点阵，平均分布、与书架型号无关；
 * 候选落位点 = 全局方格点阵 ∪ 以每个已有书架为锚点的随行点阵（保证贴着
 * 现有一排永远能顺延出可用位置）。
 */

/** 同排相邻书架侧向间隙（米） */
export const GAP_X = 0.4;
/** 排与排之间走道宽度（米） */
export const GAP_Z = 0.9;
/** 全局地面方格边长（米）：底部网格的基本单元 */
export const CELL = 0.6;
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

/** 当前型号的随行步长：侧向 = 宽 + GAP_X，纵向 = 深 + GAP_Z */
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
 * 候选落位点集合：
 * 1) 全局方格点阵（CELL 等分正方形，均匀铺满房间）；
 * 2) 以每个已有书架为锚点的随行点阵（按型号真实步长展开）——
 *    已有书架往往不在全局点阵上，光靠 1) 会出现「地面明明空着却放不下」，
 *    把它们当锚点，贴着现有一排永远能顺延出可用位置。
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

  // 1) 全局正方形点阵
  for (let gx = Math.ceil(rect.minX / CELL); gx <= Math.floor(rect.maxX / CELL); gx++) {
    for (let gz = Math.ceil(rect.minZ / CELL); gz <= Math.floor(rect.maxZ / CELL); gz++) {
      add(gx * CELL, gz * CELL);
    }
  }
  // 2) 锚点随行点阵
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

/** 地面正方形网格线（放置时显示，帮助读格子；y 要高于地毯才能透出来） */
export function buildGridLines(
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
  y = 0.016,
) {
  const pts: number[] = [];
  for (let x = Math.ceil(rect.minX / CELL) * CELL; x <= rect.maxX; x += CELL) {
    pts.push(x, y, rect.minZ, x, y, rect.maxZ);
  }
  for (let z = Math.ceil(rect.minZ / CELL) * CELL; z <= rect.maxZ; z += CELL) {
    pts.push(rect.minX, y, z, rect.maxX, y, z);
  }
  return new Float32Array(pts);
}

/**
 * 已有书架占用的底部格子： footprint 覆盖到的方格逐格填充。
 * 一个书架占几个格子一眼可见，也是摆放时的「已占用」高亮。
 */
export function buildOccupiedCells(others: Foot[], y = 0.02) {
  const pts: number[] = [];
  const half = CELL / 2;
  for (const o of others) {
    const { hx, hz } = halfExtents(o);
    // 该书架 footprint 覆盖的格子范围（格子中心在 CELL 整数倍上）
    const i0 = Math.ceil((o.posX - hx - half) / CELL);
    const i1 = Math.floor((o.posX + hx + half) / CELL);
    const j0 = Math.ceil((o.posZ - hz - half) / CELL);
    const j1 = Math.floor((o.posZ + hz + half) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cx = i * CELL;
        const cz = j * CELL;
        // 格子方形与 footprint 相交才算占用（贴边的排除）
        if (cx + half <= o.posX - hx || cx - half >= o.posX + hx) continue;
        if (cz + half <= o.posZ - hz || cz - half >= o.posZ + hz) continue;
        pts.push(
          cx - half, y, cz - half, cx + half, y, cz - half, cx + half, y, cz + half,
          cx - half, y, cz - half, cx + half, y, cz + half, cx - half, y, cz + half,
        );
      }
    }
  }
  return new Float32Array(pts);
}
