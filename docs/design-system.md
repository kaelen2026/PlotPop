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

必须定义并使用以下语义变量：

```text
background
foreground
surface
surface-raised
surface-sunken
card
card-foreground
popover
popover-foreground
primary
primary-foreground
secondary
secondary-foreground
accent
accent-foreground
muted
muted-foreground
border
input
ring
destructive
destructive-foreground
success
success-foreground
warning
warning-foreground
info
info-foreground
preview
preview-foreground
```

### 6.1 品牌扩展色

品牌扩展色包括：

- `brand-pink`
- `brand-blue`
- `brand-lime`
- `brand-yellow`
- `brand-ink`

品牌色不得直接表示成功、失败或警告。业务状态使用对应语义状态 Token。

### 6.2 状态表达

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

约束：

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

响应式层级：

- Small：进度查看、审阅与简单批准。
- Medium：完整向导和简化 Studio。
- Large：完整 Episode Studio 三栏布局。

不得在 Small 屏幕上强行压缩完整时间线。

## 9. 圆角、描边与阴影

### 9.1 圆角

只使用预设的 Small、Medium、Large 和 Pill 四档。相同组件在不同页面不得改变圆角。

### 9.2 描边

- 基础表面使用语义 Border。
- 品牌卡片和主要 CTA 可以使用漫画式强调描边。
- Dark 模式降低强调描边对比度，避免边界噪声。
- 焦点 Ring 不得被描边或 Overflow 隐藏。

### 9.3 阴影

- Light 模式允许关键卡片使用紧凑硬阴影。
- Dark 模式使用低透明阴影与表面抬升。
- 弹层使用 shadcn/ui 自身的层级，不得手写 Z-Index。
- 不得通过多个重阴影制造层级。

## 10. 动效

动效 Token：

- Instant：状态立即反馈。
- Fast：Hover、Pressed、Tooltip。
- Normal：折叠、切换、局部面板。
- Slow：页面级或成果展示过渡。

规则：

- 动效只用于解释状态变化和空间关系。
- 禁止为持续生成进度使用干扰阅读的循环装饰动画。
- 加载使用 Skeleton、Spinner 或 Progress。
- 遵循 `prefers-reduced-motion`；减少或移除非必要位移和缩放。
- 主题切换只允许短暂颜色过渡，不允许整页闪烁。

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
