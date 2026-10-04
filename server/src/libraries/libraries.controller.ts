import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { LibrariesService } from './libraries.service';

@Controller('libraries')
export class LibrariesController {
  constructor(private readonly service: LibrariesService) {}

  /** GET /libraries —— 图书馆列表（含书架数） */
  @Get()
  list() {
    return this.service.list();
  }

  /** POST /libraries —— 新建图书馆 { name } */
  @Post()
  create(@Body() body: any) {
    return this.service.create(body?.name);
  }

  /** PUT /libraries/:id —— 重命名 { name } */
  @Put(':id')
  rename(@Param('id') id: string, @Body() body: any) {
    return this.service.rename(Number(id), body?.name);
  }

  /** DELETE /libraries/:id —— 删除（连带全部书架与藏书） */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
