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
| 检索 | 按书名/作者/ISBN 模糊搜索，命中即双层高亮 + 镜头聚焦；点击 3D 层板可查看该层藏书，点击书本弹出详情卡 |
| 新增图书 | 强制选择 书架 → 层 → 槽位，槽位越界/被占都会被后端拦截并返回明确原因 |
| 层内管理 | 层面板列书，支持**移动**（换层换槽）与**下架**，移动同样走容量与占用校验 |
| 多图书馆 | 每个馆一套独立 3D 布局，切换/新建/重命名/删除，检索与摆放都只作用于当前馆 |
| 3D 摆放 | 选型号进入摆放模式：地面按 0.6m 方格铺出**可落位浅绿地砖**与占用格子，幽灵预览吸附最近方格并实时判绿/红，单击落位、R 旋转、右键或 Esc 取消；也可在 3D 里**长按书架直接拖动**重排（松开左键落位） |
| 书架管理 | 增删书架、改编号/坐标/旋转/区域；新增时自动推荐编号与摆放坐标 |
| 型号管理 | 增删书架型号（层数、层高、宽深、每层槽位数）；**有书架在用则拒绝删除**，避免布局数据对不上 |
| 统计 | 总藏书 / 总容量 / 占用率，按区域分组的占用情况 |
| 响应式 | 桌面右侧栏 / 平板窄栏 / 手机底部抽屉（展开·仅标签·隐藏三态），3D 画质与像素比按档位分档 |

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
| PUT | `/books/:id` | 移动 / 编辑图书（换层换槽或改书名作者） |
| DELETE | `/books/:id` | 下架 |
| GET | `/books/:id` | 单本详情 |
| POST | `/shelves/layout` | 表格批量生成布局（整体重建，事务执行）—— 已被 3D 拖拽摆放取代，接口保留供脚本/回滚使用 |
| GET | `/libraries` | 图书馆列表 |
| POST | `/libraries` | 新建图书馆 |
| PUT | `/libraries/:id` | 重命名 |
| DELETE | `/libraries/:id` | 删除（级联删书架/层/书） |

---

## 文档

- [docs/architecture.md](docs/architecture.md) —— 系统边界、分层与依赖方向、三条主数据流、跨端契约、性能架构、提交前验证门槛
- [docs/conventions.md](docs/conventions.md) —— 新文件落位决策表、命名规则、代码风格、提交约定

## 目录结构

```
library-3d/
├── docs/                       # 架构设计与规约
├── client/                     # 前端（React + R3F）
│   └── src/
│       ├── App.tsx             # 布局壳：桌面侧栏 / 窄屏抽屉 / 无 WebGL 降级
│       ├── store.ts            # Zustand：唯一能调 API 的一层
│       ├── api.ts              # fetch 封装 + 按资源端点
│       ├── types.ts            # 与后端 schema 对齐的实体契约
│       ├── hooks/              # useViewport（分档：phone / tablet / desktop）
│       ├── scene/
│       │   ├── Scene.tsx       # 场景装配、Outline 高亮、镜头飞行、摆放引导层
│       │   ├── ShelfMesh.tsx   # 按数据程序化生成书架与层板
│       │   ├── Room.tsx        # 房间与地面
│       │   ├── materials.ts    # 程序化纹理/材质缓存
│       │   ├── rules.ts        # 落位/吸附/引导几何（与后端 placement.ts 同规则）
│       │   └── registry.ts     # layerId → Object3D 登记表（高亮的桥梁）
│       └── ui/                 # 检索 / 新增 / 层面板 / 书架管理 / 型号管理 / 摆放 / 统计 / 书本详情卡
└── server/                     # 后端（NestJS + Prisma）
    ├── prisma/schema.prisma
    ├── prisma/seed.ts
    ├── scripts/sync-client.mjs # 把前端产物同步到 server/public
    └── src/
        ├── books/              # controller + service + module
        ├── shelves/            # controller + service + module + placement.ts（权威落位校验）
        ├── libraries/          # 多图书馆
        ├── database/           # prisma.module.ts + prisma.service.ts（数据访问唯一入口）
        ├── app.module.ts
        └── main.ts             # 生产模式同端口托管前端静态资源
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
