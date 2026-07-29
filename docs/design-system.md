# PlotPop 设计系统规范

## 1. 文档地位

本文档是 PlotPop Web 产品视觉与交互实现的唯一设计规范。

所有页面、组件、状态、响应式布局和主题必须引用本文档定义的 Token、组件 Variant 与交互规则。开发者或 Agent 不得在业务代码中自行创造颜色、字号、间距、圆角、阴影、动画时长或状态样式。

如现有规范无法覆盖新需求，必须先：

1. 提出新增 Token 或 Variant 的使用场景。
2. 检查能否组合现有 shadcn/ui 组件解决。
3. 更新本文档和设计 Token。
4. 添加 Light、Dark、响应式和无障碍验证。
5. 再在业务组件中使用。

禁止以“仅此页面使用”为理由绕过设计系统。

## 2. 设计原则

### 2.1 Creator First

界面服务于漫剧创作流程。视觉表达需要活泼，但不能干扰脚本、分镜、镜头状态和成本信息的阅读。

### 2.2 Pop Anime

品牌使用明快色块、漫画式轮廓、紧凑投影、圆润几何和有节奏的排版。品牌表达集中在导航、关键操作、空状态和创作成果，不覆盖所有表面。

### 2.3 Semantic Before Decorative

颜色、排版和层级必须先表达信息语义，再承担装饰作用。状态不能只通过颜色表达。

### 2.4 Progressive Complexity

新用户优先看到当前任务和下一步操作；高级参数按需展开。不得为了展示功能数量而增加首屏密度。

### 2.5 Accessible by Default

Light 与 Dark 均满足 WCAG 2.2 AA。键盘、焦点、动态效果降级和屏幕阅读器支持属于组件完成标准。

## 3. 技术实现边界

- UI 框架：React + Next.js。
- 样式：Tailwind CSS。
- 组件：shadcn/ui。
- 条件类：`cn()`。
- 主题：CSS Variables + HTML Theme Attribute。
- Theme 值：`system | light | dark`。
- 业务组件只能使用语义 Token、已批准的 Tailwind Utility 和组件 Variant。
- shadcn/ui 源码统一位于 `packages/ui`。
- 业务应用不得复制 shadcn/ui 组件源码。

Token 的实现是 `packages/ui/src/styles/theme.css`，`apps/web/app/globals.css` 只负责引入它。Tailwind 没有时长、描边宽度和焦点 Ring 的 Theme 命名空间，所以 §9.2 与 §10 的这几个 Token 以 Utility 形式提供：`duration-instant | fast | normal | slow`、`stroke-hairline | ink | ink-bold`、`focus-ring`。`stroke-ink` 自带 §9.2 的主题差异（Light 用 `brand-ink`，Dark 用 `border`），业务组件因此不需要写 `dark:` 覆盖。

Primitive 层统一使用 `--pp-` 前缀，且不映射成任何 Tailwind Utility，所以业务代码无法引用到基础色阶（§4.1）。

## 4. Token 架构

设计 Token 分为三层。

### 4.1 Primitive Token

定义基础尺度，不直接表达业务含义：

- 基础色阶。
- 字体家族与字号尺度。
- 字重与行高。
- 间距尺度。
- 圆角尺度。
- 描边尺度。
- 阴影尺度。
- 动效时长和缓动。
- 断点与容器宽度。

业务组件不得直接使用基础色阶。Primitive 只能用于构建 Semantic Token。

### 4.2 Semantic Token

表达跨组件语义：

- Canvas、Surface、Overlay。
- Primary、Secondary、Accent、Muted。
- Foreground、Muted Foreground、Inverse Foreground。
- Border、Input、Focus Ring。
- Success、Warning、Danger、Info。
- Selected、Hover、Pressed、Disabled。
- Chart 与媒体背景。

业务组件优先使用 Semantic Token。

Chart Token 尚未定义取值：第一个图表出现时按 §17 走例外流程补齐，并纳入 §6.6 的对比度验证。媒体背景见 §6.5。

