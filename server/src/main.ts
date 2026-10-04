import { existsSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true });

  // 生产模式：同一个端口同时提供「前端静态资源」与「API」，方便单端口部署
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.useStaticAssets(publicDir);
    console.log(`[library-3d] 静态资源目录: ${publicDir}`);
  }

  // 必须监听 PORT 且绑定 0.0.0.0，才能被部署平台访问到
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`[library-3d] 服务已启动: http://localhost:${port}`);
}
bootstrap();
