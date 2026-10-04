import { BadRequestException } from '@nestjs/common';

/**
 * 书架落位规则（服务端权威校验，与客户端摆放预览的 rules.ts 保持一致）：
 * 两个书架「占位矩形」在 X 与 Z 两轴同时不满足最小间距，就算冲突放不下。
 */

/** 同排相邻书架侧向间隙（米） */
export const GAP_X = 0.4;
/** 排与排（同列/交叉列）之间走道宽度（米） */
export const GAP_Z = 0.9;
/**
 * 判定容差（米）：吸附点正好落在理论最小间距上时，浮点误差会让前端显示「绿」
 * 而后端判成冲突。统一让 5mm 以内的贴线情况都算放得下，两边结论一致。
 */
const COLLIDE_TOL = 0.005;

export interface Footprint {
  width: number;
  depth: number;
  posX: number;
  posZ: number;
  rotation: number;
}

/** 旋转后的轴向包围盒半宽/半深 */
export function halfExtents(p: Pick<Footprint, 'width' | 'depth' | 'rotation'>) {
  const r = (p.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return {
    hx: (p.width * c + p.depth * s) / 2,
    hz: (p.width * s + p.depth * c) / 2,
  };
}

export function conflicts(a: Footprint, b: Footprint) {
  const ea = halfExtents(a);
  const eb = halfExtents(b);
  return (
    Math.abs(a.posX - b.posX) < ea.hx + eb.hx + GAP_X - COLLIDE_TOL &&
    Math.abs(a.posZ - b.posZ) < ea.hz + eb.hz + GAP_Z - COLLIDE_TOL
  );
}

/**
 * 在候选位置落一个书架，与该馆已存在的书架逐一做间距校验；
 * 冲突则抛 400，消息里带上挡住它的是哪个架 —— 「落不了位就存不进去」。
 */
export function assertFits(candidate: Footprint, others: (Footprint & { code: string })[]) {
  for (const o of others) {
    if (conflicts(candidate, o)) {
      throw new BadRequestException(
        `位置放不下：与书架 ${o.code} 的间距不足（侧向需 ≥${GAP_X}m / 走道需 ≥${GAP_Z}m）`,
      );
    }
  }
}
