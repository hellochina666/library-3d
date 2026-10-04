# 架构设计

本文是改动这个项目前该读的那一份。命名与放文件的规则见 [conventions.md](./conventions.md)，
项目入口与启动方式见 [../README.md](../README.md)。

---

## 1. 系统边界

单仓库两个 npm 包，没有 workspace、没有共享构建：

| 包 | 技术栈 | 职责 | 端口 |
| --- | --- | --- | --- |
| `client/` | React 18 + React Three Fiber 8 + drei + Zustand 4 + Vite 5 | 渲染与交互编排，**不持有任何业务规则的最终判定** | dev 5173 |
| `server/` | NestJS 10 + Prisma 5 + SQLite | 数据唯一权威：落位校验、按型号展开层、槽位占用 | 3000 |

- 通信只有 REST/JSON：dev 走 Vite 代理 `/api/*` → `http://localhost:3000/*`（`rewrite` 剥掉前缀，
  所以后端路由**没有**全局前缀）；生产构建 `VITE_API_BASE` 为空，前端与 API 同源。
- 单端口部署：`client` 构建产物由 `server/scripts/sync-client.mjs` 同步进 `server/public`，
  `main.ts` 用 `useStaticAssets` 托管，只暴露一个端口。
- 没有鉴权、没有实时同步（README「已知限制」）。

整体形状：**数据库里的布局数据是唯一真相，3D 场景是它的投影**。任何"手画"的坐标都是架构违例。

---

## 2. 分层与依赖方向

### client（五层，依赖只能自上而下）

```
main.tsx ─→ App.tsx                     布局壳：桌面侧栏 / 窄屏抽屉 / 无 WebGL 降级
             ├── ui/**                  DOM 面板（侧栏、抽屉、浮层卡片）
             ├── scene/**               R3F 渲染层（Canvas 内的世界）
             └── hooks/**               通用 React hook
                    ↓ 读写
              store.ts                   状态编排：唯一的异步入口 + 跨组件状态
                    ↓
              api.ts                     唯一出网点：fetch 封装 + 按资源的端点
                    ↓
              types.ts                   与后端 schema 对齐的实体契约
              scene/rules.ts             纯领域函数（落位/吸附/引导几何）
```

硬规则（现在成立，破坏它就算违例）：

- **只有 `store.ts` 可以 import `api.ts`**。面板和场景组件一律通过 store 的动作发请求。
- `scene/**` 与 `ui/**` 互不 import；两者之间的通信走 `store.ts` 或 `scene/registry.ts`。
- `rules.ts` / `types.ts` 不得 import `react` / `three` / `zustand`（保持可单测；
  `rules.ts` 只 `import type { ShelfType }`，属于允许的类型依赖）。
- 场景组件不自己 `fetch`、不自己算间距的最终结论，只做预览。

### server（四层）

```
main.ts → app.module.ts → <feature>.module.ts
                             ├── <feature>.controller.ts   HTTP 映射 + 参数解析，不写业务逻辑
                             ├── <feature>.service.ts      业务规则 + Prisma 编排
                             └── placement.ts（shelves）    纯领域规则，可脱离 Nest 测试
                          database/prisma.{module,service}  数据访问唯一入口（全局模块）
```

- controller 薄：解析 body → 调 service → 返回。校验一律在 service / 领域函数里。
- 跨资源只经 service（如 books 需要 shelves 的容量），不直连别人的表。
- `placement.ts` 依赖 `BadRequestException` 只为报错文案；其余函数是纯计算。

---

## 3. 三条主数据流

**冷启动**
`App` mount → `store.loadAll()` → 并行 `api.libraries()` + `api.types()` → 无馆则建「默认图书馆」
→ `localStorage[library3d.currentLibraryId]` 决定当前馆 → `store.loadLibraryData()` →
`api.shelves(libraryId)` + `api.allBooks(libraryId)` → `Scene` 按 `ShelfType → Shelf → Layer → Book`
程序化建模。**任何写操作之后都重新 `loadLibraryData()`**，用「重拉全量」换取 3D 与数据永不失配。

**检索高亮**（数据 id ↔ 3D 物体的桥梁链路）
`SearchPanel` → `store.search(q)` → `api.search` 返回带 `shelfId/layerId` 的 `BookHit`
→ `store.focusBook()` 写 `highlight / pickedLayer / pickedBook`
→ `Scene` 用 `registry.getLayerMesh(layerId)` 拿到真实 `Object3D` → `Outline` 描边
→ `CameraRig` lerp 飞向该层。

**3D 摆放**
`PlacementPanel` → `store.enterPlacement(typeId)` → `Scene` 用 `rules.planSlots()` 算候选点
（全局 `CELL` 方格点阵 ∪ 以每个已有书架为锚点的随行点阵）→ 绿/红地砖 + 幽灵预览
→ 点击/松手落位 → `store.placeShelf()` → `api.createShelf` → **后端 `placement.assertFits()` 权威校验**
（间距不足返回 400，消息带上挡住它的是哪个架）→ 前端重拉数据。

---

## 4. 关键机制

- **`scene/registry.ts`**：`layerId → Object3D` 的模块级 Map + `version` + 订阅回调。
  刻意不走 React state —— 高亮登记/注销若触发重渲染会重建整个场景 props。
