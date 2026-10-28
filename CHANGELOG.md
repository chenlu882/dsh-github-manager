# Changelog

## 0.2.2 - 2026-10-29

- 修复 0.2.1 占用宿主唯一 /api 拦截器造成欢迎页请求失败的问题。
- 仅注册四个精确 Fetch 路由，沿用宿主的身份及 owner 校验，不干扰内置设置与其他 RPC 接口。
- 增加实际 DSH HostConnectionService 共存验证，覆盖拦截器冲突、原设置接口、访客拒绝和路由释放。


## 0.2.1 - 2026-10-29

- 改用 DSH Connection RPC，仅允许 owner 调用；移除独立 HTTP 监听、固定令牌和跨域配置。
- DSH 插件更新直接调用宿主安装流程，保留启用状态与分支/标签约束，不再先卸载旧版。
- 命令使用参数数组执行；npm 通过 npm-cli.js 启动，避免 cmd 字符串拼接。
- 更新需使用十分钟内的检查凭据；npm 安装确认的版本，Git 更新前重新校验并快进到确认的提交。
- 拦截脏工作区、游离 HEAD、未设置上游和分支分叉；支持 worktree 识别。
- 修正 SemVer 预发布版本比较、缓存版本排序和 npm 可用性判断。
- 扫描移至 Worker，增加缓存、分类错误提示与扫描范围展示。
- 支持通过环境变量设置 Git 与下载扫描目录；Codex 条目明确标为缓存记录。
- 增加行为测试及 Windows/Linux、Node 20/22 检查矩阵。

## 0.2.0 - 2026-10-29

### Added

- GitHub tab under DSH Plugins page.
- DSH bundle inventory with update/uninstall.
- External npm tools inventory (including REA) with npm version check.
- Codex plugin inventory (read-only for OpenAI-provided plugins).
- Git project inventory with `git fetch` update check and `git pull --ff-only`.
- Conservative GitHub source archive detection.
- Git for Windows install guide through winget, with progress and timeout.
- `打开位置` via Electron `shell.showItemInFolder`, with Explorer fallback.
- `复制路径` for all item types.
- Host-backed Git install progress that survives tab switches.
- `.github/workflows/check.yml`, LICENSE, SECURITY, CHANGELOG.

### Fixed

- Prevented stale local progress from disappearing when the sidebar tab remounts.
- Prevented Git install from disabling unrelated controls.
- Scoped Git install progress/error card to the Git tab.
- Prevented accidental uninstall of REA when referenced by Codex config.
- Hardened JSON reads against UTF-8 BOM in package metadata.

## 0.1.0 - 2026-10-28

- Initial local prototype.