### 4.3 Component Token

只在跨页面稳定复用且 Semantic Token 无法准确表达时创建，例如：

- Scene Card。
- Shot Card。
- Timeline Track。
- Credit Cost。
- Generation Status。
- Video Preview。

Component Token 数量必须受控，不得为单个页面创建一次性 Token。

## 5. 主题模式

### 5.1 三态行为

- `system`：跟随 `prefers-color-scheme`，是首次访问默认值。
- `light`：固定使用亮色主题。
- `dark`：固定使用暗色主题。

未登录用户的选择保存在本地。登录用户的选择保存到账户偏好并跨设备同步。账户偏好优先于本地偏好；用户退出后恢复本地选择。

主题切换不得刷新页面，不得重置编辑状态。

### 5.2 首屏与 SSR

- 在浏览器首次绘制前解析主题。
- 服务端输出、主题属性和客户端 Hydration 必须使用同一套约定。
- 根节点通过稳定属性标识主题。
- 禁止先渲染 Light 再切换 Dark。
- Theme Switcher 在 Hydration 前不得显示错误的选中状态。

### 5.3 Light 主题

- 使用暖白 Canvas，降低长时间创作的冷硬感。
- Surface 保持清晰的白色或浅暖灰层级。
- 主要文字使用近墨黑，不使用纯黑覆盖所有文本。
- 品牌粉、蓝、绿、黄可以用于关键操作、选中项与结果强调。
- 漫画式深色描边与紧凑投影可用于品牌组件和关键卡片。

### 5.4 Dark 主题

- Canvas 使用深蓝黑或深紫黑，不使用纯黑填满所有区域。
- Surface 使用逐级抬升的紫灰表面。
- 正文使用暖白，次要文字使用低对比紫灰。
- 大面积品牌色转为低亮度染色表面；高亮品牌色只用于文字、图标、焦点和小面积强调。
- Light 中的重墨描边转为较柔和的语义 Border。
- 投影降低不透明度，主要依靠表面层级与边框区分。
- 视频预览和时间线媒体区域保持中性深色。

## 6. 色彩语义

必须定义并使用以下语义变量。取值为 sRGB Hex，Light 与 Dark 逐一对应。

业务代码只消费变量名，不得引用本节的字面值 —— 本节是 Token 的定义处，不是可复制的调色板。

### 6.1 表面与文字

| 变量 | Light | Dark | 用途 |
|---|---|---|---|
| `background` | `#FFF8F0` | `#12101C` | 页面 Canvas。Light 为暖白，Dark 为深紫黑 |
| `foreground` | `#1A1725` | `#F5F0EA` | 正文。Light 为带紫调的近墨黑，Dark 为暖白 |
| `surface` | `#FFFDFA` | `#1A1728` | Canvas 之上的基础表面 |
| `surface-raised` | `#FFFFFF` | `#241F35` | 抬升表面，用于卡片与浮起区域 |
| `surface-sunken` | `#F5EDE1` | `#0D0B14` | 下沉表面，用于内嵌区与轨道槽 |
| `card` | `#FFFFFF` | `#1A1728` | Card 背景 |
| `card-foreground` | `#1A1725` | `#F5F0EA` | Card 文字 |
| `popover` | `#FFFFFF` | `#241F35` | 弹层背景 |
| `popover-foreground` | `#1A1725` | `#F5F0EA` | 弹层文字 |

Dark 的三级表面构成 `#0D0B14 → #1A1728 → #241F35` 的抬升阶梯，层级依靠表面差与 Border 表达，不依靠投影（§5.4）。

### 6.2 交互色

