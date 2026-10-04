# 命名与目录规约

分层与依赖规则见 [architecture.md](./architecture.md)。本文回答两个问题：**新文件放哪**、**叫什么名字**。

---

## 1. 仓库顶层

```
library-3d/
├── README.md          # 入口：是什么 / 怎么跑 / 接口一览 / 已知限制
├── docs/              # 深入设计，只有本文 + architecture.md
├── client/            # 前端包（独立 lockfile、独立构建）
└── server/            # 后端包（含 prisma/、scripts/）
```

- 目录名固定 `client` / `server`，加第三端（如 `shared`）前必须先在 architecture.md 立约并说明收益。
- 文档只有两级：根 README（入口）与 `docs/`（设计）。**不在子包里再放 README/设计稿**，避免三份真相。
- 运行时产物不进仓库：`dist/`、`*.log`、`**/prisma/dev.db`、`.env` 已在 `.gitignore`；
  截图等临时物放仓库外。
- 环境文件：`server/.env.example` 入库（模板），`.env` 不入库；`client/.env.production` 入库（只有公开前缀）。

---

## 2. `client/src` 新文件落位决策表

| 要写的东西 | 放哪 | 现有例子 |
| --- | --- | --- |
| 应用装配、布局壳、路由级分支 | `src/` 根 | `main.tsx`、`App.tsx` |
| 全局状态 + 异步编排（唯一能调 API 的地方） | `src/store.ts` | `store.ts` |
| HTTP 端点封装 | `src/api.ts` | `api.ts` |
| 与后端 schema 对齐的实体类型 | `src/types.ts` | `types.ts` |
| 通用 React hook | `src/hooks/useXxx.ts` | `hooks/useViewport.ts` |
| Canvas 内的渲染组件、材质、几何、物体登记 | `src/scene/` | `Scene.tsx`、`ShelfMesh.tsx`、`Room.tsx`、`materials.ts`、`registry.ts`、`rules.ts` |
| 侧栏/抽屉/浮层的 DOM 面板 | `src/ui/` | `SearchPanel.tsx`、`BookCard.tsx` |
| 样式 | `src/index.css`（变量集中在 `:root`） | `index.css` |

判据：**离开 React 也能独立运行的纯函数**跟着它的服务对象放（`rules.ts` 在 `scene/`），
但不得 import 框架；**只有单个实现的全局状态**就留在 `src/store.ts`，别为了"规范"提前拆 slice。

新增面板记得同时改两处：`App.tsx` 的 `TABS` 与 `panel-body` 分支，以及 `index.css` 里对应块。

### `server/src` 新文件落位决策表

| 要写的东西 | 放哪 | 现有例子 |
| --- | --- | --- |
| 新资源（一整套 CRUD） | `src/<resource>/`（复数），含 controller + service + module | `books/`、`shelves/`、`libraries/` |
| 该资源专属的纯业务规则 | 同资源目录内，不套资源后缀 | `shelves/placement.ts` |
| 跨资源复用的数据访问 | `src/database/`（Prisma 全局模块） | `database/prisma.service.ts` |
| 跨资源 HTTP 中间件（守卫、拦截器、过滤器） | `src/common/`（**目前还没有，需要时再建，不预留空目录**） | — |
| 应用装配 | `src/` 根 | `app.module.ts`、`main.ts` |

新资源 module 建完要在 `app.module.ts` 的 `imports` 注册；`PrismaModule` 是 `@Global()`，
service 直接注入即可，不要在每个模块重复 `providers: [PrismaService]`。

---

## 3. 命名

### 文件

| 类别 | 规则 | 例 |
| --- | --- | --- |
| React 组件 | `PascalCase.tsx`，文件名 = 导出组件名 | `ShelfMesh.tsx` → `export function ShelfMesh` |
| hook | `useXxx.ts`，文件名 = 导出函数名 | `useViewport.ts` → `useTier()` |
| 纯逻辑/资源/状态模块 | 小写 `camelCase.ts` | `materials.ts`、`registry.ts`、`rules.ts`、`store.ts`、`api.ts` |
| 样式 | `index.css`（单文件，用 `/* ---------- 区块 ---------- */` 分段） | — |
| 后端 | kebab-case：`<resource>.controller.ts` / `.service.ts` / `.module.ts` | `books.controller.ts` |
| 后端纯领域文件 | 不套资源后缀 | `shelves/placement.ts` |

非组件文件禁止用 PascalCase 命名（`Scene.tsx` 是组件，`scene.ts` 才是不合格的写法）。

### 组件后缀语义固定

- `*Panel.tsx`：Tab 内一块面板（`SearchPanel`、`StatsPanel`、`PlacementPanel`）。
- `*Form.tsx`：以提交为目的的表单（`AddBookForm`）。
- `*Manager.tsx`：增删改列表（`ShelfManager`、`ShelfTypeManager`）。
- `*Card.tsx`：画布上的浮层卡片（`BookCard`）。

