import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface CreateBookDto {
  title: string;
  isbn?: string;
  author?: string;
  shelfId: number;
  layerId: number;
  slotIndex: number;
}

@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService) {}

  /**
   * 搜索书籍 —— 命中后返回定位三要素，前端据此高亮 3D 模型。
   * 注意：SQLite 下 contains 区分大小写（中文不受影响）。
   * 若切到 PostgreSQL，可加 mode: 'insensitive' 实现英文忽略大小写。
   */
  async search(q?: string, layerId?: number, libraryId?: number) {
    const where: any = {};
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { isbn: { contains: q } },
        { author: { contains: q } },
      ];
    }
    if (layerId) where.layerId = Number(layerId);
    if (libraryId) where.shelf = { libraryId: Number(libraryId) };

    const books = await this.prisma.book.findMany({
      where,
      orderBy: [{ shelfId: 'asc' }, { slotIndex: 'asc' }],
      include: {
        shelf: { select: { id: true, code: true, posX: true, posZ: true, rotation: true, zone: true } },
        layer: { select: { id: true, layerIndex: true, shelfId: true } },
      },
      take: 200,
    });

    return books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      slotIndex: b.slotIndex,
      // 高亮所需坐标
      shelfId: b.shelfId,
      shelfCode: b.shelf.code,
      layerId: b.layerId,
      layerIndex: b.layer.layerIndex,
      zone: b.shelf.zone,
    }));
  }

  /**
   * 新增书籍 —— 强制落位到 架子 + 层 + 槽位。
   * 这里是「新建必须设定哪个架子哪一层」的强校验落点。
   */
  async create(dto: CreateBookDto) {
    if (!dto?.title) throw new BadRequestException('书名 title 必填');

    const shelfId = Number(dto.shelfId);
    const layerId = Number(dto.layerId);
    const slotIndex = Number(dto.slotIndex);

    if (!Number.isInteger(shelfId)) throw new BadRequestException('必须指定 shelfId（哪个架子）');
    if (!Number.isInteger(layerId)) throw new BadRequestException('必须指定 layerId（哪一层）');
    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      throw new BadRequestException('slotIndex 必须是 >= 0 的整数（层内第几个槽位）');
    }

    // 校验层存在
    const layer = await this.prisma.layer.findUnique({
      where: { id: layerId },
      include: { shelf: { include: { type: true } } },
    });
    if (!layer) throw new NotFoundException(`层 #${layerId} 不存在`);

    // 校验层确实属于该书架（防止架子与层对不上）
    if (layer.shelfId !== shelfId) {
      throw new BadRequestException(
        `层 #${layerId} 不属于书架 #${shelfId}（它属于 #${layer.shelfId}）`,
      );
    }

    // 校验槽位在容量范围内
    const capacity = layer.capacity ?? layer.shelf.type.slotsPerLayer;
    if (slotIndex >= capacity) {
      throw new BadRequestException(
        `槽位越界：书架 ${layer.shelf.code} 第 ${layer.layerIndex} 层容量为 ${capacity}，无法放在第 ${slotIndex} 位`,
      );
    }

    // 校验槽位未被占用
    const taken = await this.prisma.book.findUnique({
      where: { layerId_slotIndex: { layerId, slotIndex } },
    });
    if (taken) {
      throw new BadRequestException(
        `槽位已被占用：${layer.shelf.code} 第 ${layer.layerIndex} 层第 ${slotIndex} 位已有《${taken.title}》`,
      );
    }

    return this.prisma.book.create({
      data: {
        title: dto.title,
        author: dto.author ?? null,
        isbn: dto.isbn ?? null,
        shelfId,
        layerId,
        slotIndex,
      },
    });
  }

  /**
   * 移动 / 编辑书籍：把书挪到别的层、别的槽位，或改书目信息。
   * 挪位同样要过容量与占用校验 —— 现实中书不可能凭空叠在同一格。
   */
  async move(
    id: number,
    dto: { layerId?: number; slotIndex?: number; title?: string; author?: string; isbn?: string },
  ) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException(`书籍 #${id} 不存在`);

    const targetLayerId = dto.layerId != null ? Number(dto.layerId) : book.layerId;
    const targetSlot = dto.slotIndex != null ? Number(dto.slotIndex) : book.slotIndex;

    if (dto.slotIndex != null && (!Number.isInteger(targetSlot) || targetSlot < 0)) {
      throw new BadRequestException('slotIndex 必须是 >= 0 的整数');
    }

    const layer = await this.prisma.layer.findUnique({
      where: { id: targetLayerId },
      include: { shelf: { include: { type: true } } },
    });
    if (!layer) throw new NotFoundException(`目标层 #${targetLayerId} 不存在`);

    const capacity = layer.capacity ?? layer.shelf.type.slotsPerLayer;
    if (targetSlot >= capacity) {
      throw new BadRequestException(
        `槽位越界：${layer.shelf.code} 第 ${layer.layerIndex} 层容量为 ${capacity}`,
      );
    }

    // 目标槽位是否已被别的书占用（自己原来占的不算冲突）
    const taken = await this.prisma.book.findUnique({
      where: { layerId_slotIndex: { layerId: targetLayerId, slotIndex: targetSlot } },
    });
    if (taken && taken.id !== id) {
      throw new BadRequestException(
        `槽位已被占用：${layer.shelf.code} 第 ${layer.layerIndex} 层第 ${targetSlot} 位已有《${taken.title}》`,
      );
    }

    return this.prisma.book.update({
      where: { id },
      data: {
        layerId: targetLayerId,
        // 书架跟着层走，避免层与架子对不上
        shelfId: layer.shelfId,
        slotIndex: targetSlot,
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(dto.author != null ? { author: dto.author } : {}),
        ...(dto.isbn != null ? { isbn: dto.isbn } : {}),
      },
    });
  }

  async remove(id: number) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException(`书籍 #${id} 不存在`);
    return this.prisma.book.delete({ where: { id } });
  }

  /** 某层的全部书籍（用于点击 3D 层反查，及前端计算空余槽位） */
  findByLayer(layerId: number) {
    return this.prisma.book.findMany({
      where: { layerId: Number(layerId) },
      orderBy: { slotIndex: 'asc' },
    });
  }
}