| 变量 | Light | Dark | 用途 |
|---|---|---|---|
| `primary` | `#D6115F` | `#FF4D8D` | 主要操作填充，取品牌粉 |
| `primary-foreground` | `#FFFFFF` | `#25060F` | 主按钮文字。Dark 下为深色文字压在亮粉上 |
| `secondary` | `#F1E9DE` | `#241F35` | 次要操作填充 |
| `secondary-foreground` | `#2A2438` | `#EDE7F5` | 次要按钮文字 |
| `accent` | `#1B49E5` | `#7FA0FF` | 强调与选中，取品牌蓝 |
| `accent-foreground` | `#FFFFFF` | `#0A1030` | 强调面上的文字 |
| `muted` | `#F3EDE4` | `#241F35` | 低强度填充 |
| `muted-foreground` | `#5C5470` | `#A79DBA` | 次要文字 |

Dark 的 `primary` 与 `accent` 提亮并改用深色前景，符合 §5.4「大面积品牌色转为低亮度染色表面，高亮品牌色只用于文字、图标、焦点和小面积强调」。

### 6.3 边框与焦点

| 变量 | Light | Dark | 用途 |
|---|---|---|---|
| `border` | `#E3D5C1` | `#322B47` | 装饰性分隔线与表面描边 |
| `input` | `#8A7F6D` | `#756A99` | 输入控件轮廓 |
| `ring` | `#1B49E5` | `#7FA0FF` | 焦点 Ring |

`border` 与 `input` 必须是两个变量，不得互相替代：`border` 只承担装饰分隔，`input` 用于标识输入控件边界，受 WCAG 2.2 SC 1.4.11 的 3:1 非文字对比度约束。把输入框描边降级成 `border` 会直接违反 §15。

### 6.4 状态色

| 变量 | Light | Dark | 用途 |
|---|---|---|---|
| `destructive` | `#C81E2E` | `#FF6B6B` | 危险操作与失败 |
| `destructive-foreground` | `#FFFFFF` | `#2B0808` | 危险面上的文字 |
| `success` | `#0E7A3D` | `#3DD68C` | 完成 |
| `success-foreground` | `#FFFFFF` | `#042413` | 完成面上的文字 |
| `warning` | `#8A5A00` | `#FFC93C` | 需要注意与待审阅 |
| `warning-foreground` | `#FFFFFF` | `#2B1D00` | 注意面上的文字 |
| `info` | `#1B5FCC` | `#7FA0FF` | 中性信息与进行中 |
| `info-foreground` | `#FFFFFF` | `#0A1030` | 信息面上的文字 |

### 6.5 媒体

| 变量 | Light | Dark | 用途 |
|---|---|---|---|
| `preview` | `#14131A` | `#0F0E14` | 视频预览与时间线媒体区背景 |
| `preview-foreground` | `#F5F3F7` | `#F5F3F7` | 覆盖在预览之上的文字与控件 |

`preview` 在两种主题下都保持中性深色（§5.4、§13），避免主题色影响用户对成片画面的判断。

### 6.6 对比度基线

上表所有取值按 WCAG 2.2 AA 逐对验证，Light 45 组、Dark 49 组，共 94 组全部通过。基线为：

- 正文与前景 / 背景组合：≥ 4.5:1。
- 输入轮廓、焦点 Ring、状态填充边缘对 Canvas：≥ 3:1（SC 1.4.11）。
- 品牌色作为文字使用时：≥ 4.5:1。

实测的最低余量集中在以下几处，修改这些值时必须重新验证：

| 组合 | 实测 | 下限 |
|---|---|---|
| Dark `input` on `surface-raised` | 3.23 | 3.0 |
| Dark `input` on `surface` | 3.57 | 3.0 |
| Light `brand-pink` on `background` | 4.86 | 4.5 |
| Light `primary-foreground` on `primary` | 5.12 | 4.5 |

修改任何色值必须重新跑完整验证，不接受只核对被改动的那一对 —— 表面阶梯与状态色共用 Canvas 作为参照，改一个背景会同时影响十余组。

这项验证由 `packages/ui/src/styles/theme.test.ts` 执行，它直接解析 `theme.css` 并逐对计算，因此没有第二份色值表可以与实现脱节。**该测试是本节数值的权威来源**；表里的数字是它的输出，改色值后以测试结果为准并回填本表。§18 要求的 CI 执行由 `pnpm test:coverage` 满足。

