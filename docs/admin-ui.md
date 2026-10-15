# 管理界面与数据展示

后台入口为 `tree.teamcn.org`，构建输出仍是 `apps/admin/out`。主站与后台使用同一套业务接口；本次 UI 改版不新增数据库、账本或统计数据源。

- `AdminShell` 提供唯一的侧栏、顶部工具栏和可滚动工作区；手机使用原生对话框抽屉，支持 Escape 和焦点恢复。
- 当前栏目与内容状态保存在 URL hash，例如 `#posts?status=draft`，刷新和浏览器前后退均可恢复。导航按用户权限裁剪，实际授权继续由服务端执行。
- `components/data` 中的 Nivo SVG 图表按需加载。柱状图用于比较、堆叠图用于内容状态、环形图用于构成；保持数值表和文本状态，不只依赖颜色。没有历史数据时不展示趋势。
- TanStack Table 统一内容、用户、审计与积分流水；内容搜索及分页继续由现有 RPC 执行，表格本地排序和筛选仅覆盖已加载记录。
- 精确余额始终保留整数最小单位，金额展示继续使用 `formatPoints`。构成图只使用比例，提示和数值列表显示原始精确金额。
- Recharts 与直接依赖 react-is 已卸载，不保留备用图表实现。Nivo 主题与共享 CSS 变量同步，五种语言复用同一组件。

验证入口：`npm run typecheck`、`npm run build`、`npm run build:admin`、`npm run typecheck:admin`、`npm test`、`AUTH_FIXTURES=1 npm run test:browser`。浏览器测试使用本地构建产物和隔离接口，不写入线上数据。
