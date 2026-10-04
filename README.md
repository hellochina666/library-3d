# Library 3D · 三维图书管理系统

一个「**3D 场景与现实书架一一对应**」的图书管理系统。不是把书架画成装饰品，而是：

- 每个书架的**层数由型号决定**，型号改了，3D 模型和数据库层记录同步变化
- 新增书籍**必须**指定「哪个架子 → 哪一层 → 第几个槽位」，落不了位就存不进去
- 搜索某本书时，命中的**书架整体描边高亮 + 所在那一层单独高亮**，镜头自动飞过去

技术栈：React 18 + React Three Fiber + Zustand / NestJS 10 + Prisma 5 + SQLite。

---

## 核心机制：数据 → 3D

3D 场景不手绘，完全由数据库里的布局数据**程序化生成**，所以改数据就等于改现实映射。

```
ShelfType（型号：层数 / 层高 / 宽 / 深 / 每层槽位数）
   └── Shelf（实体书架：posX / posZ / rotation / zone）
          └── Layer（层：按型号的 layerCount 自动展开）
                 └── Book（书：layerId + slotIndex，唯一约束防重复占位）
```

高亮链路：搜索命中 `book.layerId` → 查 mesh 登记表（`layerId → Object3D`）拿到真实 3D 物体 → 交给 `Outline`（OutlinePass）描边 → `CameraRig` 用 lerp 平滑飞向该层。

---

## 功能

| 模块 | 能力 |
| --- | --- |
| 检索 | 按书名/作者/ISBN 模糊搜索，命中即双层高亮 + 镜头聚焦；点击 3D 层板可查看该层藏书 |
| 新增图书 | 强制选择 书架 → 层 → 槽位，槽位越界/被占都会被后端拦截并返回明确原因 |
| 层内管理 | 层面板列书，支持**移动**（换层换槽）与**下架**，移动同样走容量与占用校验 |
| 书架管理 | 增删书架、改编号/坐标/旋转/区域；新增时自动推荐编号与摆放坐标 |
| 型号管理 | 增删书架型号（层数等）；**有书架在用则拒绝删除**，避免布局数据对不上 |
| 统计 | 总藏书 / 总容量 / 占用率，按区域分组的占用情况 |

---

## 快速开始

### 1. 开发环境（前后端分离，两个端口）

```bash
# 后端
cd server
npm install
cp .env.example .env          # SQLite 零配置，直接用默认即可
npx prisma migrate deploy     # 建表
npx prisma generate
npm run seed                  # 可选：灌入示例数据（6 个书架 / 3 种型号 / 17 本书）
npm run dev                   # http://localhost:3000

# 前端（另开一个终端）
cd client
npm install
npm run dev                   # http://localhost:5173
```

前端 dev 模式下请求会走 `vite.config.ts` 里的代理转发到 3000 端口。

### 2. 生产部署（单端口）

前端构建产物会被同步进 `server/public`，由 NestJS 用 `useStaticAssets` 一并托管，**只需要一个端口**：

```bash
cd server
npm install
cp .env.example .env
npx prisma migrate deploy
npm run prod                  # 构前端 → 同步到 public → 编译后端 → 启动
# 访问 http://localhost:3000
```

端口用环境变量 `PORT` 控制，默认 3000，监听 `0.0.0.0`，可直接丢到容器或 PaaS 上。

---

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/shelves` | 书架列表（含型号、层、层内藏书） |
| POST | `/shelves` | 新增书架（按型号自动展开层） |
| GET | `/shelves/types` | 型号列表 |
| POST | `/shelves/types` | 新增型号 |
| GET | `/shelves/:id` | 单个书架详情 |
| PUT | `/shelves/:id` | 改编号/坐标/旋转/区域 |
| DELETE | `/shelves/:id` | 删除书架（级联删层与书） |
| DELETE | `/shelves/types/:id` | 删除型号（被占用则拒绝） |
| GET | `/books?q=` | 检索图书 |
| POST | `/books` | 新增图书（强校验落位） |
| PUT | `/books/:id/move` | 移动图书 |
| DELETE | `/books/:id` | 下架 |

---

## 目录结构

```
library-3d/
├── client/                     # 前端（React + R3F）
│   └── src/
│       ├── scene/
│       │   ├── Scene.tsx       # 场景装配、Outline 高亮、镜头飞行
│       │   ├── ShelfMesh.tsx   # 按数据程序化生成书架与层板
│       │   └── registry.ts     # layerId → Object3D 登记表（高亮的桥梁）
│       ├── ui/                 # 检索 / 新增 / 层面板 / 书架管理 / 型号管理 / 统计
│       ├── store.ts            # Zustand
│       └── api.ts
└── server/                     # 后端（NestJS + Prisma）
    ├── prisma/schema.prisma
    ├── prisma/seed.ts
    ├── scripts/sync-client.mjs # 把前端产物同步到 server/public
    └── src/
        ├── books/
        ├── shelves/
        └── prisma.module.ts
```

---

## 换成 PostgreSQL

SQLite 只是为了让项目开箱即跑。换 PG 两步：

1. `server/.env` 里改 `DATABASE_URL="postgresql://user:pass@host:5432/library3d?schema=public"`
2. `server/prisma/schema.prisma` 里 `datasource db { provider = "postgresql" }`

然后重新 `npx prisma migrate deploy`。

---

## 已知限制

- 3D 渲染依赖 WebGL；环境不支持时会显示降级提示而不是白屏（`App.tsx` 里的 `detectWebGL`）
- 目前是单机单库方案，多人同时编辑没有实时同步（要上的话建议加 WebSocket + 乐观锁）
- 没有鉴权，任何能访问服务的人都能改数据；放到公网前建议加一层访问口令