同一份测试还钉住三条只能在 Token 层表达的规则：Light 与 Dark 的语义 Token 必须一一对应（缺一个不会构建失败，只会渲染成不可见元素）、`shadow-pop-*` 在 Dark 解析为 `none`、以及 `stroke-ink` 的颜色在 Dark 换成 `border`。

### 6.7 品牌扩展色

| 变量 | Light | Dark | Light 用法 |
|---|---|---|---|
| `brand-pink` | `#D6115F` | `#FF6BA3` | 文字与填充 |
| `brand-blue` | `#1B49E5` | `#8FB0FF` | 文字与填充 |
| `brand-lime` | `#7ED321` | `#9BE33D` | **仅填充** |
| `brand-yellow` | `#FFC93C` | `#FFD466` | **仅填充** |
| `brand-ink` | `#14121C` | `#F5F0EA` | 漫画式描边与填充上的文字 |

Light 的 `brand-lime` 与 `brand-yellow` 是**仅填充**色：它们对暖白 Canvas 的边缘对比度分别只有 1.78:1 和 1.55:1，达不到 3:1，因此这两种填充**必须**带 `brand-ink` 描边，由描边而不是填充本身提供可识别边界。这正是 §9.2 要求品牌卡片与主要 CTA 使用漫画式强调描边的对比度依据。两者承载 `brand-ink` 文字分别为 9.91:1 和 12.07:1。

保留鲜亮的 Lime 与 Yellow 而不是压暗成合规的深绿、深琥珀，是为了不牺牲 Pop Anime 的视觉语言；代价是这两个色值在 Light 下不能用作文字，也不能脱离描边单独作为填充使用。

Dark 下四个品牌色均可作为文字使用（最低 7.06:1）。注意 `brand-ink` 在 Dark 是暖白而不是墨黑，所以「`brand-ink` 文字压在 Lime / Yellow 填充上」这一组合只存在于 Light；Dark 按 §5.4 把这两个亮色留给文字、图标与小面积强调，不用作大面积填充。

品牌色不得直接表示成功、失败或警告。业务状态使用对应语义状态 Token。

### 6.8 状态表达

每个状态必须至少同时具备两种表达：

- 文字标签。
- 图标。
- 颜色。
- 形状或边框。

禁止仅通过红、黄、绿区分任务状态。

## 7. 排版

排版角色：

- Display：官网和关键空状态的品牌标题。
- Heading：页面、区域和卡片标题。
- Body：正文和表单说明。
- Label：字段、状态和紧凑操作。
- Mono：任务 ID、时间码、技术数据和金额明细。

### 7.1 字体家族

| Token | 字体 | 承载角色 |
|---|---|---|
| `font-display` | Outfit | Display |
| `font-sans` | Inter | Heading、Body、Label |
| `font-mono` | JetBrains Mono | Mono |

品牌个性集中在 `font-display`，应用界面的标题与正文统一使用 `font-sans`。这是 §2.1 的直接结果：Pop Anime 的活泼表达不能干扰脚本、分镜与成本信息的阅读，所以 Episode Studio 内不出现 Display 字体。

三个字体均须自托管，通过 `next/font` 引入并预加载，不得运行时请求第三方字体域。Inter 与 JetBrains Mono 必须启用 `font-variant-numeric: tabular-nums`，以满足 §7 对金额、积分、时间码和进度数字的等宽要求。

### 7.2 字号尺度

根字号为 16px。下表是唯一允许的字号档位，业务组件不得使用任意值字号。