- **接触阴影与真实几何**：`Room.tsx`/`ShelfMesh.tsx` 的尺寸全部来自 `ShelfType` 字段与 `rules.ts` 的
  `halfExtents`，型号改了模型自动跟着改。
- **引导层几何合并**：可落位/占用地砖由 `rules.ts` 一次性生成顶点数组，一个 `<mesh>` 装完，
  不做「每格一个 mesh」。层级用 `renderOrder`（地砖 2/3/4 → 幽灵 5 → 描边线 6）叠加，
  且这些贴地三角形绕向朝下，**必须 `side={THREE.DoubleSide}`**，否则被背面剔除整层看不见。

---

## 5. 跨端契约（改一处必改两处）

落位判定在两端各有一份实现：前端即时预览，后端最终裁决。

| 契约项 | `client/src/scene/rules.ts` | `server/src/shelves/placement.ts` | 当前值 |
| --- | --- | --- | --- |
| 侧向间隙 `GAP_X` | ✅ | ✅ | `0.4` 米 |
| 走道宽度 `GAP_Z` | ✅ | ✅ | `0.9` 米 |
| 判定容差 `COLLIDE_TOL` | ✅ | ✅ | `0.005` 米 |
| `halfExtents()`（旋转后 AABB 半宽/半深） | ✅ | ✅ | 同一公式 |
| `conflicts()`（两轴同时小于间距和 = 冲突） | ✅ | ✅ | 同一公式 |
| `CELL = 0.6` 全局方格 | ✅ | —— | 仅前端可视化/吸附用 |

- 两端注释互相指认，值与公式必须完全一致；改任意一端都要同步另一端，并按 §7 的手工用例回归。
- 想收敛成单一来源需要引入 `packages/shared` + npm workspaces + 两端构建改造。**当前约 60 行重复，
  代价高于收益，明确保留双实现**；若重复面积继续增长（例如加入旋转非 90° 的复杂碰撞）再重议。

---

## 6. 性能架构

3D 场景的性能预算按设备分档，档位只从 `useViewport.ts` 的 `useTier()` 出：

| 档位 | 触发 | Canvas `dpr` | `antialias` | `performance.min` | Scene `quality` |
| --- | --- | --- | --- | --- | --- |
| `phone` | `max-width: 700px` | `[0.75, 1.25]` | 关 | `0.5` | `phone` |
| `tablet` / `desktop` | `max-width: 1024px` / 其余 | `[1, 2]` | 开 | `0.7` | `desktop` |

- 断点用 `matchMedia` 的 `change` 事件而不是 `resize`：跨档才回调一次，避免每帧重渲染导致场景 props 重建。
- 静止不动时把开销降到 0：阴影贴图 `autoUpdate = false` + 场景变化时手动 `needsUpdate`，
  配合 drei 的 `AdaptiveDpr` / `AdaptiveEvents` 与 R3F 的 `regress()`（交互瞬间降档，静止 `debounce` 后恢复）。
- 纹理在 `scene/materials.ts` 模块级缓存复用，几何用 `useMemo` 并在使用卸载时 `dispose`，
  书架/书本组件 `memo` 化。
- UI 侧的省流做法：吸附点没变就 `setState` 短路返回原对象（指针每像素移动不重渲染引导层）。
- 手机像素比封顶 1.25：高分屏跑满 DPR 是最直接的掉帧来源。

---

## 7. 验证门槛（提交前必过）

1. 类型：`cd client && npx tsc --noEmit`；后端：`cd server && npm run build`。
2. 浏览器实测：3D 交互（轨道拖拽、摆放落位、点书、点层板）必须真实点击验证，
   桌面档与 ≤700px 窄屏档都要过；验证期间面板保持可见。
3. 改到 §5 契约时的手工用例：
   - 沿已有的一排贴着顺延摆放 → 必须判为「放得下」，且后端接受；
   - 旋转 90° 后重新计算 footprint（宽深互换）→ 预览与实际一致；
   - 故意压到已有架的走道上 → 前端显示红格，后端返回 400 且消息点名挡住它的架编号；
   - 落位成功后 3D 与数据库状态一致（重拉全量生效）。
4. 项目规则：**先验证再提交**，未实测通过不 commit。

---

## 8. 现状与目标的偏差

结构已基本符合上述分层（`client/src/hooks/`、`server/src/database/` 已就位），剩下的偏差都是有意的：

| 偏差 | 现状 | 结论 |
| --- | --- | --- |
| `client/src/api.ts` / `types.ts` / `store.ts` 平铺在 `src` 根 | 各只有一个实现、体量小（74 / 57 / 344 行） | **保持现状**。拆成 `api/`、`domain/`、`store/` 目录属于单文件目录，等按资源继续膨胀再拆 |
| 落位规则两端各一份 | `scene/rules.ts` + `shelves/placement.ts` | **有意双实现**，见 §5；不引入 `packages/shared` |
| 无自动化测试 | 纯函数（`rules.ts` / `placement.ts`）无测试覆盖 | 待补，见 conventions.md §7 |
| 文档 | 深入设计原先塞在 README 里 | 已迁到 `docs/`，README 只做入口与索引 |
