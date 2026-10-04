# 扫描贴图来源

全部来自 [Poly Haven](https://polyhaven.com/textures)，许可证 **CC0 1.0**（公有领域，可商用、无需署名，署名仅为方便追溯）。

| 文件 | 资产 | 作者 | 原始尺寸 | 用途 |
| --- | --- | --- | --- | --- |
| `laminate_floor_*` | [laminate_floor](https://polyhaven.com/a/laminate_floor) | Dario Barresi, Dimitrios Savva | 2000×2000 mm（一拍 2m） | 地板 albedo / normal / roughness |
| `beige_wall_001_*` | [beige_wall_001](https://polyhaven.com/a/beige_wall_001) | Dimitrios Savva, Rico Cilliers | 3000×3000 mm（一拍 3m） | 后墙 albedo / normal / roughness |

后缀：`diff` = 反照率，`nor_gl` = OpenGL 约定法线，`rough` = 粗糙度。

## 本地处理

原始 2K PNG 共 7.3MB，用 ffmpeg 转 JPEG 压到 3.1MB 以内：

- `diff`：`-q:v 3`（颜色图，亚采样损失肉眼不可见）
- `nor_gl` / `rough`：`-pix_fmt rgb24 -q:v 2`。数据贴图必须关闭 4:2:0 色度亚采样，否则法线的 RG 通道被邻域平均、凹凸细节被抹平；代价是墙面法线图反而从 815KB 涨到 973KB，属于用体积换保真度的有意取舍。

`dimensions`（物理尺寸）取自 Poly Haven `/assets?type=textures` 列表接口，代码里据此按米铺贴，不是随意估值。
