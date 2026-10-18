# 三维模型放置说明

本目录存放站点「三维模型」页面加载的模型文件。

## 当前文件

- `fengcheng.glb`：**奉城古城墙真实模型**
  - 来源：`奉城古城.rvt`（Revit）→ 导出 FBX（85 MB，约 339 万三角面）
  - 经 `FBX2glTF` 转换并开启 **Draco 压缩**，体积降到 **17.8 MB**
  - 页面加载时由 `DRACOLoader` 在浏览器端实时解压

## 如何更新模型

1. 在 Revit 中打开 `.rvt`，**文件 → 导出 → FBX**，存到本目录；
2. 运行转换（可选，但强烈建议，否则文件可能过大）：

```
FBX2glTF.exe -i fengcheng.fbx -o fengcheng -b -d
```

   `-b` 输出单文件 `.glb`，`-d` 开启 Draco 压缩；
3. 转换完成后删除 `.fbx`，避免仓库体积过大；
4. 页面 `content/model/index.md` 中的 `src` 保持 `models/fengcheng.glb` 即可。

## 查看器支持的格式

`.glb` / `.gltf`（支持 Draco）/ `.fbx` / `.obj`，按扩展名自动选择加载器。

## 体积参考

- GitHub Pages 单文件上限 100 MB，仓库上限 1 GB；
- 未压缩的 Revit FBX 常有 80–200 MB，务必转 GLB + Draco。
