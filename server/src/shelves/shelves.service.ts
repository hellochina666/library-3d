import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ShelfType } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface CreateShelfTypeDto {
  name: string;
  layerCount: number;
  layerHeight?: number;
  width?: number;
  depth?: number;
  slotsPerLayer?: number;
}

export interface CreateShelfDto {
  code: string;
  typeId: number;
  posX?: number;
  posZ?: number;
  rotation?: number;
  zone?: string;
}

/** 表格生成布局：一个格子 = 一个书架 */
export interface LayoutItemDto {
  /** 书架编号，如 A-01 */
  code: string;
  /** 层数（决定用哪个型号） */
  layerCount: number;
  /** 行号（0 起，从前往后 → posZ） */
  row: number;
  /** 列号（0 起，从左往右 → posX） */
  col: number;
}

export interface ApplyLayoutDto {
  /** 是否先清空现有全部书架（连带书）。默认 true —— 表格代表图书馆全貌 */
  clear?: boolean;
  /** 同排相邻书架间隙（米），默认 0.5 */
  colGap?: number;
  /** 排与排之间走道宽度（米），默认 1.2 */
  rowGap?: number;
  items: LayoutItemDto[];
}

@Injectable()
export class ShelvesService {
  constructor(private prisma: PrismaService) {}

  /** 书架型号列表 */
  findTypes() {
    return this.prisma.shelfType.findMany({ orderBy: { id: 'asc' } });
  }

