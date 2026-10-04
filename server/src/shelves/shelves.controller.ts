import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ShelvesService } from './shelves.service';

@Controller('shelves')
export class ShelvesController {
  constructor(private readonly service: ShelvesService) {}

  /** GET /shelves?libraryId=2 —— 3D 场景渲染所需的完整布局数据（按馆） */
  @Get()
  findAll(@Query('libraryId') libraryId?: string) {
    return this.service.findAll(libraryId ? Number(libraryId) : undefined);
  }

  /**
   * GET /shelves/types —— 书架型号（决定层数）
   * 注意：必须声明在 :id 之前，否则会被 /shelves/:id 抢先匹配
   */
  @Get('types')
  findTypes() {
    return this.service.findTypes();
  }

  /** GET /shelves/:id —— 单个书架详情（含每层藏书） */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  /** POST /shelves/types —— 新增型号 */
  @Post('types')
  createType(@Body() body: any) {
    return this.service.createType(body);
  }

  /**
   * POST /shelves/layout —— 表格批量生成图书馆布局（三期）
   * 必须声明在 POST /shelves 之前没有静态段冲突，但为清晰起见放在 create 旁边；
   * 路由是精确匹配 /shelves/layout，不会被 /shelves/:id 之类的 GET 影响。
   */
  @Post('layout')
  applyLayout(@Body() body: any) {
    return this.service.applyLayout(body);
  }

  /** POST /shelves —— 新增实体书架，自动按型号生成层 */
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  /** PUT /shelves/:id —— 调整书架编号 / 物理位置 / 朝向 / 区域 */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(Number(id), body);
  }

  /** DELETE /shelves/types/:id —— 删除型号（必须声明在 :id 之前） */
  @Delete('types/:id')
  removeType(@Param('id') id: string) {
    return this.service.removeType(Number(id));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
