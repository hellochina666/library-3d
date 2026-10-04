import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LibrariesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.library.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { shelves: true } } },
    });
  }

  async create(name: string) {
    const n = String(name ?? '').trim();
    if (!n) throw new BadRequestException('图书馆名称必填');
    try {
      return await this.prisma.library.create({ data: { name: n } });
    } catch {
      throw new BadRequestException(`图书馆「${n}」已存在`);
    }
  }

  async rename(id: number, name: string) {
    await this.ensure(id);
    const n = String(name ?? '').trim();
    if (!n) throw new BadRequestException('图书馆名称必填');
    try {
      return await this.prisma.library.update({ where: { id }, data: { name: n } });
    } catch {
      throw new BadRequestException(`图书馆「${n}」已存在`);
    }
  }

  /** 删除图书馆：书架/层/藏书沿外键级联删除 */
  async remove(id: number) {
    await this.ensure(id);
    return this.prisma.library.delete({ where: { id } });
  }

  async ensure(id: number) {
    const lib = await this.prisma.library.findUnique({ where: { id } });
    if (!lib) throw new NotFoundException(`图书馆 #${id} 不存在`);
    return lib;
  }
}
