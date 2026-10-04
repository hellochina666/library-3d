import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** 全局模块：让 ShelvesModule / BooksModule 都能注入 PrismaService */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
