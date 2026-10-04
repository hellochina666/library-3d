import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 型号：现实中不同书架层数不同 */
const TYPES = [
  { name: '标准五层架', layerCount: 5, layerHeight: 0.34, width: 1.0, depth: 0.32, slotsPerLayer: 30 },
  { name: '高七层架', layerCount: 7, layerHeight: 0.30, width: 1.0, depth: 0.32, slotsPerLayer: 30 },
  { name: '矮三层期刊架', layerCount: 3, layerHeight: 0.42, width: 1.2, depth: 0.36, slotsPerLayer: 24 },
];

/** 实体书架：posX/posZ/rotation 就是 3D 场景里的真实摆放坐标 */
const SHELVES = [
  { code: 'A-01', type: '标准五层架', posX: 0, posZ: 0, rotation: 0, zone: '一楼 文学区' },
  { code: 'A-02', type: '高七层架', posX: 1.4, posZ: 0, rotation: 0, zone: '一楼 文学区' },
  { code: 'A-03', type: '矮三层期刊架', posX: 2.8, posZ: 0, rotation: 0, zone: '一楼 文学区' },
  { code: 'B-01', type: '矮三层期刊架', posX: 0, posZ: 2.6, rotation: 180, zone: '一楼 科技区' },
  { code: 'B-02', type: '标准五层架', posX: 1.4, posZ: 2.6, rotation: 180, zone: '一楼 科技区' },
  { code: 'B-03', type: '高七层架', posX: 2.8, posZ: 2.6, rotation: 180, zone: '一楼 科技区' },
];

/** 已上架的书籍：明确落在「哪个架子 + 哪一层 + 第几个槽位」 */
const BOOKS = [
  { shelf: 'A-01', layer: 1, slot: 0, title: '红楼梦', author: '曹雪芹', isbn: '9787020002207' },
  { shelf: 'A-01', layer: 1, slot: 1, title: '三国演义', author: '罗贯中', isbn: '9787020002208' },
  { shelf: 'A-01', layer: 1, slot: 2, title: '水浒传', author: '施耐庵', isbn: '9787020002209' },
  { shelf: 'A-01', layer: 3, slot: 0, title: '百年孤独', author: '加西亚·马尔克斯', isbn: '9787544253994' },
  { shelf: 'A-01', layer: 5, slot: 4, title: '活着', author: '余华', isbn: '9787506365437' },

  { shelf: 'A-02', layer: 2, slot: 0, title: '万历十五年', author: '黄仁宇', isbn: '9787101055498' },
  { shelf: 'A-02', layer: 4, slot: 1, title: '明朝那些事儿', author: '当年明月', isbn: '9787801655776' },
  { shelf: 'A-02', layer: 7, slot: 0, title: '人类简史', author: '尤瓦尔·赫拉利', isbn: '9787508647357' },

  { shelf: 'A-03', layer: 1, slot: 0, title: '国家地理 2024.03', author: '杂志', isbn: 'NG-2024-03' },
  { shelf: 'A-03', layer: 2, slot: 3, title: '三联生活周刊', author: '杂志', isbn: 'SL-2024-11' },

  { shelf: 'B-01', layer: 1, slot: 0, title: '计算机程序设计艺术', author: 'Donald Knuth', isbn: '9787111127132' },
  { shelf: 'B-01', layer: 3, slot: 2, title: '深入理解计算机系统', author: 'Bryant', isbn: '9787111544938' },

  { shelf: 'B-02', layer: 2, slot: 0, title: '算法导论', author: 'Cormen', isbn: '9787111407010' },
  { shelf: 'B-02', layer: 2, slot: 1, title: '设计模式', author: 'GoF', isbn: '9787111633627' },
  { shelf: 'B-02', layer: 5, slot: 0, title: '重构：改善既有代码的设计', author: 'Martin Fowler', isbn: '9787115213631' },

  { shelf: 'B-03', layer: 1, slot: 0, title: '三体', author: '刘慈欣', isbn: '9787536692930' },
  { shelf: 'B-03', layer: 6, slot: 5, title: '球状闪电', author: '刘慈欣', isbn: '9787536693962' },
];

async function main() {
  console.log('开始写入种子数据...');

  // 1) 型号
  const typeMap = new Map<string, number>();
  for (const t of TYPES) {
    const row = await prisma.shelfType.upsert({
      where: { name: t.name },
      update: t,
      create: t,
    });
    typeMap.set(t.name, row.id);
  }

  // 2) 书架 + 自动按型号展开层
  const shelfMap = new Map<string, { id: number; layers: Map<number, number> }>();
  for (const s of SHELVES) {
    const typeId = typeMap.get(s.type)!;
    const type = await prisma.shelfType.findUnique({ where: { id: typeId } });

    const shelf = await prisma.shelf.upsert({
      where: { code: s.code },
      update: { typeId, posX: s.posX, posZ: s.posZ, rotation: s.rotation, zone: s.zone },
      create: { code: s.code, typeId, posX: s.posX, posZ: s.posZ, rotation: s.rotation, zone: s.zone },
    });

    const layerIds = new Map<number, number>();
    for (let i = 1; i <= type!.layerCount; i++) {
      const layer = await prisma.layer.upsert({
        where: { shelfId_layerIndex: { shelfId: shelf.id, layerIndex: i } },
        update: { capacity: type!.slotsPerLayer },
        create: { shelfId: shelf.id, layerIndex: i, capacity: type!.slotsPerLayer },
      });
      layerIds.set(i, layer.id);
    }
    shelfMap.set(s.code, { id: shelf.id, layers: layerIds });
  }

  // 3) 书籍落位
  let count = 0;
  for (const b of BOOKS) {
    const shelf = shelfMap.get(b.shelf)!;
    const layerId = shelf.layers.get(b.layer)!;
    const existing = await prisma.book.findUnique({
      where: { layerId_slotIndex: { layerId, slotIndex: b.slot } },
    });
    if (existing) {
      await prisma.book.update({
        where: { id: existing.id },
        data: { title: b.title, author: b.author, isbn: b.isbn },
      });
    } else {
      await prisma.book.create({
        data: {
          title: b.title,
          author: b.author,
          isbn: b.isbn,
          shelfId: shelf.id,
          layerId,
          slotIndex: b.slot,
        },
      });
    }
    count++;
  }

  console.log(`✅ 种子数据完成：${TYPES.length} 个型号 / ${SHELVES.length} 个书架 / ${count} 本书`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
