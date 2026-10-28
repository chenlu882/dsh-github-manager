# DSH GitHub Manager

**给小白做的 DeepSeek Harness GitHub 管理插件。** 把本机常见的项目、工具和插件分成容易理解的类别，帮助新手找到安装位置、检查更新，减少不知道该用哪种方式管理的困惑。欢迎大家反馈问题、完善文档和改进功能。

[版本下载](https://github.com/chenlu882/dsh-github-manager/releases/latest) · [新手操作文档](docs/USAGE.md) · [反馈问题](https://github.com/chenlu882/dsh-github-manager/issues) · [贡献指南](CONTRIBUTING.md)

在 DeepSeek Harness（DSH）的 **Plugins** 页面中增加一个 **GitHub** 标签，统一查看和管理五类本地内容：

- DSH 插件（bundle）
- 外部工具（npm 全局安装的 CLI / MCP，如 REA）
- Codex 插件
- GitHub 克隆的 Git 项目
- GitHub 源码包

> 目标不是“把所有 GitHub 仓库塞进一个列表”，而是按**实际安装/更新方式**分类，避免用错更新命令。

## 功能

| 分类 | 能做什么 |
|---|---|
| DSH 插件 | 查看 GitHub 来源的 bundle，更新、卸载 |
| 外部工具 | 检查 npm 最新版本；有新版才提示更新；打开位置、复制路径 |
| Codex 插件 | 查看已安装插件、启用状态、打开位置、复制路径 |
| Git 项目 | 检查跟踪分支；有更新才提示；重新校验后快进到确认的提交（需 Git） |
| GitHub 源码包 | 保守识别 GitHub 来源的 ZIP/源码目录，打开位置、复制路径 |

### 更新流程

```text
检查更新
  → 查询 npm / git
  → 已是最新：只提示
  → 发现新版/新提交：显示“是否更新”
  → 确认后才执行更新
```

### Git 安装引导

如果本机没有 Git：

1. 点 Git 项目的“检查更新”
2. 弹出“是否安装 Git for Windows”
3. 确认后通过 winget 安装
4. 显示下载/安装进度，5 分钟超时
5. 安装期间其他页面仍可使用
6. 安装结束后自动重新检查

安装进度保存在 Host 侧，切换到其他页面再回来会恢复。

更新检查的确认凭据有效期为十分钟；npm 更新安装确认时显示的具体版本。Git 更新前会重新检查，拒绝未提交/未跟踪文件、游离 HEAD、缺少上游和分支分叉；若确认后提交或分支改变，需要重新检查。

DSH 插件通过宿主 `installBundle` 更新，沿用宿主安装失败恢复机制，不先卸载旧版；保留原启用状态和来源中的分支/标签/提交约束。固定到提交的来源仍保持固定，可能没有版本变化。开发宿主若拒绝重复安装，会保留旧插件并报告原因。

## 环境要求

- DeepSeek Harness `0.2.1-rc.3`（开发验证版本）
- Node.js 20+
- Windows 10/11（Host 服务与 Git 安装引导目前面向 Windows）
- 可选：Git for Windows（用于 Git 项目更新）
- 可选：winget（用于一键安装 Git）

## 安装

### 从本地目录

```powershell
dsh plugin --profile desktop add E:\项目\dsh-github-manager
```

### 从 GitHub

```powershell
dsh plugin --profile desktop add github:chenlu882/dsh-github-manager
```

安装后**重启 DSH**，打开 **Plugins → GitHub**。

新手可优先使用 DSH 的 Plugins 页面“添加插件”，填写 `github:chenlu882/dsh-github-manager`。如当前宿主没有此入口，再使用上面的 CLI；`dsh` 需要已加入 PATH，否则使用自己电脑上 DSH CLI 的完整路径。

> 当前包名是 `@local/dsh-github-plugins`，适合本地/私有安装。若要发布到 npm，请把 `package.json` 的 `name` 改成自己的 scope，并同步 `cordis.patch.yml` 里的行名。

## 使用

- **DSH 插件**：只显示 `source` 以 `github:`、`git+https://github.com/` 等开头的 bundle。
- **外部工具**：扫描 npm 全局 prefix 中直接安装、且 repository 指向 GitHub 的包。
- **Codex 插件**：读取 `~/.codex/plugins/cache` 和 `config.toml`，所有条目只读。缓存记录不等于当前已安装清单，启用状态来自配置的简化解析。
- **Git 项目**：扫描 Desktop、`E:\项目`、`D:\AI` 等目录中的 `.git`，remote 必须指向 GitHub。
- **GitHub 源码包**：只识别 `*-main.zip`、`*-master.zip`、文件名含 `github`，或目录含 `.github`/GitHub 仓库信息的条目。

`打开位置` 优先使用 Electron `shell.showItemInFolder`，失败回退到 `explorer.exe /select`；每个条目都提供 `复制路径` 作为兜底。

## 架构

```text
仓库根目录/
├── package.json          # DSH bundle + dsh.client 声明
├── cordis.patch.yml      # 插入插件行
├── index.js              # Host 侧服务：扫描 / 检查 / 更新 / Git 安装
├── client.js             # 浏览器侧边栏 UI
├── scan-worker.js        # 独立线程扫描
├── version.js            # 版本比较
├── test/                 # 行为测试
├── icon.svg
├── locale/
│   ├── zh.json
│   └── en.json
├── .github/workflows/check.yml
├── CHANGELOG.md
├── LICENSE
├── README.md
└── SECURITY.md
```

Host 服务：

- 使用 DSH 自带的 Connection RPC，接口前缀为 `githubManager/`。
- 通过 DSH 的精确 Fetch 路由注册四个接口，由宿主统一验证身份并拒绝非 owner 请求；没有独立 HTTP 端口或插件固定令牌。
- 前端复用宿主连接，带有请求超时；同一条目的操作在 Host 侧加锁。
- 扫描在 Worker 内运行，缓存十五秒；手动刷新强制重新扫描，单分类失败不阻断其他分类。

### 配置扫描目录

启动 DSH 前可设置 `DSH_GITHUB_GIT_ROOTS` 和 `DSH_GITHUB_DOWNLOAD_ROOTS`。Windows 多目录以分号分隔；设置后替换该分类默认扫描范围。可在对应分类的“查看扫描范围”中确认。

```powershell
$env:DSH_GITHUB_GIT_ROOTS = 'E:\项目;E:\其他项目'
$env:DSH_GITHUB_DOWNLOAD_ROOTS = 'E:\下载'
```

这些设置只决定扫描范围，不移动已有项目，也不改变 DSH/Codex 管理的缓存位置。

## 开发

```powershell
node --check index.js
node --check client.js
```

或：

```powershell
npm run check
npm test
```

修改 `client.js` / `index.js` 后需要重启 DSH。

## 安全边界

- 宿主连接负责身份验证，插件接口额外拒绝非 owner 调用；不启用独立跨域服务。
- Git 与 npm 通过无 shell 的参数数组执行；npm 需有可读取的 `npm-cli.js`，缺失时给出明确错误。
- 不自动删除 Git 仓库、源码包或 Codex 插件。
- REA 等被 Codex `config.toml` 引用的工具标记为“被 Codex 使用，禁止卸载”。
- 安装 Git 会调用 winget，可能触发 Windows 管理员确认；不会静默提权。
- 更新/卸载正在运行的 DSH 插件时，DSH 可能要求重启。

## 已知限制

- 不管理 Codex 插件的卸载/更新（官方插件只读）。
- Git 项目与源码包暂不提供删除。
- GitHub 源码包只能按文件名/目录特征保守识别。
- Windows 专用功能较多；更新/安装不能通过离开页面取消，超时后应刷新确认实际结果。
- Codex 配置目前没有完整 TOML 解析；缓存版本按版本号排序展示，不保证就是运行中的版本。
- 外部工具仍按 npm 目录和 Codex 配置推断，非标准全局安装位置可能漏项。
- Connection RPC 接口基于 DSH `0.2.1-rc.3` 的宿主实现；升级 DSH 后需重新验证兼容性。

## License

本项目采用 [MIT](LICENSE) 许可证。所有人都可以在此基础上修改、二次开发、再发布或用于商业项目；分发时请保留原版权声明和 MIT 许可声明。独立维护自己的 Fork 无需逐次申请作者批准。

欢迎大家一起把这个面向小白的工具做得更好。希望合并到本仓库的修改，请通过 Fork → Pull Request 提交，由仓库所有者审核同意后合并。

