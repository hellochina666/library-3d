import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { ShelvesModule } from './shelves/shelves.module';
import { BooksModule } from './books/books.module';
import { LibrariesModule } from './libraries/libraries.module';

@Module({
  imports: [PrismaModule, ShelvesModule, BooksModule, LibrariesModule],
})
export class AppModule {}
