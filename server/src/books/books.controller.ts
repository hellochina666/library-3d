import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { BooksService } from './books.service';

@Controller('books')
export class BooksController {
  constructor(private readonly service: BooksService) {}

  /**
   * GET /books?q=明朝  —— 搜索，返回带定位信息（供 3D 高亮）
   * GET /books?layerId=3 —— 列出某层所有书
   * GET /books?libraryId=2 —— 只看某个图书馆的书
   */
  @Get()
  findAll(@Query('q') q?: string, @Query('layerId') layerId?: string, @Query('libraryId') libraryId?: string) {
    return this.service.search(q, layerId ? Number(layerId) : undefined, libraryId ? Number(libraryId) : undefined);
  }

  /** POST /books —— 新增书籍，body 必须含 shelfId / layerId / slotIndex */
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  /** PUT /books/:id —— 移动书籍（改层/槽位）或改书目信息 */
  @Put(':id')
  move(@Param('id') id: string, @Body() body: any) {
    return this.service.move(Number(id), body);
  }

  /** GET /books/:id */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const list = await this.service.search(undefined, undefined);
    const found = list.find((b) => b.id === Number(id));
    return found ?? null;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
