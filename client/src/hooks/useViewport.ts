import { useEffect, useState } from 'react';

export type Tier = 'phone' | 'tablet' | 'desktop';

/**
 * 断点用 matchMedia 而不是 resize 监听：只在跨断点时回调一次，
 * 不会每帧触发 React 重渲染（重渲染会让 3D 场景整体重建 props）。
 */
const QUERIES: [Tier, string][] = [
  ['phone', '(max-width: 700px)'],
  ['tablet', '(max-width: 1024px)'],
];

function readTier(): Tier {
  if (window.matchMedia(QUERIES[0][1]).matches) return 'phone';
  if (window.matchMedia(QUERIES[1][1]).matches) return 'tablet';
  return 'desktop';
}

export function useTier(): Tier {
  const [tier, setTier] = useState(readTier);

  useEffect(() => {
    const mqls = QUERIES.map(([, q]) => window.matchMedia(q));
    const onChange = () => setTier(readTier());
    mqls.forEach((m) => m.addEventListener('change', onChange));
    return () => mqls.forEach((m) => m.removeEventListener('change', onChange));
  }, []);

  return tier;
}

/** 触屏设备：3D 交互提示与画质档位都按它区分 */
export function isCoarsePointer() {
  return window.matchMedia('(pointer: coarse)').matches;
}