  createType(dto: CreateShelfTypeDto) {
    if (!dto?.name) throw new BadRequestException('型号名称必填');
    const layerCount = Number(dto.layerCount);
    if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 20) {
      throw new BadRequestException('layerCount 必须是 1~20 的整数');
    }
    return this.prisma.shelfType.create({
      data: {
        name: dto.name,
        layerCount,
        layerHeight: dto.layerHeight ?? 0.34,
        width: dto.width ?? 1.0,
        depth: dto.depth ?? 0.32,
        slotsPerLayer: dto.slotsPerLayer ?? 40,
      },
    });
  }

  /**
   * 书架树：书架 + 型号 + 各层（含该层藏书数）
   * 前端 3D 场景完全靠这份数据程序化渲染。
   */
  findAll() {
    return this.prisma.shelf.findMany({
      orderBy: { code: 'asc' },
      include: {
        type: true,
        layers: {
          orderBy: { layerIndex: 'asc' },
          include: { _count: { select: { books: true } } },
        },
        _count: { select: { books: true } },
      },
    });
  }

  async findOne(id: number) {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id },
      include: {
        type: true,
        layers: {
          orderBy: { layerIndex: 'asc' },
          include: { books: true },
        },
      },
    });
    if (!shelf) throw new NotFoundException(`书架 #${id} 不存在`);
    return shelf;
  }

  /**
   * 新增书架：按型号的 layerCount 自动展开生成对应的层。
   * 这样「每个书架层数不同」在数据层就得到保证。
   */
  async create(dto: CreateShelfDto) {
    if (!dto?.code) throw new BadRequestException('书架编号 code 必填');
    const typeId = Number(dto.typeId);
    if (!Number.isInteger(typeId)) throw new BadRequestException('typeId 必须是整数');

    const type = await this.prisma.shelfType.findUnique({ where: { id: typeId } });
    if (!type) throw new NotFoundException(`书架型号 #${typeId} 不存在`);

    const exists = await this.prisma.shelf.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException(`书架编号 ${dto.code} 已存在`);

    return this.prisma.shelf.create({
      data: {
        code: dto.code,
        typeId,
        posX: dto.posX ?? 0,
        posZ: dto.posZ ?? 0,
        rotation: dto.rotation ?? 0,
        zone: dto.zone ?? null,
        // 自动按层数展开
        layers: {
          create: Array.from({ length: type.layerCount }, (_, i) => ({
            layerIndex: i + 1,
            capacity: type.slotsPerLayer,
          })),
        },
      },
      include: { type: true, layers: true },
    });
  }

  /** 调整书架：编号 / 物理位置 / 朝向 / 区域（现实中挪了架子就改这里） */
  async update(
    id: number,
    dto: { code?: string; posX?: number; posZ?: number; rotation?: number; zone?: string },
  ) {
    const current = await this.findOne(id);
    const data: any = {};

    if (dto.code != null && dto.code !== current.code) {
      const dup = await this.prisma.shelf.findUnique({ where: { code: dto.code } });
      if (dup) throw new BadRequestException(`书架编号 ${dto.code} 已存在`);
      data.code = dto.code;
    }
    if (dto.posX != null) data.posX = Number(dto.posX);
    if (dto.posZ != null) data.posZ = Number(dto.posZ);
    if (dto.rotation != null) data.rotation = Number(dto.rotation);
    if (dto.zone !== undefined) data.zone = dto.zone || null;

    if (Object.keys(data).length === 0) return current;
    return this.prisma.shelf.update({
      where: { id },
      data,
      include: { type: true, layers: true },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.shelf.delete({ where: { id } });
  }

  /** 删除型号：必须没有任何书架在用，否则布局数据会对不上 */
  async removeType(id: number) {
    const type = await this.prisma.shelfType.findUnique({
      where: { id },
      include: { _count: { select: { shelves: true } } },
    });
    if (!type) throw new NotFoundException(`型号 #${id} 不存在`);
    if (type._count.shelves > 0) {
      throw new BadRequestException(
        `型号「${type.name}」下还有 ${type._count.shelves} 个书架在用，不能删除`,
      );
    }
    return this.prisma.shelfType.delete({ where: { id } });
  }

  /**
   * 按表格批量生成图书馆布局（三期：自定义生成 3D 图书馆）。
   *
   * 表格语义：row/col 代表地面网格，(row, col) 处有 item 就放一个书架，
   * 没有就是过道。坐标由后端按真实书架尺寸计算，保证不重叠、行列对齐。
   *
   * 型号策略：优先复用库里层数相同的型号；没有才自动创建「标准-N层」。
   */
  async applyLayout(dto: ApplyLayoutDto) {
    const items = dto?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items 不能为空：表格里至少要有一个书架');
    }

    // ---- 逐项校验 ----
    const seen = new Map<string, string>(); // code -> 位置描述
    let maxRow = 0;
    let maxCol = 0;
    for (const it of items) {
      const code = String(it?.code ?? '').trim();
      const layerCount = Number(it?.layerCount);
      const row = Number(it?.row);
      const col = Number(it?.col);
      if (!code) throw new BadRequestException('书架编号 code 不能为空');
      if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 20) {
        throw new BadRequestException(`「${code}」的层数必须是 1~20 的整数`);
      }
      if (!Number.isInteger(row) || row < 0 || row > 99 || !Number.isInteger(col) || col < 0 || col > 99) {
        throw new BadRequestException(`「${code}」的行/列号必须是 0~99 的整数`);
      }
      const at = `第${row + 1}排第${col + 1}列`;
      if (seen.has(code)) {
        throw new BadRequestException(`编号 ${code} 在表格里出现了两次（${seen.get(code)} 和 ${at}）`);
      }
      seen.set(code, at);
      if (row > maxRow) maxRow = row;
      if (col > maxCol) maxCol = col;
    }

    const colGap = Number.isFinite(Number(dto.colGap)) && Number(dto.colGap) >= 0 ? Number(dto.colGap) : 0.5;
    const rowGap = Number.isFinite(Number(dto.rowGap)) && Number(dto.rowGap) >= 0 ? Number(dto.rowGap) : 1.2;
    const clear = dto.clear !== false;

    // ---- 现有数据规模（用于返回统计）----
    const [oldShelves, oldBooks] = await Promise.all([
      this.prisma.shelf.count(),
      this.prisma.book.count(),
    ]);

    // ---- 按层数解析型号（复用优先，缺则自动建）----
    const layerCounts = [...new Set(items.map((it) => Number(it.layerCount)))].sort((a, b) => a - b);
    const typeByLayer = new Map<number, ShelfType>();
    for (const lc of layerCounts) {
      let type = await this.prisma.shelfType.findFirst({
        where: { layerCount: lc },
        orderBy: { id: 'asc' },
      });
      if (!type) {
        const name = `标准-${lc}层`;
        try {
          type = await this.prisma.shelfType.create({
            data: { name, layerCount: lc, layerHeight: 0.34, width: 1.0, depth: 0.32, slotsPerLayer: 40 },
          });
        } catch {
          // 并发或同名冲突兜底：按名字再取一次
          type = await this.prisma.shelfType.findUniqueOrThrow({ where: { name } });
        }
      }
      typeByLayer.set(lc, type);
    }

    // ---- 计算网格步长：取本批书架的最大宽/深，保证任何混排都不重叠 ----
    const usedTypes = items.map((it) => typeByLayer.get(Number(it.layerCount))!);
    const maxWidth = Math.max(...usedTypes.map((t) => t.width));
    const maxDepth = Math.max(...usedTypes.map((t) => t.depth));
    const stepX = maxWidth + colGap;
    const stepZ = maxDepth + rowGap;

    // ---- 事务：清旧 → 逐个建（书架 + 按型号自动展开层）----
    const created = await this.prisma.$transaction(async (tx) => {
      if (clear) {
        // Layer/Book 对 Shelf 是级联删除（schema onDelete: Cascade），deleteMany 一并清掉
        await tx.shelf.deleteMany({});
      }
      const list = [];
      for (const it of items) {
        const type = typeByLayer.get(Number(it.layerCount))!;
        const shelf = await tx.shelf.create({
          data: {
            code: String(it.code).trim(),
            typeId: type.id,
            posX: Number((it.col * stepX).toFixed(3)),
            posZ: Number((it.row * stepZ).toFixed(3)),
            rotation: 0,
            zone: `第${it.row + 1}排`,
            layers: {
              create: Array.from({ length: type.layerCount }, (_, i) => ({
                layerIndex: i + 1,
                capacity: type.slotsPerLayer,
              })),
            },
          },
          include: { type: true, layers: true },
        });
        list.push(shelf);
      }
      return list;
    });

    return {
      cleared: clear ? { shelves: oldShelves, books: oldBooks } : null,
      created: created.length,
      grid: { rows: maxRow + 1, cols: maxCol + 1, stepX, stepZ },
      typesUsed: [...typeByLayer.values()].map((t) => ({ id: t.id, name: t.name, layerCount: t.layerCount })),
      shelves: created,
    };
  }
}
