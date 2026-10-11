import type { ChangelogEntry } from '../types'

// Commit references stay in source; public entries contain only dates and changes.
export const entries2025: ChangelogEntry[] = [
	// 89f8313 ac6c8ae
	{
		date: '2025-12-05',
		title: '文章摘要与配置入口调整',
		changes: [
			{ type: '改进', text: '限制文章侧栏摘要的高度，让目录和其它信息更容易找到。' },
			{ type: '改进', text: '整理首页站点配置入口及快捷操作。' }
		]
	},
	// f9d171c 6e1210d 138c0d2 52b99ae
	{
		date: '2025-12-04',
		title: '首页卡片可以拖动编排',
		changes: [
			{ type: '新增', text: '首页加入卡片拖动、位置调整和布局开关。' },
			{ type: '新增', text: '站点配置支持背景图片和社交链接。' },
			{ type: '修复', text: '调整首页卡片层级和图片墙展示。' }
		]
	},
	// 3122eb8 d40a685
	{
		date: '2025-12-03',
		title: '图片墙支持调整位置',
		changes: [
			{ type: '新增', text: '支持拖动图片调整图片墙布局。' },
			{ type: '修复', text: '完善图片删除及删除后的显示状态。' }
		]
	},
	// 0cab6aa 3b7e72d e97ce40
	{
		date: '2025-12-02',
		title: '深色配色与图片墙布局',
		changes: [
			{ type: '新增', text: '加入深色与秋日配色预设，并统一卡片、弹窗和文章的主题颜色。' },
			{ type: '改进', text: '图片墙采用自由散落布局，调整项目和分享卡片样式。' }
		]
	},
	// 5c97bc7 1616937 2c2c5f0 5269bc8
	{
		date: '2025-12-01',
		title: '配色自定义与文章编辑完善',
		changes: [
			{ type: '新增', text: '站点配置加入颜色选择器，支持调整卡片等界面的颜色。' },
			{ type: '新增', text: '文章编辑支持粘贴图片，移动端加入返回顶部按钮。' },
			{ type: '修复', text: '限制长目录高度，修正文章侧栏滚动和首页图片上传、删除。' }
		]
	},
	// c93e3e1 74e5b23
	{
		date: '2025-11-29',
		title: '首页布局与图片管理调整',
		changes: [
			{ type: '改进', text: '集中配置首页卡片的大小、位置和显示样式。' },
			{ type: '改进', text: '完善图片墙的图片展示与管理流程。' }
		]
	},
	// 5268e8b ed8154b 98295c5
	{
		date: '2025-11-28',
		title: '图片墙上线',
		changes: [
			{ type: '新增', text: '加入图片墙页面，支持上传和展示图片。' },
			{ type: '改进', text: '图片转换工具支持拖入文件。' }
		]
	},
	// b621009 1eaf03e a76bafc b64358a
	{
		date: '2025-11-26',
		title: '关于本站改用 Markdown',
		changes: [
			{ type: '改进', text: '关于本站支持以 Markdown 编辑和展示介绍内容。' },
			{ type: '改进', text: '完善图片转换工具，调整导航标题提示。' }
		]
	},
	// 1de2740 fc2fbfc 95ed018 514faa1
	{
		date: '2025-11-25',
		title: '第一版图片工具',
		changes: [
			{ type: '新增', text: '支持在浏览器中将 PNG、JPG 图片转换为 WebP，调整质量并批量下载。' },
			{ type: '修复', text: '修正文章封面的替换和移除操作。' }
		]
	},
	// 251b9ab e518d6e
	{
		date: '2025-11-22',
		title: '代码块可以直接复制',
		changes: [
			{ type: '新增', text: '文章代码块加入复制按钮，保留原始代码用于复制。' },
			{ type: '改进', text: '将玻璃视觉效果集中到文章页面。' }
		]
	},
	// c703cfc 5557cca 8e61e60
	{
		date: '2025-11-21',
		title: '玻璃效果与阅读侧栏',
		changes: [
			{ type: '新增', text: '尝试加入液态玻璃视觉效果。' },
			{ type: '改进', text: '调整文章侧栏和目录样式，并在移动端关闭较重的玻璃效果。' }
		]
	},
	// 40f0757
	{
		date: '2025-11-20',
		title: '文章排版调整',
		changes: [
			{ type: '改进', text: '统一文章正文中的标题、列表和其它 Markdown 排版样式。' }
		]
	},
	// 7d851ac f252834 781c2e9
	{
		date: '2025-11-19',
		title: '加入 RSS 订阅',
		changes: [
			{ type: '新增', text: '提供文章 RSS 订阅输出。' },
			{ type: '新增', text: '站点配色配置支持随机生成颜色。' }
		]
	},
	// 29babe5 50fdd83 cd0313b c866a38
	{
		date: '2025-11-18',
		title: '站点与项目配置',
		changes: [
			{ type: '新增', text: '项目列表支持编辑，站点加入内容和主题颜色配置。' },
			{ type: '改进', text: '调整首页问候语和音乐卡片配色。' },
			{ type: '修复', text: '修正文章图片预览与上传弹窗的显示。' }
		]
	},
	// fa6ddab bd31923 34d22dc cf14de4
	{
		date: '2025-11-17',
		title: '文章管理与返回顶部',
		changes: [
			{ type: '新增', text: '文章支持单篇删除和批量删除。' },
			{ type: '新增', text: '阅读页面加入返回顶部按钮。' },
			{ type: '改进', text: '整理站点配置、图片弹窗和博主推荐列表。' }
		]
	},
	// 50070b6 36ba71e
	{
		date: '2025-11-16',
		title: '仓库里的初始版本',
		changes: [
			{ type: '新增', text: '当前仓库首次提交：已有文章、项目、分享、博主推荐和关于本站等页面。' },
			{ type: '新增', text: '首页以卡片展示问候、文章、日历、时钟、音乐和图片。' },
			{ type: '新增', text: '提供 Markdown 文章阅读、目录、图片预览和点赞，以及向 GitHub 提交内容的编辑界面。' }
		]
	}
]
