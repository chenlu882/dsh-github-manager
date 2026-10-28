window.__ModuleLoader__.load({
  id: '@local/dsh-github-plugins',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const SECTIONS = [
      { id: 'dsh', label: 'DSH 插件' },
      { id: 'tools', label: '外部工具' },
      { id: 'codex', label: 'Codex 插件' },
      { id: 'git', label: 'Git 项目' },
      { id: 'downloads', label: 'GitHub 源码包' },
    ];

    const COLORS = {
      text: 'var(--dsw-alias-label-primary, #1f2328)',
      secondary: 'var(--dsw-alias-label-secondary, #57606a)',
      tertiary: 'var(--dsw-alias-label-tertiary, #6e7781)',
      border: 'var(--dsw-alias-border-secondary, rgba(127,127,127,.28))',
      bg: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06))',
      accent: 'var(--dsw-alias-brand-primary, #0969da)',
      danger: 'var(--dsw-alias-state-error-primary, #cf222e)',
      success: 'var(--dsw-alias-state-success-primary, #1a7f37)',
    };

    function isGitHubSource(source) {
      return (
        typeof source === 'string' &&
        /^(github:|git\+https?:\/\/github\.com\/|git@github\.com:|https?:\/\/github\.com\/)/i.test(source)
      );
    }

    function updateSpec(source) {
      if (typeof source !== 'string') return null;
      return source;
    }

    function remoteValue(result, fallback) {
      if (!result || result.ok !== true) {
        const message = result && result.error && result.error.message;
        throw new Error(message || fallback || '操作失败');
      }
      return result.value;
    }

    function outcomeText(value, verb) {
      if (!value) return `${verb}完成`;
      if (value.application === 'restart-required') return `${verb}完成，重启 DSH 后生效`;
      if (value.application === 'failed') {
        const message = value.error && (value.error.message || value.error.diagnostic || value.error.code);
        return `${verb}失败${message ? `：${message}` : ''}`;
      }
      if (value.application === 'cancelled') return `${verb}已取消`;
      return `${verb}完成`;
    }

    function fmtBytes(n) {
      if (!n) return '';
      const units = ['B', 'KiB', 'MiB', 'GiB'];
      let value = n;
      let index = 0;
      while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
      }
      return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
    }

    function buttonStyle(primary, danger) {
      return {
        border: `1px solid ${danger ? COLORS.danger : COLORS.border}`,
        background: primary ? COLORS.accent : 'transparent',
        color: primary ? '#fff' : danger ? COLORS.danger : COLORS.text,
        borderRadius: 6,
        padding: '5px 9px',
        fontSize: 12,
        lineHeight: 1.4,
        cursor: 'pointer',
      };
    }

    function noticesOf(host) {
      return host && host.status === 'error'
        ? '宿主连接不可用，请重启 DSH 后重试。'
        : null;
    }

    function GitHubTab(props) {
      const api = props.api;
      const [section, setSection] = useState('dsh');
      const [dsh, setDsh] = useState([]);
      const [dshError, setDshError] = useState(null);
      const [host, setHost] = useState({ status: 'loading', data: null, error: null });
      const [busy, setBusy] = useState(null);
      const [notice, setNotice] = useState(null);
      const [confirming, setConfirming] = useState(null);
      const [gitPrompt, setGitPrompt] = useState(null);
      const [pendingUpdate, setPendingUpdate] = useState(null);
      const [gitInstalling, setGitInstalling] = useState(false);
      const [gitInstall, setGitInstall] = useState({ status: 'idle', percent: 0, message: '' });

      const load = useCallback(async () => {
        const [dshResult, hostResult, installResult] = await Promise.allSettled([
          api.list(),
          api.hostState(),
          api.gitInstallStatus(),
        ]);
        if (dshResult.status === 'fulfilled') {
          setDsh(dshResult.value);
          setDshError(null);
        } else {
          setDshError(
            dshResult.reason && dshResult.reason.message
              ? dshResult.reason.message
              : String(dshResult.reason)
          );
        }
        if (hostResult.status === 'fulfilled') {
          setHost({ status: 'ready', data: hostResult.value, error: null });
        } else {
          setHost({
            status: 'error',
            data: null,
            error:
              hostResult.reason && hostResult.reason.message
                ? hostResult.reason.message
                : String(hostResult.reason),
          });
        }
        if (installResult.status === 'fulfilled') {
          setGitInstall(installResult.value);
        }
      }, [api]);

      useEffect(() => {
        load();
      }, [load]);

      useEffect(() => {
        if (gitInstall.status !== 'running' && gitInstall.status !== 'waiting') return;
        let cancelled = false;
        const timer = setInterval(async () => {
          try {
            const next = await api.gitInstallStatus();
            if (!cancelled) setGitInstall(next);
          } catch {
            // Keep the last known progress.
          }
        }, 800);
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, [api, gitInstall.status]);

      const run = useCallback(
        async (key, action, label) => {
          setBusy(key);
          setNotice(null);
          try {
            const text = await action();
            setNotice({ kind: 'ok', text });
            setConfirming(null);
            await load();
          } catch (err) {
            setNotice({
              kind: 'error',
              text: `${label}：${err && err.message ? err.message : String(err)}`,
            });
          } finally {
            setBusy(null);
          }
        },
        [load]
      );

      const dshUpdate = useCallback(
        (item) => {
          run(
            `dsh:${item.name}`,
            async () => {
              const value = await api.update(item.name, item.updateSpec, item.enabled);
              return `${item.name}：${outcomeText(value, '更新')}`;
            },
            '更新'
          );
        },
        [api, run]
      );

      const dshUninstall = useCallback(
        (item) => {
          if (confirming !== `dsh:${item.name}`) {
            setConfirming(`dsh:${item.name}`);
            return;
          }
          run(
            `dsh:${item.name}`,
            async () => {
              const value = await api.uninstall(item.name);
              return `${item.name}：${outcomeText(value, '卸载')}`;
            },
            '卸载'
          );
        },
        [api, confirming, run]
      );

      const hostAction = useCallback(
        (type, item, verb, label) => {
          const key = `host:${type}:${item.id}`;
          if (verb === 'uninstall' && confirming !== key) {
            setConfirming(key);
            return;
          }
          run(
            key,
            async () => {
              const output = await api.hostAction(type, item.id, verb);
              return `${item.name}：${label}完成${output ? ` · ${output}` : ''}`;
            },
            label
          );
        },
        [api, confirming, run]
      );

      const copyPath = useCallback(async (value) => {
        try {
          await navigator.clipboard.writeText(value);
          setNotice({ kind: 'ok', text: `已复制路径：${value}` });
        } catch {
          setNotice({ kind: 'error', text: value });
        }
      }, []);

      const checkItem = useCallback(
        (type, item) => {
          setPendingUpdate(null);
          run(
            `check:${type}:${item.id}`,
            async () => {
              const result = await api.check(type, item.id);
              if (!result.hasUpdate) {
                return result.ahead ? `${item.name}：本地领先上游 ${result.ahead} 个提交，无需更新` : `${item.name} 已是最新（${result.current || '未知版本'}）`;
              }
              setPendingUpdate({ type, item, result });
              return type === 'git'
                ? `${item.name}：发现 ${result.commits || 1} 个新提交`
                : `${item.name}：发现新版本 ${result.current} → ${result.latest}`;
            },
            '检查更新'
          );
        },
        [api, run]
      );

      const installGitAndCheck = useCallback(
        async (item) => {
          if (gitInstall.status === 'running' || gitInstall.status === 'waiting') {
            setGitPrompt(null);
            setNotice({ kind: 'ok', text: 'Git 正在安装中，请稍候；其他功能仍可使用。' });
            return;
          }
          setGitPrompt(null);
          setGitInstalling(true);
          setGitInstall({
            status: 'running',
            stage: 'starting',
            percent: 3,
            message: '正在准备 winget…',
          });
          setNotice({
            kind: 'ok',
            text: '正在安装 Git for Windows。若弹出管理员确认，请允许；安装期间其他功能仍可使用。',
          });
          try {
            await api.hostAction('git', item.id, 'install');
            try {
              setGitInstall(await api.gitInstallStatus());
            } catch {
              // Ignore.
            }
            const next = await api.hostState();
            setHost({ status: 'ready', data: next, error: null });
            if (!next.capabilities || !next.capabilities.git) {
              throw new Error('Git 安装后仍未检测到，请重启 DSH 或手动安装 Git for Windows');
            }
            const result = await api.check('git', item.id);
            if (!result.hasUpdate) {
              setNotice({ kind: 'ok', text: `${item.name}：Git 已安装，当前已是最新` });
              return;
            }
            setPendingUpdate({ type: 'git', item, result });
            setNotice({
              kind: 'ok',
              text: `${item.name}：Git 已安装，发现 ${result.commits || 1} 个新提交`,
            });
            await load();
          } catch (err) {
            try {
              setGitInstall(await api.gitInstallStatus());
            } catch {
              // Ignore.
            }
            setNotice({
              kind: 'error',
              text: `安装 Git 失败：${err && err.message ? err.message : String(err)}`,
            });
          } finally {
            setGitInstalling(false);
          }
        },
        [api, gitInstall.status, load]
      );

      const applyPendingUpdate = useCallback(() => {
        const pending = pendingUpdate;
        if (!pending) return;
        setPendingUpdate(null);
        run(
          `update:${pending.type}:${pending.item.id}`,
          async () => {
            const output = await api.hostAction(
              pending.type,
              pending.item.id,
              'update',
              pending.result.ticket
            );
            return `${pending.item.name}：更新完成${output ? ` · ${output}` : ''}`;
          },
          '更新'
        );
      }, [api, pendingUpdate, run]);

      const counts = {
        dsh: dsh.length,
        tools: host.data ? host.data.tools.length : 0,
        codex: host.data ? host.data.codex.length : 0,
        git: host.data ? host.data.git.length : 0,
        downloads: host.data ? host.data.downloads.length : 0,
      };

      const sectionTabs = h(
        'div',
        { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
        SECTIONS.map((item) =>
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              onClick: () => {
                setSection(item.id);
                setNotice(null);
                setConfirming(null);
                setGitPrompt(null);
                setPendingUpdate(null);
              },
              style: {
                ...buttonStyle(section === item.id),
                borderRadius: 999,
                padding: '5px 11px',
              },
            },
            `${item.label}${counts[item.id] ? ` ${counts[item.id]}` : ''}`
          )
        )
      );

      const header = h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            },
          },
          h(
            'div',
            null,
            h('div', { style: { color: COLORS.text, fontSize: 14, fontWeight: 600 } }, 'GitHub 本地项目与工具'),
            h(
              'div',
              { style: { color: COLORS.tertiary, fontSize: 12, marginTop: 2 } },
              'DSH 插件、外部工具、Codex 插件、Git 项目、GitHub 源码包'
            )
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: load,
              disabled: busy !== null,
              style: buttonStyle(false),
            },
            '刷新'
          )
        ),
        sectionTabs
      );

      const noticeNode = notice
        ? h(
            'div',
            {
              style: {
                border: `1px solid ${notice.kind === 'error' ? COLORS.danger : COLORS.border}`,
                color: notice.kind === 'error' ? COLORS.danger : COLORS.text,
                background: COLORS.bg,
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                lineHeight: 1.5,
                overflowWrap: 'anywhere',
              },
            },
            notice.text
          )
        : null;

      const hostUnavailable =
        host.status === 'error'
          ? h(
              'div',
              {
                style: {
                  border: `1px dashed ${COLORS.border}`,
                  borderRadius: 8,
                  padding: 14,
                  color: COLORS.secondary,
                  fontSize: 12,
                  lineHeight: 1.6,
                },
              },
              noticesOf(host),
              h('br'),
              h('span', { style: { color: COLORS.tertiary } }, host.error || '')
            )
          : null;

      const scanError = host.data && host.data.errors && host.data.errors[section];
      const scanRoots = host.data && host.data.scanRoots;

      function renderDsh() {
        if (dshError) {
          return h('div', { style: { color: COLORS.danger, fontSize: 12 } }, dshError);
        }
        if (dsh.length === 0) {
          return h(
            'div',
            {
              style: {
                color: COLORS.secondary,
                fontSize: 13,
                lineHeight: 1.6,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 8,
                padding: 16,
              },
            },
            '没有检测到从 GitHub 安装的 DSH 插件。',
            h('br'),
            '在 Plugins 页面点“添加”，填入 github:owner/repo 后，这里会自动出现。'
          );
        }
        return dsh.map((item) =>
          h(
            'div',
            { key: item.name, style: cardStyle() },
            h(
              'div',
              { style: rowStyle() },
              h(
                'div',
                { style: { minWidth: 0 } },
                h('div', { style: titleStyle() }, item.name),
                h(
                  'div',
                  { style: metaStyle() },
                  item.version ? `v${item.version}` : '版本未知',
                  ' · ',
                  item.enabled ? '已启用' : '已停用'
                )
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 6, flex: 'none' } },
                item.updateSpec
                  ? h(
                      'button',
                      {
                        type: 'button',
                        disabled: busy !== null,
                        onClick: () => dshUpdate(item),
                        style: buttonStyle(true),
                      },
                      busy === `dsh:${item.name}` ? '处理中…' : '更新'
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: busy !== null || item.removable === false,
                    onClick: () => dshUninstall(item),
                    style: buttonStyle(false, confirming === `dsh:${item.name}`),
                  },
                  confirming === `dsh:${item.name}` ? '确认卸载' : '卸载'
                ),
                confirming === `dsh:${item.name}`
                  ? h(
                      'button',
                      {
                        type: 'button',
                        disabled: busy !== null,
                        onClick: () => setConfirming(null),
                        style: buttonStyle(false),
                      },
                      '取消'
                    )
                  : null
              )
            ),
            h('div', { style: sourceStyle() }, item.source || '')
          )
        );
      }

      function hostList(key) {
        if (host.status === 'loading') {
          return h('div', { style: { color: COLORS.secondary, fontSize: 13 } }, '正在扫描…');
        }
        if (host.status === 'error') return hostUnavailable;
        const items = host.data[key] || [];
        if (items.length === 0) {
          return h(
            'div',
            {
              style: {
                color: COLORS.secondary,
                fontSize: 13,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 8,
                padding: 16,
              },
            },
            key === 'downloads'
              ? '没有识别到 GitHub 源码包（仅匹配 *-main.zip / *-master.zip、文件名含 github，或目录含 .github/GitHub 仓库信息）。'
              : '这一类暂时没有条目。'
          );
        }
        const nodes = items.map((item) => {
          if (key === 'tools') {
            const protectedTool = item.protected || item.name === 'rea-agents';
            return h(
              'div',
              { key: item.id, style: cardStyle() },
              h(
                'div',
                { style: rowStyle() },
                h(
                  'div',
                  { style: { minWidth: 0 } },
                  h('div', { style: titleStyle() }, item.name),
                  h(
                    'div',
                    { style: metaStyle() },
                    item.version ? `v${item.version}` : '版本未知',
                    protectedTool ? ' · 被 Codex 使用，禁止卸载' : '',
                    item.bin ? ` · ${item.bin}` : ''
                  )
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, flex: 'none' } },
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => checkItem('tool', item),
                      style: buttonStyle(true),
                    },
                    busy === `check:tool:${item.id}` ? '检查中…' : '检查更新'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => hostAction('tool', item, 'open', '打开位置'),
                      style: buttonStyle(false),
                    },
                    '打开位置'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => copyPath(item.path),
                      style: buttonStyle(false),
                    },
                    '复制路径'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null || protectedTool,
                      onClick: () => hostAction('tool', item, 'uninstall', '卸载'),
                      style: buttonStyle(false, confirming === `host:tool:${item.id}`),
                      title: protectedTool ? '被 Codex 配置引用，不能直接卸载' : '',
                    },
                    confirming === `host:tool:${item.id}` ? '确认卸载' : '卸载'
                  )
                )
              ),
              h('div', { style: sourceStyle() }, item.repo || ''),
              h('div', { style: pathStyle() }, item.path)
            );
          }

          if (key === 'codex') {
            return h(
              'div',
              { key: item.id, style: cardStyle() },
              h(
                'div',
                { style: rowStyle() },
                h(
                  'div',
                  { style: { minWidth: 0 } },
                  h('div', { style: titleStyle() }, item.name),
                  h(
                    'div',
                    { style: metaStyle() },
                    `v${item.version}`,
                    item.enabled ? ' · 配置启用（缓存记录）' : ' · 配置停用（缓存记录）',
                    item.official ? ' · OpenAI 自带' : ''
                  )
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, flex: 'none' } },
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => hostAction('codex', item, 'open', '打开位置'),
                      style: buttonStyle(false),
                    },
                    '打开位置'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => copyPath(item.path),
                      style: buttonStyle(false),
                    },
                    '复制路径'
                  )
                )
              ),
              h('div', { style: sourceStyle() }, item.repo || item.marketplace),
              h('div', { style: pathStyle() }, item.path)
            );
          }

          if (key === 'git') {
            return h(
              'div',
              { key: item.id, style: cardStyle() },
              h(
                'div',
                { style: rowStyle() },
                h(
                  'div',
                  { style: { minWidth: 0 } },
                  h('div', { style: titleStyle() }, item.name),
                  h('div', { style: metaStyle() }, item.branch || 'Git 仓库')
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, flex: 'none' } },
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled:
                        busy !== null ||
                        gitInstalling ||
                        gitInstall.status === 'running' ||
                        gitInstall.status === 'waiting',
                      onClick: () => {
                        if (!host.data.capabilities.git) {
                          if (
                            gitInstall.status === 'running' ||
                            gitInstall.status === 'waiting'
                          ) {
                            setNotice({
                              kind: 'ok',
                              text: 'Git 正在安装中，请稍候；其他功能仍可使用。',
                            });
                            return;
                          }
                          setGitPrompt(item);
                          setNotice(null);
                          return;
                        }
                        checkItem('git', item);
                      },
                      style: buttonStyle(true),
                    },
                    busy === `check:git:${item.id}` ? '检查中…' : '检查更新'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => hostAction('git', item, 'open', '打开位置'),
                      style: buttonStyle(false),
                    },
                    '打开位置'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy !== null,
                      onClick: () => copyPath(item.path),
                      style: buttonStyle(false),
                    },
                    '复制路径'
                  )
                )
              ),
              h('div', { style: sourceStyle() }, item.repo),
              h('div', { style: pathStyle() }, item.path)
            );
          }

          return h(
            'div',
            { key: item.id, style: cardStyle() },
            h(
              'div',
              { style: rowStyle() },
              h(
                'div',
                { style: { minWidth: 0 } },
                h('div', { style: titleStyle() }, item.name),
                h(
                  'div',
                  { style: metaStyle() },
                  item.size ? fmtBytes(item.size) : '目录/源码包',
                  item.modified ? ` · ${new Date(item.modified).toLocaleString()}` : ''
                )
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 6, flex: 'none' } },
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: busy !== null,
                    onClick: () => hostAction('download', item, 'open', '打开位置'),
                    style: buttonStyle(false),
                  },
                  '打开位置'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: busy !== null,
                    onClick: () => copyPath(item.path),
                    style: buttonStyle(false),
                  },
                  '复制路径'
                )
              )
            ),
            h('div', { style: pathStyle() }, item.path)
          );
        });
        const prompt = key === 'git' && gitPrompt ? renderGitPrompt() : null;
        return h(React.Fragment, null, prompt, ...nodes);
      }

      function renderGitPrompt() {
        const item = gitPrompt;
        if (!item) return null;
        return h(
          'div',
          {
            style: {
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              background: COLORS.bg,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            },
          },
          h(
            'div',
            { style: { color: COLORS.text, fontSize: 13, fontWeight: 600 } },
            '未检测到 Git'
          ),
          h(
            'div',
            { style: { color: COLORS.secondary, fontSize: 12, lineHeight: 1.6 } },
            '检查 Git 项目更新需要 Git for Windows。是否现在安装？安装会调用 winget，可能需要 Windows 管理员确认。'
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 6 } },
            h(
              'button',
              {
                type: 'button',
                disabled: busy !== null || gitInstalling,
                onClick: () => installGitAndCheck(item),
                style: buttonStyle(true),
              },
              gitInstalling ? '安装中…' : '安装并检查'
            ),
            h(
              'button',
              {
                type: 'button',
                disabled: busy !== null || gitInstalling,
                onClick: () => setGitPrompt(null),
                style: buttonStyle(false),
              },
              '取消'
            )
          )
        );
      }

      function renderPendingUpdate() {
        const pending = pendingUpdate;
        if (!pending) return null;
        const result = pending.result || {};
        const title =
          pending.type === 'git'
            ? `发现 ${result.commits || 1} 个新提交`
            : `发现新版本 ${result.current} → ${result.latest}`;
        const detail =
          pending.type === 'git'
            ? `当前 ${result.current || '?'}，上游 ${result.latest || '?'}`
            : `当前 ${result.current || '?'}，npm 最新 ${result.latest || '?'}`;
        return h(
          'div',
          {
            style: {
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              background: COLORS.bg,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            },
          },
          h(
            'div',
            { style: { color: COLORS.text, fontSize: 13, fontWeight: 600 } },
            `${pending.item.name}：${title}`
          ),
          h(
            'div',
            { style: { color: COLORS.secondary, fontSize: 12, lineHeight: 1.6 } },
            `${detail}。是否现在更新？`
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 6 } },
            h(
              'button',
              {
                type: 'button',
                disabled: busy !== null,
                onClick: applyPendingUpdate,
                style: buttonStyle(true),
              },
              busy ? '处理中…' : '更新'
            ),
            h(
              'button',
              {
                type: 'button',
                disabled: busy !== null,
                onClick: () => setPendingUpdate(null),
                style: buttonStyle(false),
              },
              '取消'
            )
          )
        );
      }

      function renderGitInstall() {
        const state = gitInstall;
        if (!state || state.status === 'idle' || state.status === 'done') return null;
        const failed = state.status === 'error';
        const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
        return h(
          'div',
          {
            style: {
              border: `1px solid ${failed ? COLORS.danger : COLORS.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              background: COLORS.bg,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              },
            },
            h(
              'div',
              { style: { color: failed ? COLORS.danger : COLORS.text, fontSize: 13, fontWeight: 600 } },
              failed ? 'Git 安装失败' : '正在安装 Git for Windows'
            ),
            failed
              ? h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setGitInstall({ status: 'idle', percent: 0, message: '' }),
                    style: buttonStyle(false),
                  },
                  '关闭'
                )
              : h(
                  'span',
                  { style: { color: COLORS.tertiary, fontSize: 12 } },
                  `${percent}%`
                )
          ),
          failed
            ? null
            : h(
                'div',
                {
                  style: {
                    height: 6,
                    borderRadius: 999,
                    background: 'rgba(127,127,127,.18)',
                    overflow: 'hidden',
                  },
                },
                h('div', {
                  style: {
                    height: '100%',
                    width: `${percent}%`,
                    background: COLORS.accent,
                    transition: 'width .3s ease',
                  },
                })
              ),
          h(
            'div',
            { style: { color: COLORS.secondary, fontSize: 12, lineHeight: 1.6 } },
            state.message || '正在准备…'
          ),
          h(
            'div',
            { style: { color: COLORS.tertiary, fontSize: 11, lineHeight: 1.5 } },
            failed
              ? '也可以手动安装：https://git-scm.com/download/win'
              : '安装期间其他功能仍可使用；如果弹出 Windows 管理员确认，请允许。'
          ),
          failed && state.error
            ? h(
                'div',
                {
                  style: {
                    color: COLORS.tertiary,
                    fontSize: 11,
                    lineHeight: 1.5,
                    maxHeight: 90,
                    overflow: 'auto',
                    overflowWrap: 'anywhere',
                  },
                },
                state.error
              )
            : null
        );
      }

      let body = null;
      if (section === 'dsh') body = renderDsh();
      else if (section === 'tools') body = hostList('tools');
      else if (section === 'codex') body = hostList('codex');
      else if (section === 'git') body = hostList('git');
      else body = hostList('downloads');

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 24px' } },
        header,
        noticeNode,
        scanError ? h('div', { role: 'alert', style: { color: COLORS.danger, fontSize: 12 } }, `此分类扫描失败：${scanError}。请检查目录权限后刷新。`) : null,
        scanRoots && (section === 'git' || section === 'downloads')
          ? h('details', { style: { color: COLORS.secondary, fontSize: 12 } }, h('summary', null, '查看扫描范围'), (scanRoots[section] || []).join('；') || '没有可扫描的目录') : null,
        pendingUpdate &&
        ((pendingUpdate.type === 'git' && section === 'git') ||
          (pendingUpdate.type === 'tool' && section === 'tools'))
          ? renderPendingUpdate()
          : null,
        section === 'git' ? renderGitInstall() : null,
        dshError
          ? h(
              'div',
              {
                style: {
                  color: COLORS.danger,
                  fontSize: 12,
                  lineHeight: 1.6,
                },
              },
              `DSH 插件读取失败：${dshError}`
            )
          : null,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, body),
        h(
          'div',
          { style: { color: COLORS.tertiary, fontSize: 11, lineHeight: 1.5, marginTop: 4 } },
          '更新/卸载会调用对应管理器；Git 项目删除、源码包删除暂未开放，避免误删。'
        )
      );
    }

    function cardStyle() {
      return {
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      };
    }

    function rowStyle() {
      return {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      };
    }

    function titleStyle() {
      return {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: 600,
        overflowWrap: 'anywhere',
      };
    }

    function metaStyle() {
      return { color: COLORS.tertiary, fontSize: 12, marginTop: 2 };
    }

    function sourceStyle() {
      return {
        color: COLORS.secondary,
        fontSize: 12,
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      };
    }

    function pathStyle() {
      return {
        color: COLORS.tertiary,
        fontSize: 11,
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      };
    }

    return {
      inject: ['slots', 'connection', 'remote', 'remote.pluginManager', 'remote.pluginInventory'],
      apply(ctx) {
        async function request(endpoint, payload, timeout = 150000) {
          const control = new AbortController();
          const timer = setTimeout(() => control.abort(), timeout);
          try { return remoteValue(await ctx.connection.rpc.call('/api', 'githubManager/' + endpoint, payload, control.signal), '宿主请求失败'); }
          catch (error) { if (control.signal.aborted) throw new Error('请求超时；操作可能仍在继续，请刷新确认状态'); throw error; }
          finally { clearTimeout(timer); }
        }
        const api = {
          async list() {
            const inventory = await ctx.remote.pluginInventory.list();
            const value = remoteValue(inventory, '读取插件清单失败');
            if (!value || value.managementAvailable !== true) {
              throw new Error('当前 profile 不支持插件管理');
            }
            const bundles = remoteValue(
              await ctx.remote.pluginManager.listBundles(),
              '读取 bundle 列表失败'
            );
            return (bundles || [])
              .filter((bundle) => isGitHubSource(bundle.source))
              .map((bundle) => ({
                name: bundle.name,
                version: bundle.version,
                source: bundle.source,
                enabled: bundle.enabled === true,
                removable: bundle.removable !== false,
                updateSpec: updateSpec(bundle.source),
              }));
          },

          async update(name, spec, enabled) {
            const installed = await ctx.remote.pluginManager.installBundle(spec, {
              enabled: enabled === true,
            });
            const value = remoteValue(installed, '安装新版本失败');
            if (value && value.application === 'failed') {
              const message = value.error && (value.error.message || value.error.diagnostic || value.error.code);
              throw new Error(message || '安装失败');
            }
            return value;
          },

          async uninstall(name) {
            const value = remoteValue(
              await ctx.remote.pluginManager.removeBundle(name),
              '卸载失败'
            );
            if (value && value.application === 'failed') {
              const message = value.error && (value.error.message || value.error.diagnostic || value.error.code);
              throw new Error(message || '卸载失败');
            }
            return value;
          },

          async hostState() { return request('state', { refresh: true }); },
          async check(type, id) { return request('check', { type, id }); },
          async gitInstallStatus() { return request('git-install', {}); },
          async hostAction(type, id, action, ticket) {
            const value = await request('action', { type, id, action, ...(ticket ? { ticket } : {}) }, 330000);
            return value && value.output ? value.output : '';
          },
        };

        ctx.slots.inject('plugins.tab', () =>
          ctx.slots.register(
            {
              name: 'plugins.tab',
              id: 'github',
              label: 'GitHub',
              order: 10,
              inject: () => ({ api }),
            },
            GitHubTab
          )
        );
      },
    };
  },
});
