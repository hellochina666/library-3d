import { Module } from '@nestjs/common';
import { ShelvesController } from './shelves.controller';
import { ShelvesService } from './shelves.service';

@Module({
  controllers: [ShelvesController],
  providers: [ShelvesService],
  exports: [ShelvesService],
})
export class ShelvesModule {}