| Token | 字号 | 行高 | 字重 | 用途 |
|---|---|---|---|---|
| `text-display-lg` | 3.5rem | 1.05 | 800 | 官网首屏主标题 |
| `text-display-md` | 2.75rem | 1.10 | 800 | 官网区域标题 |
| `text-display-sm` | 2.25rem | 1.15 | 700 | 关键空状态标题 |
| `text-heading-lg` | 1.875rem | 1.25 | 700 | 页面标题 |
| `text-heading-md` | 1.5rem | 1.30 | 600 | 区域标题 |
| `text-heading-sm` | 1.25rem | 1.35 | 600 | 卡片标题 |
| `text-heading-xs` | 1.125rem | 1.40 | 600 | 密集区块标题、Inspector 分组 |
| `text-body-lg` | 1.125rem | 1.60 | 400 | 引导性正文 |
| `text-body-md` | 1rem | 1.60 | 400 | 默认正文 |
| `text-body-sm` | 0.875rem | 1.55 | 400 | 辅助说明、表单帮助文字 |
| `text-label-md` | 0.875rem | 1.40 | 500 | 字段标签、按钮 |
| `text-label-sm` | 0.8125rem | 1.35 | 500 | Badge、紧凑操作 |
| `text-label-xs` | 0.75rem | 1.30 | 600 | 元数据、表头 |
| `text-mono-md` | 0.875rem | 1.50 | 400 | 金额明细、任务 ID |
| `text-mono-sm` | 0.8125rem | 1.45 | 400 | 时间码、时间线刻度 |

字重只使用 400、500、600、700、800 五档。800 仅供 Display 使用。

`text-label-xs` 是可用于可见文案的最小档位。它已是 12px，配合 §15 的缩放要求不得再向下新增档位；密集模式按 §13 只能压缩间距，不能继续缩小字号。

### 7.3 阅读行长

正文容器最大宽度为 `68ch`。超过该宽度的长文本区域必须收窄，不得让正文铺满宽屏 Canvas —— 这条对官网与向导说明文字同样适用。

### 7.4 约束

- 字号、行高和字重只能使用预设尺度。
- 不得在业务组件中使用任意值字号。
- 正文必须保持适合英文界面的阅读行长。
- 金额、积分、时间码和进度数字使用等宽数字特性。
- 标题层级必须符合文档结构，不得仅通过视觉字号模拟。

## 8. 间距与布局

- 使用统一的 4px 基础间距尺度。
- 组件内部与组件之间只能使用已批准的间距 Token。
- Flex 和 Grid 使用 `gap-*`；禁止使用 `space-x-*` 与 `space-y-*`。
- 相同宽高使用 `size-*`。
- 布局不得使用无规范的负 Margin 修补。
- 页面使用统一 Container 与横向 Padding。
- Episode Studio 可以使用全宽工作区，但仍需遵循区域间距和最小宽度。

### 8.1 间距档位

基础尺度为 4px，与 Tailwind 默认刻度对齐，因此不引入自定义间距尺度。已批准使用的档位是它的一个子集：

| Token | 值 | 典型用途 |
|---|---|---|
| `1` | 4px | 图标与标签之间 |
| `2` | 8px | 紧凑控件内部 |
| `3` | 12px | 表单字段内部 |
| `4` | 16px | 卡片内部默认间距 |
| `6` | 24px | 卡片之间、区块内部 |
| `8` | 32px | 区块之间 |
| `12` | 48px | 页面区域之间 |
| `16` | 64px | 官网区块之间 |
| `24` | 96px | 官网首屏留白 |

只使用上表档位。需要 `5`、`7`、`9` 这类中间值时，说明布局层级本身有问题，应先调整层级而不是取中间间距。

### 8.2 断点与响应式层级

| 层级 | 断点 | Tailwind 前缀 | 能力 |
|---|---|---|---|
| Small | < 768px | 默认 | 进度查看、审阅与简单批准 |
| Medium | ≥ 768px | `md:` | 完整向导和简化 Studio |
| Large | ≥ 1280px | `xl:` | 完整 Episode Studio 三栏布局 |

层级只使用这两个断点。`sm:`、`lg:`、`2xl:` 不参与页面级布局决策，避免出现第四种事实上的布局形态。

### 8.3 容器宽度

