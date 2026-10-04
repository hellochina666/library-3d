import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
}
