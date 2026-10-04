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

function canvas(size: number, height?: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = height ?? size;
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

/** 书架用木料：warm=浅暖橡木（现代简约主材）/ dark=深胡桃木（点缀） */
export function woodTexture(kind: 'warm' | 'dark') {
  const cfg =
    kind === 'warm'
      ? { base: '#c69a63', streak: '#a1784a', knot: 'rgba(120,84,46,0.75)', seed: 7 }
      : { base: '#6d4f33', streak: '#4c3420', knot: 'rgba(34,20,10,0.85)', seed: 21 };
  return cached(
    `wood-${kind}`,
    () => paintWood(512, cfg.base, cfg.streak, cfg.knot, cfg.seed),
    [1.5, 1.5],
  );
}

/** 地板：浅暖橡木宽板，逐板色差 + 板缝 + 沿板纹理（现代简约） */
export function floorTexture() {
  return cached('floor', () => {
    const size = 1024;
    const ctx = canvas(size);
    const rnd = seededRandom(99);
    const rows = 7;
    const rowH = size / rows;
    ctx.fillStyle = '#c8a578';
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const shade = 0.86 + rnd() * 0.22;
      ctx.fillStyle = `rgb(${Math.round(206 * shade)},${Math.round(168 * shade)},${Math.round(122 * shade)})`;
      ctx.fillRect(0, r * rowH, size, rowH);
      // 每块板内部的细纹
      for (let i = 0; i < 90; i++) {
        const y = r * rowH + rnd() * rowH;
        ctx.strokeStyle = rnd() > 0.5 ? 'rgba(122,86,48,0.16)' : 'rgba(255,238,210,0.14)';
        ctx.lineWidth = 0.6 + rnd() * 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.008 + rnd() * 6) * 1.5);
        ctx.stroke();
      }
      // 板缝
      ctx.fillStyle = 'rgba(88,58,30,0.4)';
      ctx.fillRect(0, r * rowH, size, 2);
      // 纵向拼缝（错开）
      const seam = ((r * 0.37 + rnd() * 0.2) % 1) * size;
      ctx.fillRect(seam, r * rowH, 2, rowH);
    }
    return ctx.canvas;
  }, [3, 3]);
}

/** 墙面：奶油白乳胶漆，细腻批刮痕迹（温馨现代） */
export function wallTexture() {
  return cached('wall', () => {
    const size = 512;
    const ctx = canvas(size);
    const rnd = seededRandom(45);
    ctx.fillStyle = '#efe4d2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,248,235,0.06)' : 'rgba(160,134,102,0.05)';
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

/** 地毯：奶油底 + 陶土色几何边框（现代简约） */
export function rugTexture() {
  return cached('rug', () => {
    const size = 512;
    const ctx = canvas(size);
    ctx.fillStyle = '#e5d7c0';
    ctx.fillRect(0, 0, size, size);
    const rnd = seededRandom(77);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,246,230,0.05)' : 'rgba(120,92,60,0.04)';
      ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
    }
    // 外圈陶土色宽边 + 内细线
    ctx.strokeStyle = '#c4795a';
    ctx.lineWidth = 14;
    ctx.strokeRect(20, 20, size - 40, size - 40);
    ctx.strokeStyle = 'rgba(196,121,90,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, size - 96, size - 96);
    // 中央几条断续的沙色横线，低调不抢书架
    for (let i = 0; i < 4; i++) {
      const y = 150 + i * 70;
      ctx.strokeStyle = 'rgba(178,142,100,0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(120, y);
      ctx.lineTo(size - 120, y);
      ctx.stroke();
    }
    return ctx.canvas;
  }, [1, 1]);
}

/**
 * 挂画画面：暖色 boho-minimal 抽象画（米白底 + 陶土/赭石/鼠尾草色块与线条）。
 * variant 0..2 三种构图，配合画框与留白卡纸使用。
 */
export function artTexture(variant: number) {
  return cached(`art-${variant}`, () => {
    const W = 512;
    const H = 640;
    const ctx = canvas(W, H);
    const rnd = seededRandom(300 + variant * 17);
    ctx.fillStyle = '#f6efe2';
    ctx.fillRect(0, 0, W, H);
    // 纸张细噪点
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(210,190,160,0.05)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
    }

    if (variant === 0) {
      // 升起的太阳：陶土色大圆弧 + 赭石细线地平
      const g = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.72);
      g.addColorStop(0, '#d98d63');
      g.addColorStop(1, '#c96f4a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.46, W * 0.26, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3e342a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(W * 0.14, H * 0.46);
      ctx.lineTo(W * 0.86, H * 0.46);
      ctx.stroke();
      ctx.fillStyle = '#e8d9bd';
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.46, W * 0.26, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a5764f';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const y = H * 0.52 + i * 26;
        ctx.beginPath();
        ctx.moveTo(W * 0.2, y);
        ctx.lineTo(W * 0.8 - i * 18, y);
        ctx.stroke();
      }
    } else if (variant === 1) {
      // 三座柔和山丘：鼠尾草绿 / 橄榄 / 沙色
      const hills: [string, number, number][] = [
        ['#a9b39a', 0.62, 0.34],
        ['#8a9b7c', 0.72, 0.26],
        ['#d9b98a', 0.82, 0.2],
      ];
      for (const [col, base, amp] of hills) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-20, H);
        ctx.lineTo(-20, H * base);
        ctx.quadraticCurveTo(W * 0.5, H * (base - amp), W + 20, H * base);
        ctx.lineTo(W + 20, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#3e342a';
      ctx.beginPath();
      ctx.arc(W * 0.72, H * 0.2, W * 0.055, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 干枝与陶罐：极简静物线条
      ctx.strokeStyle = '#8a5a3b';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.78);
      ctx.quadraticCurveTo(W * 0.46, H * 0.5, W * 0.56, H * 0.24);
      ctx.stroke();
      ctx.lineWidth = 6;
      for (const [dx, dy] of [[-0.1, -0.14], [0.07, -0.1], [-0.05, -0.08]] as const) {
        ctx.beginPath();
        ctx.moveTo(W * 0.5, H * 0.55);
        ctx.quadraticCurveTo(W * (0.5 + dx), H * (0.42 + dy), W * (0.5 + dx * 1.9), H * (0.36 + dy * 1.4));
        ctx.stroke();
      }
      ctx.fillStyle = '#c4795a';
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * 0.82, W * 0.11, H * 0.045, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillRect(W * 0.39, H * 0.72, W * 0.22, H * 0.1);
      ctx.fillStyle = '#f6efe2';
      ctx.fillRect(W * 0.39, H * 0.715, W * 0.22, 8);
    }
    return ctx.canvas;
  }, [1, 1]);
}

/**
 * 书架顶三角形导视牌的牌面：奶油亚克力底 + 深棕书号，命中高亮时换琥珀底。
 * 正反两块斜面各贴一张，从两侧看文字都是正的。
 */
export function signTexture(code: string, sub: string, hi: boolean) {
  return cached(`sign-${code}|${sub}|${hi ? 1 : 0}`, () => {
    const W = 512;
    const H = 192;
    const ctx = canvas(W, H);
    ctx.fillStyle = hi ? '#ffd166' : '#faf3e6';
    ctx.fillRect(0, 0, W, H);
    // 边框与角标
    ctx.strokeStyle = hi ? '#8a5a00' : '#b9986a';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = hi ? '#5c3a00' : '#4a3b2c';
    ctx.font = '700 88px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, W / 2, H * 0.42);
    ctx.font = '500 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = hi ? '#7a4e00' : '#8a7458';
    ctx.fillText(sub, W / 2, H * 0.76);
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