| Token | 最大宽度 | 用途 |
|---|---|---|
| `container-prose` | 68ch | 正文与说明文字（§7.3） |
| `container-form` | 40rem | 向导单步表单、账户设置 |
| `container-app` | 80rem | Creator Home、列表与明细页 |
| `container-marketing` | 90rem | 官网与案例页 |
| — | 无限制 | Episode Studio 工作区 |

页面横向 Padding：Small 为 `4`，Medium 及以上为 `6`。

### 8.4 Episode Studio 最小宽度

三栏布局在 Large 层级下的最小宽度：Scene Navigator 240px，Inspector 320px，Preview 占据剩余空间且不小于 480px。可用宽度不足以同时满足三者时，按 §13 降级为 Medium 的简化 Studio，而不是继续压缩栏宽。

不得在 Small 屏幕上强行压缩完整时间线。

## 9. 圆角、描边与阴影

### 9.1 圆角

只使用以下四档。相同组件在不同页面不得改变圆角。

| Token | 值 | 用途 |
|---|---|---|
| `radius-sm` | 6px | 输入控件、Badge、紧凑按钮 |
| `radius-md` | 10px | 按钮、Card、弹层 |
| `radius-lg` | 16px | 品牌卡片、空状态容器、媒体框 |
| `radius-pill` | 9999px | Chip、Avatar、纯图标按钮 |

### 9.2 描边

| Token | 值 | 用途 |
|---|---|---|
| `stroke-hairline` | 1px | 基础表面与分隔线，使用 `border` |
| `stroke-ink` | 2px | 品牌卡片与主要 CTA 的漫画式描边，使用 `brand-ink` |
| `stroke-ink-bold` | 3px | 官网首屏与关键空状态的品牌强调 |

规则：

- 基础表面使用语义 Border。
- 品牌卡片和主要 CTA 可以使用漫画式强调描边。
- 使用品牌填充色时，`stroke-ink` 是**必需**而非装饰：Light 的 `brand-lime` 与 `brand-yellow` 边缘对比度不足 3:1，边界由描边提供（§6.7）。
- Dark 模式的强调描边改用 `border` 而非 `brand-ink`，降低边界噪声（§5.4）。
- 焦点 Ring 不得被描边或 Overflow 隐藏。

焦点 Ring 固定为 2px `ring` 加 2px 偏移，两种主题一致。偏移使 Ring 与组件自身描边分离，避免在带 `stroke-ink` 的品牌按钮上与描边混成一条粗边。

### 9.3 阴影

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `shadow-pop-sm` | `2px 2px 0 brand-ink` | 不使用 | 品牌卡片、主要 CTA |
| `shadow-pop-md` | `4px 4px 0 brand-ink` | 不使用 | 官网品牌卡片、关键空状态 |
| `shadow-raised` | `0 1px 2px rgb(26 23 37 / 0.08)` | `0 1px 2px rgb(0 0 0 / 0.32)` | 抬升表面 |
| `shadow-overlay` | `0 8px 24px rgb(26 23 37 / 0.12)` | `0 8px 24px rgb(0 0 0 / 0.44)` | Dialog、Popover、Dropdown |

规则：

- `shadow-pop-*` 是无模糊的硬阴影，只在 Light 使用。Dark 下这两个 Token 解析为 `none`，层级改由 §6.1 的三级表面阶梯与 `border` 表达（§5.4）。
- 弹层使用 shadcn/ui 自身的层级，不得手写 Z-Index。
- 不得通过多个重阴影制造层级。一个元素最多一个阴影 Token。

## 10. 动效

动效 Token：

| Token | 时长 | 缓动 | 用途 |
|---|---|---|---|
| `duration-instant` | 75ms | `ease-out` | 状态立即反馈、Checkbox、Radio |
| `duration-fast` | 150ms | `ease-out` | Hover、Pressed、Tooltip、主题颜色过渡 |
| `duration-normal` | 250ms | `ease-emphasized` | 折叠、切换、局部面板 |
| `duration-slow` | 400ms | `ease-emphasized` | 页面级或成果展示过渡 |

