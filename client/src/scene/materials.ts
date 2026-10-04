import * as THREE from 'three';

/**
 * 程序化 Canvas 纹理：木饰面 / 地板 / 墙面 / 书页 / 布面书封 / 地毯。
 * 全部用代码绘制并缓存，不依赖任何外部图片资源。
 */

const cache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, build: () => HTMLCanvasElement, repeat: [number, number]) {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(build());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c.getContext('2d')!;
}

/** 可复现随机数（同一本书每次渲染样子不变） */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 木纹：底色 + 密集长短纹 + 少量深色节疤 */
function paintWood(size: number, base: string, streak: string, knot: string, seed: number) {
  const ctx = canvas(size);
  const rnd = seededRandom(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * 1.4; i++) {
    const y = rnd() * size;
    const alpha = 0.03 + rnd() * 0.08;
    const w = 0.6 + rnd() * 2.4;
    ctx.strokeStyle = streak;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // 波纹：用两段正弦错开的曲线模拟天然木纹的起伏
    const amp = 1 + rnd() * 4;
    const freq = 0.004 + rnd() * 0.01;
    const phase = rnd() * 6.28;
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    }
    ctx.stroke();
  }

  // 节疤
  for (let i = 0; i < 3; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 6 + rnd() * 14;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, knot);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, rnd() * 3.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return ctx.canvas;
}

/** 书架用木料：warm=暖橡木 / dark=胡桃木 */
export function woodTexture(kind: 'warm' | 'dark') {
  const cfg =
    kind === 'warm'
      ? { base: '#a97a4e', streak: '#7c5230', knot: 'rgba(60,38,18,0.9)', seed: 7 }
      : { base: '#5d3f2a', streak: '#3c2717', knot: 'rgba(24,14,6,0.9)', seed: 21 };
  return cached(
    `wood-${kind}`,
    () => paintWood(512, cfg.base, cfg.streak, cfg.knot, cfg.seed),
    [1.5, 1.5],
  );
}

/** 地板：横向长条板，逐板色差 + 板缝 + 沿板纹理 */
export function floorTexture() {
  return cached('floor', () => {
    const size = 1024;
    const ctx = canvas(size);
    const rnd = seededRandom(99);
    const rows = 8;
    const rowH = size / rows;
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const shade = 0.78 + rnd() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(122 * shade)},${Math.round(84 * shade)},${Math.round(52 * shade)})`;
      ctx.fillRect(0, r * rowH, size, rowH);
      // 每块板内部的细纹
      for (let i = 0; i < 90; i++) {
        const y = r * rowH + rnd() * rowH;
        ctx.strokeStyle = rnd() > 0.5 ? 'rgba(46,28,14,0.18)' : 'rgba(190,140,90,0.10)';
        ctx.lineWidth = 0.6 + rnd() * 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.008 + rnd() * 6) * 1.5);
        ctx.stroke();
      }
      // 板缝
      ctx.fillStyle = 'rgba(20,10,4,0.55)';
      ctx.fillRect(0, r * rowH, size, 2);
      // 纵向拼缝（错开）
      const seam = ((r * 0.37 + rnd() * 0.2) % 1) * size;
      ctx.fillRect(seam, r * rowH, 2, rowH);
    }
    return ctx.canvas;
  }, [3, 3]);
}

/** 墙面：暖色乳胶漆，细腻批刮痕迹 */
export function wallTexture() {
  return cached('wall', () => {
    const size = 512;
    const ctx = canvas(size);
    const rnd = seededRandom(45);
    ctx.fillStyle = '#c9b18f';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,240,215,0.05)' : 'rgba(96,72,48,0.05)';
      ctx.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    return ctx.canvas;
  }, [2, 1]);
}

/** 布面书封：接近白的细密织纹，配合 material.color 染色 */
export function clothTexture() {
  return cached('cloth', () => {
    const size = 128;
    const ctx = canvas(size);
    ctx.fillStyle = '#f2efe9';
    ctx.fillRect(0, 0, size, size);
    const rnd = seededRandom(33);
    for (let i = 0; i < 1400; i++) {
      const v = 210 + Math.floor(rnd() * 45);
      ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},0.5)`;
      ctx.fillRect(rnd() * size, rnd() * size, 1.5, 1);
    }
    return ctx.canvas;
  }, [1, 1]);
}

/** 书页侧面：米黄纸张的细密页线 */
export function paperTexture() {
  return cached('paper', () => {
    const size = 64;
    const ctx = canvas(size);
    ctx.fillStyle = '#e8dcc2';
    ctx.fillRect(0, 0, size, size);
    const rnd = seededRandom(12);
    for (let x = 0; x < size; x += 1) {
      const v = 0.5 + rnd() * 0.5;
      ctx.strokeStyle = `rgba(150,128,92,${0.25 * v})`;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, size);
      ctx.stroke();
    }
    return ctx.canvas;
  }, [1, 1]);
}

/** 地毯：深酒红 + 边框与菱形纹 */
export function rugTexture() {
  return cached('rug', () => {
    const size = 512;
    const ctx = canvas(size);
    ctx.fillStyle = '#5c2b25';
    ctx.fillRect(0, 0, size, size);
    const rnd = seededRandom(77);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,220,190,0.03)' : 'rgba(20,8,6,0.05)';
      ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
    }
    ctx.strokeStyle = '#c8a15c';
    ctx.lineWidth = 8;
    ctx.strokeRect(26, 26, size - 52, size - 52);
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, size - 88, size - 88);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const cx = 90 + i * 47;
        const cy = 90 + j * 47;
        ctx.strokeStyle = 'rgba(200,161,92,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10);
        ctx.lineTo(cx + 10, cy);
        ctx.lineTo(cx, cy + 10);
        ctx.lineTo(cx - 10, cy);
        ctx.closePath();
        ctx.stroke();
      }
    }
    return ctx.canvas;
  }, [1, 1]);
}

/**
 * 书封自然色系：由书名哈希出稳定的莫兰迪/复古布面色，
 * 低饱和、中低明度，避免高饱和卡通色。
 */
export function coverColor(title: string): THREE.Color {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const hue = (h % 360) / 360;
  const sat = 0.22 + ((h >> 8) % 100) / 100 * 0.2; // 0.22 ~ 0.42
  const lit = 0.26 + ((h >> 16) % 100) / 100 * 0.2; // 0.26 ~ 0.46
  return new THREE.Color().setHSL(hue, sat, lit);
}
