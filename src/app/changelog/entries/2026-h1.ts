import type { ChangelogEntry } from '../types'

// Commit references stay in source; public entries contain only dates and changes.
export const entries2026H1: ChangelogEntry[] = [
	// 70c92a0 60264a5
	{
		date: '2026-06-30',
		title: '快传连接与存储恢复',
		changes: [
			{ type: '改进', text: '完善局域网快传的持续连接、会话状态和接收流程。' },
			{ type: '修复', text: '整理接收文件的本地存储与过期数据清理。' }
		]
	},
	// 2c6fc6f 9cb2a5e 4d08636
	{
		date: '2026-06-29',
		title: '传输页面布局调整',
		changes: [
			{ type: '改进', text: '统一传输、压缩和 Markdown 工具的页面布局。' },
			{ type: '修复', text: '修正公网传输界面的交互和显示问题。' }
		]
	},
	// 67abefd 5e116b1 641fb69
	{
		date: '2026-06-28',
		title: '大文件接收与本地保存',
		changes: [
			{ type: '新增', text: '快传加入本地持久存储和文件接收管理。' },
			{ type: '新增', text: '支持将接收数据流式写入本地文件，降低大文件接收时的内存占用。' },
			{ type: '改进', text: '完善浏览器能力判断、接收进度和传输会话面板。' }
		]
	},
	// a3e9162 14ea5bc 8bd0922 d9a950b
	{
		date: '2026-06-27',
		title: '局域网快传与独立工具页',
		changes: [
			{ type: '新增', text: '加入局域网点对点文件传输，通过房间连接设备。' },
			{ type: '新增', text: '文件传输支持二维码邀请。' },
			{ type: '改进', text: '图片压缩、Markdown 预览和文件传输整理为独立工具页面。' }
		]
	},
	// e74da87
	{
		date: '2026-06-15',
		title: '图表展示修正',
		changes: [
			{ type: '修复', text: '调整 Mermaid 图表的渲染与文章内样式。' }
		]
	},
	// 186bab3 e7e6e50 17eed6f
	{
		date: '2026-06-14',
		title: '文章支持 Mermaid 图表',
		changes: [
			{ type: '新增', text: 'Markdown 文章支持直接渲染 Mermaid 图表。' },
			{ type: '改进', text: '完善图表代码块和 Markdown 渲染。' },
			{ type: '新增', text: '发布 Git 原理与使用实践文章。' }
		]
	},
	// 8a7b649 be6eddb a82b371
	{
		date: '2026-06-07',
		title: '文件传输工具上线',
		changes: [
			{ type: '新增', text: '加入加密文件分享和接收页面，通过分享码访问传输内容。' },
			{ type: '改进', text: '提供独立的传输入口，完善发送、接收和状态提示。' }
		]
	},
	// e939ded
	{
		date: '2026-06-04',
		title: '音乐有了独立页面',
		changes: [
			{ type: '新增', text: '加入独立音乐页，可浏览曲目并控制播放。' },
			{ type: '改进', text: '首页音乐卡片与全站播放器共用播放状态。' }
		]
	},
	// 0c652f8 661ff45 691064a
	{
		date: '2026-06-02',
		title: 'Toolbox 工具箱上线',
		changes: [
			{ type: '新增', text: '将图片转换和 Markdown 预览集中到 Toolbox 工具箱。' },
			{ type: '改进', text: '调整工具在窄屏下的布局和入口。' },
			{ type: '改进', text: '完善文章列表的年度词云展示。' }
		]
	},
	// c0b9d66 2f5f201 97a35a1
	{
		date: '2026-05-31',
		title: '图片加载与阅读整理',
		changes: [
			{ type: '改进', text: '统一图片地址与加载方式，整理图片墙显示。' },
			{ type: '优化', text: '清理文章加载、阅读进度和返回顶部中的重复逻辑。' }
		]
	},
	// 6ef3265 eb8bd83 fde4861
	{
		date: '2026-05-30',
		title: '阅读进度更清晰',
		changes: [
			{ type: '改进', text: '调整文章阅读进度条的显示和滚动计算。' },
			{ type: '新增', text: '发布 MySQL InnoDB 底层机制文章。' }
		]
	},
	// 7ebb47b 08e060f 5e6d2a0
	{
		date: '2026-05-28',
		title: '新闻页接入实时热点',
		changes: [
			{ type: '新增', text: '新闻页加入 NewsNow 实时热点。' },
			{ type: '改进', text: '调整新闻内容组织和数据展示。' },
			{ type: '修复', text: '修正音乐播放和背景效果中的交互问题。' }
		]
	},
	// fb495f9
	{
		date: '2026-05-26',
		title: '新闻摘要与图片预览优化',
		changes: [
			{ type: '改进', text: '新闻列表展示摘要和日期索引，减少一屏内重复的信息。' },
			{ type: '改进', text: '调整文章图片预览和图片工具的显示。' }
		]
	},
	// ffb5af8 bac7748 7371286 03ee1e9
	{
		date: '2026-05-24',
		title: '新闻日报上线',
		changes: [
			{ type: '新增', text: '提供新闻日期列表和按日阅读的详情页。' },
			{ type: '改进', text: '新闻详情加入加载提示。' },
			{ type: '优化', text: '统一站内图片组件，改善文章、卡片和图片墙的加载表现。' }
		]
	},
	// 625134f b619f29
	{
		date: '2026-05-18',
		title: '阅读进度与线稿背景',
		changes: [
			{ type: '新增', text: '文章页面加入阅读进度条。' },
			{ type: '新增', text: '加入随主题变色的亭阁线稿背景。' }
		]
	},
	// 0124380
	{
		date: '2026-05-17',
		title: '首页卡片加入立体反馈',
		changes: [
			{ type: '新增', text: '首页卡片随鼠标位置轻微倾斜，按下时提供反馈。' },
			{ type: '改进', text: '触屏和减少动态效果模式下避免触发卡片倾斜。' }
		]
	},
	// 172584c b292c40 a5556a0 a18aa3a a63f9b3
	{
		date: '2026-05-16',
		title: '默认封面与资源地址统一',
		changes: [
			{ type: '新增', text: '未设置封面的文章使用统一默认封面。' },
			{ type: '修复', text: '统一卡片、正文和图片墙的资源地址，修正图片显示问题。' },
			{ type: '改进', text: '统一公开页面的管理入口开关，完善主题初始化。' },
			{ type: '新增', text: '发布 Redis 学习与面试整理文章。' }
		]
	},
	// 53b27f0 7b2a706
	{
		date: '2026-05-14',
		title: '设计模式文章补充',
		changes: [
			{ type: '改进', text: '继续修订设计模式文章，补充相关示意素材。' }
		]
	},
	// 1c581ee 4346ede 5bfa206
	{
		date: '2026-05-13',
		title: '小游戏与设计模式文章',
		changes: [
			{ type: '新增', text: '加入独立小游戏页面及首页入口。' },
			{ type: '新增', text: '发布 23 种设计模式的整理文章。' },
			{ type: '修复', text: '调整背景效果的交互表现。' }
		]
	},
	// da7a6ab
	{
		date: '2026-05-12',
		title: '背景效果调整',
		changes: [
			{ type: '改进', text: '调整雨滴颜色和背景遮罩，使雨天效果适配深浅主题。' }
		]
	},
	// 766c0d4 f695e9c 9c907cf 909e757
	{
		date: '2026-05-11',
		title: '年度词云与系列文章',
		changes: [
			{ type: '改进', text: '完善年度词云和文章列表的显示。' },
			{ type: '改进', text: '调整 Markdown 渲染与正文排版。' },
			{ type: '新增', text: '补充 Java 虚拟线程、Agent Skills 和 RAG 系列文章。' }
		]
	},
	// e0ad02d
	{
		date: '2026-05-10',
		title: '文章列表加入年度词云',
		changes: [
			{ type: '新增', text: '从文章内容生成年度词云，在归档中展示这一年的写作主题。' }
		]
	},
	// b975730 f05f0ca
	{
		date: '2026-05-09',
		title: '补充大模型接入笔记',
		changes: [
			{ type: '新增', text: '发布大模型接入入门文章，并修订正文内容。' }
		]
	},
	// df8f881
	{
		date: '2026-05-06',
		title: '首页加入动态核心',
		changes: [
			{ type: '新增', text: '首页问候卡片加入动态核心视觉效果。' },
			{ type: '改进', text: '调整世界时钟中的太阳位置计算。' }
		]
	},
	// 0d2bf23
	{
		date: '2026-05-05',
		title: '世界时钟信息面板调整',
		changes: [
			{ type: '改进', text: '重新安排地点、标准时间、太阳时和日照信息，改善窄屏阅读。' }
		]
	},
	// 341df2b 986e438
	{
		date: '2026-05-04',
		title: '世界时钟加入节气轨迹',
		changes: [
			{ type: '新增', text: '世界时钟加入节气与全年太阳运动的展示。' },
			{ type: '新增', text: '补充机器学习课程学习记录。' }
		]
	},
	// 12769ce 180a182 c27afdf
	{
		date: '2026-05-03',
		title: '世界时钟上线',
		changes: [
			{ type: '新增', text: '加入交互式世界时钟，展示地球上的地点时间与太阳信息。' },
			{ type: '新增', text: '补充苹果病害检测项目和文章。' },
			{ type: '修复', text: '调整 Markdown 内容渲染。' }
		]
	},
	// 27d9443 38b3271 a636781
	{
		date: '2026-05-02',
		title: '站点导航与时间氛围',
		changes: [
			{ type: '新增', text: '加入独立的站点入口导航页。' },
			{ type: '新增', text: '背景随时间主题变化，并加入雨滴、流星等氛围效果。' },
			{ type: '优化', text: 'Markdown 渲染移入后台线程，调整图片墙与文章图片加载。' }
		]
	},
	// c8a4d83 720d7dd 6d8f3e7 f917133 b84343f
	{
		date: '2026-05-01',
		title: '日历、点赞与音乐完善',
		changes: [
			{ type: '新增', text: '日历补充节日信息，完善日期详情。' },
			{ type: '改进', text: '接入点赞服务，整理图片和推荐内容。' },
			{ type: '修复', text: '修正音乐播放状态，并补充曲目。' }
		]
	},
	// 7021f5d eba6e48 e85823f 0f5f2ae
	{
		date: '2026-04-30',
		title: '部署与推荐内容调整',
		changes: [
			{ type: '改进', text: '调整 Netlify 的站点运行配置。' },
			{ type: '改进', text: '更新分享、博主推荐和音乐资源。' }
		]
	},
	// 0f4195b 6a9b351 c6528b7 00a07b3 0ac3794
	{
		date: '2026-04-29',
		title: '整理站点，加入四时主题',
		changes: [
			{ type: '改进', text: '清理初始示例文章，重新整理站点介绍、项目和推荐内容。' },
			{ type: '新增', text: '加入独立日历页与农历信息。' },
			{ type: '新增', text: '加入清晨、正午、日落、夜晚四套随时间切换的主题。' },
			{ type: '改进', text: '接入共享音乐播放器，切换页面时保留播放状态。' }
		]
	}
]