缓动曲线：

| Token | 值 | 用途 |
|---|---|---|
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | 进入与状态反馈 |
| `ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | 空间关系变化 |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | 退出与消失 |

规则：

- 动效只用于解释状态变化和空间关系。
- 禁止为持续生成进度使用干扰阅读的循环装饰动画。
- 加载使用 Skeleton、Spinner 或 Progress。
- 遵循 `prefers-reduced-motion`；减少或移除非必要位移和缩放。
- 主题切换只允许短暂颜色过渡，使用 `duration-fast`，且只过渡颜色属性，不允许整页闪烁。

`prefers-reduced-motion: reduce` 下的具体降级：位移、缩放和旋转一律移除；透明度与颜色过渡保留但统一降到 `duration-instant`；Spinner 与 Progress 的循环动画保留，因为它们承载「仍在进行」这一必要信息，移除会让长时间生成看起来像卡死。

## 11. shadcn/ui 组件规范

### 11.1 优先使用现有组件

添加自定义组件前必须：

1. 检查 `packages/ui` 已安装组件。
2. 使用 shadcn/ui CLI 搜索注册表。
3. 查看组件文档和示例。
4. 判断能否通过组合现有组件完成。

### 11.2 表单

- 表单布局使用 `FieldGroup` 与 `Field`。
- 输入组合使用 `InputGroup` 与对应 Input。
- 2–7 个互斥或多选项优先使用 `ToggleGroup`。
- 相关选项使用 `FieldSet` 与 `FieldLegend`。
- `Field` 使用 `data-invalid`，输入控件使用 `aria-invalid`。
- Zod 错误映射到字段级消息和表单级摘要。

### 11.3 反馈

- 提示使用 Alert。
- 空状态使用 Empty。
- 加载占位使用 Skeleton。
- 操作中使用 Spinner 与禁用按钮。
- 进度使用 Progress。
- Toast 使用 Sonner。
- 状态标签使用 Badge Variant。

### 11.4 弹层与导航

- Dialog、Sheet、Drawer 必须包含可访问标题。
- Tabs Trigger 必须位于 Tabs List 中。
- 菜单和选择项必须位于对应 Group 中。
- Avatar 必须包含 Fallback。
- 危险操作使用 Alert Dialog，并明确影响范围。

### 11.5 图标

- 使用项目在 shadcn 配置中确定的统一图标库。
- 按钮内图标使用 `data-icon`。
- 组件内图标尺寸由组件控制，不在调用处硬编码。
- 图标作为组件对象传递，不使用字符串映射。
- 单独图标按钮必须有可访问名称和 Tooltip。

## 12. 核心组件语义

### 12.1 Button

允许的语义 Variant：

- Primary：当前流程的主要下一步。
- Secondary：次要且安全的操作。
- Outline：工具栏与低优先级操作。
- Ghost：导航与紧凑上下文操作。
- Destructive：删除、取消付费任务等危险操作。

每个页面区域最多一个视觉主按钮。生成按钮必须同时显示成本或在确认弹层中明确成本。

### 12.2 Card

必须使用完整 Card 结构：

- Card Header。
- Card Title。
- Card Description。
- Card Content。
- 需要时使用 Card Footer。

Scene Card 和 Shot Card 通过正式 Variant 扩展，不通过页面 Class 覆盖颜色。

### 12.3 Badge

用于任务状态、质量档位、版本和警告。Badge 文案必须可理解，不能只显示颜色圆点。

### 12.4 Generation Status

统一状态：

- Draft。
- Queued。
- Generating。
- Needs Review。
- Completed。
- Failed。

每个状态定义：

- Label。
- Icon。
- Semantic Color。
- 可用操作。
- 是否允许取消、重试或编辑。

页面不得自行创造状态名称或颜色。

### 12.5 Credit Cost

任何可能消费积分的操作使用统一 Credit Cost 组件，展示：

- 预计积分。
- 是否为区间。
- 当前余额是否足够。
- 费用变化原因。
- 是否需要再次确认。

不得使用普通文本在不同页面重复实现费用表达。

## 13. Episode Studio 专用规范

- Scene Navigator、Preview、Timeline、Inspector 使用稳定区域结构。
- 当前场景、当前镜头和当前批准版本必须有不同但一致的状态表达。
- 视频预览背景在两种主题下使用 `preview` Token。
- Timeline Track、Clip、Playhead 和 Selection 使用专用 Component Token。
- 时间码使用统一 Mono 排版。
- 失败镜头不阻断其他镜头的浏览。
- Inspector 表单遵循统一 Field 规范。
- 密集模式只能减少间距，不得缩小可点击目标至无障碍下限以下。

## 14. 内容、语气与本地化

- UI 首版为英文，所有文案从本地化资源读取。
- 文案简洁、直接、面向创作者，不使用模型供应商内部术语。
- 错误信息说明发生了什么、影响哪个对象和下一步操作。
- 按钮使用动作动词。
- 禁止将可见文案写死在基础组件中。
- 组件必须适应翻译后文案增长。

## 15. 无障碍

- Light 和 Dark 均满足 WCAG 2.2 AA。
- 正文、图标和交互状态达到对应对比度。
- 键盘焦点清晰、连续且不被遮挡。
- 所有交互控件具有可访问名称。
- 错误与状态变化通过适当的 ARIA 关系或 Live Region 表达。
- 可点击目标满足最小尺寸要求。
- 不依赖 Hover 才能获取必要信息。
- 支持浏览器缩放与文本放大。
- 支持 `prefers-reduced-motion`。

## 16. 禁止事项

业务代码中禁止：

- 硬编码 Hex、RGB、HSL 或任意颜色值。
- 使用 Tailwind 任意颜色值。
- 硬编码任意字号、间距、圆角、阴影、Z-Index 或动画时长。
- 通过 `className` 覆盖 shadcn/ui 组件颜色和字体。
- 手写已有 shadcn/ui 组件的替代品。
- 使用 `space-x-*` 或 `space-y-*`。
- 为同一状态在不同页面定义不同颜色。
- 使用纯图标表达无标签的重要操作。
- 为 Dark 模式在业务组件中散落 `dark:` 颜色覆盖。
- 绕过 Zod 表单 Schema 手写重复校验。

允许的 `className` 仅用于：

- 布局。
- 已批准的间距。
- 响应式排列。
- Design System 明确允许的尺寸。

## 17. 例外流程

确需新增视觉规则时，提交内容必须包含：

- 使用场景和无法复用现有 Token 或组件的原因。
- Light 与 Dark 设计。
- Hover、Focus、Pressed、Disabled、Loading 和 Error 状态。
- 响应式行为。
- 无障碍检查。
- Storybook 或等价视觉示例。
- 视觉回归测试。
- 对本文档的更新。

未经上述流程批准的视觉硬编码不得合并。

## 18. 自动化约束

CI 必须执行：

- Biome Format 与 Lint。
- TypeScript 类型检查。
- Tailwind 与源码中的禁止模式扫描。
- 组件单元测试。
- Light 和 Dark 视觉回归测试。
- 关键页面无障碍测试。
- Storybook 或等价组件构建。

建议扫描并拒绝：

- 业务目录中的 Hex、RGB、HSL。
- Tailwind 任意值颜色与阴影。
- 未批准的 `dark:` 颜色覆盖。
- 业务应用内复制的基础 UI 组件。

## 19. 设计验收清单

每个页面或组件合并前确认：

- 使用现有 Token 和 shadcn/ui 组件。
- Light、Dark 和 System 模式均正确。
- 无首屏主题闪烁或 Hydration 警告。
- Hover、Focus、Pressed、Disabled、Loading、Empty、Error 状态齐全。
- 键盘和屏幕阅读器路径可用。
- 响应式行为符合页面级别。
- 文案来自本地化资源。
- 没有视觉硬编码和重复组件。
- 视觉回归与无障碍测试通过。