### 标识符

- 变量/函数/类型一律英文；注释与 UI 文案中文。
- 领域常量 `SCREAMING_SNAKE`（`GAP_X`、`CELL`、`LIB_KEY`），跨端契约常量按 §5 同步。
- 类型不加 `I` 前缀、不为单实现造 `*Base` / `*Impl` / `*Helper` 层。
- 布尔用 `is/has/can` 前缀（`isCoarsePointer()`、`canPlace()`）。
- 后端 Prisma 字段名（`posX`、`slotsPerLayer`）= 前端 `types.ts` 字段名 = API 字段名，不做映射层。

### CSS

- 类名 kebab-case，按「块-元素-状态」轻量组织：`sheet-bar`、`book-card`、`view-tools`。
- 状态用属性选择器，不造 `.is-xxx`：`.sidebar[data-state='hidden']`、`.app--phone`。
- 档位类名与 `useTier()` 返回值同名（`app--phone|tablet|desktop`），`Scene` 的 `quality` prop 同源。
- 颜色/字号/控件尺寸**只能取 `:root` 变量**（`--fs-sm`、`--ctl-h`、`--line-strong`）。
  散写 `12px`/`13px` 是这个项目文字与标签基线错位的根因，不要再引入。
- 布局不用内联 `style`；只有运行时算出的几何值（如幽灵位置）才内联。

---

## 4. 代码风格

- 注释只写**为什么**：约束、坑、跨端同步点、反直觉的顺序（例如 `renderOrder` 与 `DoubleSide` 的由来）。
  不写解释 WHAT 的注释，不留 `// removed` 之类的墓碑。
- 不为不会发生的场景加兜底校验；校验放在系统边界：前端 = `api` 的错误抛出 + 后端落位裁决，
  后端 = controller 入参 + service 业务规则。
- 不写空 `catch`。错误只在 `store` 的 `try/catch` 转成 `error` / `placementMsg`，UI 只负责显示。
- `api.ts` 返回统一走 `json<T>()`，业务代码里不出现裸 `fetch`、不出现 `any`。
- React：状态放在最小所有者，跨面板才进 store；事件回调用 `useCallback`，纯展示组件用 `memo`；
  订阅类副作用一律在 `useEffect` 返回清理函数。
- Zustand：单 store，写状态用 `set(...)`，不在组件里 mutate。
- 三行相似代码好过过早抽象；改完顺手"清理"周边代码不属于任务范围。

---

## 5. 跨端契约的书写要求

`client/src/scene/rules.ts` 与 `server/src/shelves/placement.ts` 是同一规则的两份实现
（对应表见 [architecture.md §5](./architecture.md)）：

- 常量名、数值、公式在两端**逐字一致**，并在注释里点明另一端路径。
- 只改一端视为 bug。改动必须同时出现在同一个 commit 里。
- 新增判据（例如非 90° 旋转的碰撞）先写后端裁决，再在前端补预览，二者错误/颜色语义保持一致。

---

## 6. 提交约定

- 直接在 `main` 上提交（个人项目现状），一个可验证的完整功能 = 一个 commit。
- 前缀 + 中文主题，与既有历史保持一致：
  `feat:` 新功能 · `fix:` 缺陷 · `perf:` 性能 · `refactor:` 结构 · `docs:` 文档 · `chore:` 杂项。
  例：`feat: 多图书馆 + 3D 拖拽摆放，替代原表格布局录入`。
- 提交前置条件：**浏览器实测通过再提交**（含需要人工确认的交互项），未验证不 commit、不 push。
- 改动落到文档的门槛：接口变更 → 更新 README「接口一览」；
  分层/目录/命名变更 → 更新本文与 architecture.md。

---

## 7. 测试

- 目前没有自动化测试。最该补的是纯函数：`rules.ts` 的 `planSlots/conflicts/nearestSlot`
  与 `placement.ts` 的 `halfExtents/conflicts/assertFits` —— 它们无框架依赖，也正好是跨端契约的两端。
- 约定：测试文件 `xxx.test.ts` 与被测文件同目录；前端引入 Vitest（与 Vite 同构），
  后端用 Jest（Nest 默认）。补测试时先在 `client/package.json` / `server/package.json` 加 `test` 脚本，
  再回来更新本节。

---

## 8. 禁止清单

- 在 `client/src` 根随手新建文件而不查决策表；在 `ui/`、`scene/` 里直接 `fetch` 或 import `api`。
- 为了"标准化"引入 DI 容器、状态库替换、目录 barrel（`index.ts` 汇总导出）等项目规模用不上的结构。
- 在子包里另放 README/设计文档；把截图、`dist`、`dev.db`、`.env` 提交进仓库。
- 只改前端常量就上线（见 §5）。
