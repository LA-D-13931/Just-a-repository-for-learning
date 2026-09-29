/* ==========================================================================
   videos.js — 课程视频入口（集中配置 + 渲染器）
   ---------------------------------------------------------------------------
   为什么单独一个文件：视频信息（标题 / URL / 平台 / 对应章节 / 分 P）必须
   **集中配置，不把 URL 硬编码进正文句子**。改一个链接只改这里。

   三个消费方：
     ① 章节页讲解区顶部「先看视频讲解」（本文件渲染；**每节只有这一个入口**）
     ② 首页/目录页每章的入口（本文件渲染 data-chapter-videos）
     ③ 非 JS 环境 / 校验脚本（读章节页 h2 上的 data-video* 属性）

   合集选用（2026-09-16 用户指定）：以 **BV1CAxaeHEeH（2.0 版）** 为全站主来源，
   原 2024 更新版（BV1Eb411u7Fw）**不再挂入口**——用户指出其部分内容已过时。
   两个合集都留在 VIDEOS 主表里备查，但只有 2.0 版进 MAP。
   分 P 号与时长取自 B 站官方接口（tools/gen-videos.py），逐条核对。

   分 P 号的核实状态分两种：
     · verified: true  —— 用户已在 B 站点开确认（1.1 / 1.2 / 1.3）
     · verified: false —— 来自交接文档登记表，尚未核实（其余各节）
   只要某个小节里有未核实的条目，renderButtons() 就会在按钮下方显示"分 P 待核实"提示。
   ⚠️ 另：交接文档称本合集"无编号，只能按分 P 标题匹配"——**该说法有误**，
      实测分 P 编号正常（1.1 = p4/p5/p6，1.2 = p7/p8，1.3 = p10）。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 视频主表：同一 URL 只登记一次 ---------------- */
  var VIDEOS = {
    'BV1Eb411u7Fw': {
      title: '《高等数学》同济版 2024年更新（宋浩老师）',
      url: 'https://www.bilibili.com/video/BV1Eb411u7Fw',
      platform: 'bilibili',
      parts: 195,
      note: '⚠️ 2026-09-16 起**不再挂入口**：用户指出本合集部分内容已过时，'
          + '改用 BV1CAxaeHEeH（2.0 版）作为全站主来源。本条留在主表里备查，不进 MAP。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1Eb411u7Fw',
    },
    'BV1CAxaeHEeH': {
      title: '《高等数学》全程教学视频 2.0 版（宋浩老师）',
      url: 'https://www.bilibili.com/video/BV1CAxaeHEeH',
      platform: 'bilibili',
      parts: 149,
      note: '✅ 全站主来源（2026-09-16 用户指定）。'
          + '编号规律：P1 映射、P2「视频与图书介绍」（非知识点）、P3 函数、P4 初等函数、'
          + 'P5 起按同济节次顺序推进。分 P 号已用 B 站官方接口逐条核对（tools/gen-videos.py）。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1CAxaeHEeH',
    },

    'BV1144y1K7HE': {
      title: '25分钟搞懂傅里叶级数',
      up: '考研数学李烈老师',
      url: 'https://www.bilibili.com/video/BV1144y1K7HE',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：考研数学李烈老师。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1144y1K7HE',
    },
    'BV1zv4y1U7gd': {
      title: '数学分析：傅里叶级数（最易懂讲法）',
      up: '雨迹_数学系专业课',
      url: 'https://www.bilibili.com/video/BV1zv4y1U7gd',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：雨迹_数学系专业课。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1zv4y1U7gd',
    },
    'BV1xV4y1V7gp': {
      title: '数学分析（不挂科）：一致收敛（期末速通）',
      up: '雨迹_数学系专业课',
      url: 'https://www.bilibili.com/video/BV1xV4y1V7gp',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：雨迹_数学系专业课。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1xV4y1V7gp',
    },
    'BV1hh41127Js': {
      title: '直观理解函数列的【一致收敛】和【逐点收敛】',
      up: '轩兔',
      url: 'https://www.bilibili.com/video/BV1hh41127Js',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：轩兔。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1hh41127Js',
    },
    'BV1rK4y1M7nG': {
      title: 'Origin曲线拟合实例教程（最小二乘法）',
      up: '振振gou',
      url: 'https://www.bilibili.com/video/BV1rK4y1M7nG',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：振振gou。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1rK4y1M7nG',
    },
    'BV1Z64y1V7y4': {
      title: '最小二乘法【看不懂来揍我】',
      up: '账号已注销',
      url: 'https://www.bilibili.com/video/BV1Z64y1V7y4',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：账号已注销。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1Z64y1V7y4',
    },
    'BV1sX4y1N7q5': {
      title: '含参变量的积分—五大定理详细证明',
      up: '考研数学杰哥',
      url: 'https://www.bilibili.com/video/BV1sX4y1N7q5',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：考研数学杰哥。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1sX4y1N7q5',
    },
    'BV1PrZoYsE1s': {
      title: '高数 第10章 第11节 含参变量的积分',
      up: '认知浅说',
      url: 'https://www.bilibili.com/video/BV1PrZoYsE1s',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：认知浅说。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1PrZoYsE1s',
    },
    'BV1VD4y1d7GH': {
      title: '一个视频，通关欧拉方程！',
      up: '小崔说数',
      url: 'https://www.bilibili.com/video/BV1VD4y1d7GH',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：小崔说数。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1VD4y1d7GH',
    },
    'BV1p94y1m7M4': {
      title: '（数一）欧拉方程',
      up: '吃尽天下面',
      url: 'https://www.bilibili.com/video/BV1p94y1m7M4',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：吃尽天下面。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1p94y1m7M4',
    },
    'BV1p64y1u7vA': {
      title: '高等数学一-9.7常系数线性微分方程组',
      up: '春田花花幼稚园爱学习',
      url: 'https://www.bilibili.com/video/BV1p64y1u7vA',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：春田花花幼稚园爱学习。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1p64y1u7vA',
    },
    'BV19x4y1S72P': {
      title: '常系数线性微分方程组解法举例',
      up: '未-果',
      url: 'https://www.bilibili.com/video/BV19x4y1S72P',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：未-果。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV19x4y1S72P',
    },
    'BV1VzRGYTEdq': {
      title: '投影曲线不会？空间画图头疼？20min拿捏空间曲线方程！|高数下',
      up: '一高数',
      url: 'https://www.bilibili.com/video/BV1VzRGYTEdq',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：一高数。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1VzRGYTEdq',
    },
    'BV1y84y1K7Vk': {
      title: '空间曲线及其方程（曲线形式及投影）',
      up: '高等数学熊老师',
      url: 'https://www.bilibili.com/video/BV1y84y1K7Vk',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：高等数学熊老师。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1y84y1K7Vk',
    },
    'BV1CE411L7jg': {
      title: '高等数学|8.10 二元函数的泰勒公式（理论部分）【2020新增】',
      up: '兆筱小分队',
      url: 'https://www.bilibili.com/video/BV1CE411L7jg',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：兆筱小分队。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1CE411L7jg',
    },
    'BV1AP4y1p7XJ': {
      title: '快速学会“二元函数泰勒展开”',
      up: '考研数学杰哥',
      url: 'https://www.bilibili.com/video/BV1AP4y1p7XJ',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：考研数学杰哥。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1AP4y1p7XJ',
    },
    'BV1e34y1M736': {
      title: '考研数学难点：定积分的物理应用（超细致！万有引力，静水压力，变力做功，抽水做功）',
      up: '考研竞赛凯哥',
      url: 'https://www.bilibili.com/video/BV1e34y1M736',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：考研竞赛凯哥。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1e34y1M736',
    },
    'BV1hW4y1D7ow': {
      title: '数一，数二必看！彻底搞定微积分物理学应用（做功、引力、压力） 全网最形象！',
      up: '考研数学李烈老师',
      url: 'https://www.bilibili.com/video/BV1hW4y1D7ow',
      platform: 'bilibili',
      external: true,   // 非宋浩合集，为未匹配小节补充的站外资源
      verifiedUrl: true, // BV 号已用 B 站 view 接口验证可访问
      note: '未匹配小节的补充资源（2026-09-18 用户审核通过）。UP 主：考研数学李烈老师。',
      source: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1hW4y1D7ow',
    },
    'BV1Et421E7jk': {
      title: '《线性代数》全程教学视频（一高数）',
      url: 'https://www.bilibili.com/video/BV1Et421E7jk',
      platform: 'bilibili',
      parts: 22,
      note: '线性代数科目主来源。P1 为「一高数指南」，P2–P22 依次对应 6 章 21 节。',
      source: 'https://api.bilibili.com/x/player/pagelist?bvid=BV1Et421E7jk',
    },
  };

  /* ---------------- 章节 → 视频对应表 ----------------
     video   : 主表里的 BV 号
     part    : 分 P 号（null = 无法按 P 定位，只能按标题找）
     partLabel: 该 P 对应的知识点（区分同一合集里的不同知识点，这才是入口要说的信息）
     verified: 分 P 号是否已人工核实
     section : 对应的同济章节号（用于按钮 title 与自检脚本）
     ------------------------------------------------------------ */
  var MAP = {
    's1-1': [
      { video: 'BV1CAxaeHEeH', part: 1, partLabel: '映射', duration: '34:36', verified: true, section: '1.1' },
      { video: 'BV1CAxaeHEeH', part: 3, partLabel: '函数', duration: '1:05:41', verified: true, section: '1.1' },
      { video: 'BV1CAxaeHEeH', part: 4, partLabel: '初等函数（含 cot x 与反三角函数）', duration: '30:17', verified: true, section: '1.1' },
    ],
    's1-2': [
      { video: 'BV1CAxaeHEeH', part: 5, partLabel: '数列的极限', duration: '52:10', verified: true, section: '1.2' },
      { video: 'BV1CAxaeHEeH', part: 6, partLabel: '收敛数列的性质', duration: '26:23', verified: true, section: '1.2' },
    ],
    's1-3': [
      { video: 'BV1CAxaeHEeH', part: 7, partLabel: '函数极限定义', duration: '57:12', verified: true, section: '1.3' },
      { video: 'BV1CAxaeHEeH', part: 8, partLabel: '函数极限的性质', duration: '19:37', verified: true, section: '1.3' },
    ],
    's1-4': [
      { video: 'BV1CAxaeHEeH', part: 9, partLabel: '无穷小与无穷大', duration: '23:26', verified: true, section: '1.4' },
    ],
    's1-5': [
      { video: 'BV1CAxaeHEeH', part: 10, partLabel: '极限运算法则', duration: '44:12', verified: true, section: '1.5' },
    ],
    's1-6': [
      { video: 'BV1CAxaeHEeH', part: 11, partLabel: '极限存在准则 第一第二重要极限', duration: '42:19', verified: true, section: '1.6' },
    ],
    's1-7': [
      { video: 'BV1CAxaeHEeH', part: 12, partLabel: '无穷小的比较 等价无穷小替换', duration: '50:07', verified: true, section: '1.7' },
    ],
    's1-8': [
      { video: 'BV1CAxaeHEeH', part: 13, partLabel: '连续', duration: '20:27', verified: true, section: '1.8' },
      { video: 'BV1CAxaeHEeH', part: 14, partLabel: '间断点', duration: '27:38', verified: true, section: '1.8' },
    ],
    's1-9': [
      { video: 'BV1CAxaeHEeH', part: 15, partLabel: '连续函数运算 反函数复合函数的连续', duration: '29:39', verified: true, section: '1.9' },
    ],
    's1-10': [
      { video: 'BV1CAxaeHEeH', part: 16, partLabel: '闭区间连续函数的性质', duration: '22:52', verified: true, section: '1.10' },
    ],
    's2-1': [
      { video: 'BV1CAxaeHEeH', part: 17, partLabel: '导数的定义', duration: '47:20', verified: true, section: '2.1' },
      { video: 'BV1CAxaeHEeH', part: 18, partLabel: '导数几何含义', duration: '13:10', verified: true, section: '2.1' },
      { video: 'BV1CAxaeHEeH', part: 19, partLabel: '可导与连续关系', duration: '12:19', verified: true, section: '2.1' },
    ],
    's2-2': [
      { video: 'BV1CAxaeHEeH', part: 20, partLabel: '求导公式', duration: '23:53', verified: true, section: '2.2' },
      { video: 'BV1CAxaeHEeH', part: 21, partLabel: '反函数求导', duration: '17:10', verified: true, section: '2.2' },
      { video: 'BV1CAxaeHEeH', part: 22, partLabel: '复合函数求导', duration: '21:57', verified: true, section: '2.2' },
      { video: 'BV1CAxaeHEeH', part: 23, partLabel: '基本求导法则与公式', duration: '12:01', verified: true, section: '2.2' },
    ],
    's2-3': [
      { video: 'BV1CAxaeHEeH', part: 24, partLabel: '高阶导数', duration: '32:16', verified: true, section: '2.3' },
    ],
    's2-4': [
      { video: 'BV1CAxaeHEeH', part: 25, partLabel: '隐函数求导对数求导', duration: '35:16', verified: true, section: '2.4' },
      { video: 'BV1CAxaeHEeH', part: 26, partLabel: '参数方程求导', duration: '22:35', verified: true, section: '2.4' },
    ],
    's2-5': [
      { video: 'BV1CAxaeHEeH', part: 27, partLabel: '微分', duration: '32:13', verified: true, section: '2.5' },
      { video: 'BV1CAxaeHEeH', part: 28, partLabel: '微分在近似计算应用', duration: '18:14', verified: true, section: '2.5' },
    ],
    's3-1': [
      { video: 'BV1CAxaeHEeH', part: 29, partLabel: '微分中值定理', duration: '38:51', verified: true, section: '3.1' },
    ],
    's3-2': [
      { video: 'BV1CAxaeHEeH', part: 30, partLabel: '洛必达法则', duration: '57:40', verified: true, section: '3.2' },
    ],
    's3-3': [
      { video: 'BV1CAxaeHEeH', part: 31, partLabel: '泰勒公式', duration: '44:54', verified: true, section: '3.3' },
    ],
    's3-4': [
      { video: 'BV1CAxaeHEeH', part: 32, partLabel: '函数单调性', duration: '29:57', verified: true, section: '3.4' },
      { video: 'BV1CAxaeHEeH', part: 33, partLabel: '凸凹性拐点', duration: '42:22', verified: true, section: '3.4' },
    ],
    's3-5': [
      { video: 'BV1CAxaeHEeH', part: 34, partLabel: '极值', duration: '32:42', verified: true, section: '3.5' },
      { video: 'BV1CAxaeHEeH', part: 35, partLabel: '最值', duration: '12:18', verified: true, section: '3.5' },
    ],
    's3-6': [
      { video: 'BV1CAxaeHEeH', part: 36, partLabel: '函数图形的绘制', duration: '26:02', verified: true, section: '3.6' },
    ],
    's3-7': [
      { video: 'BV1CAxaeHEeH', part: 37, partLabel: '曲率', duration: '2:54', verified: true, section: '3.7' },
    ],
    's3-8': [
    ],
    's4-1': [
      { video: 'BV1CAxaeHEeH', part: 38, partLabel: '不定积分的定义', duration: '40:09', verified: true, section: '4.1' },
      { video: 'BV1CAxaeHEeH', part: 39, partLabel: '不定积分的性质', duration: '19:13', verified: true, section: '4.1' },
    ],
    's4-2': [
      { video: 'BV1CAxaeHEeH', part: 40, partLabel: '第一换元积分法', duration: '54:00', verified: true, section: '4.2' },
    ],
    's4-3': [
      { video: 'BV1CAxaeHEeH', part: 41, partLabel: '第二换元积分法', duration: '61:49', verified: true, section: '4.3' },
    ],
    's4-4': [
      { video: 'BV1CAxaeHEeH', part: 42, partLabel: '分部积分法', duration: '49:13', verified: true, section: '4.4' },
    ],
    's4-5': [
      { video: 'BV1CAxaeHEeH', part: 43, partLabel: '有理函数的积分（上集）', duration: '43:17', verified: true, section: '4.5' },
      { video: 'BV1CAxaeHEeH', part: 44, partLabel: '有理函数的积分（下集）', duration: '47:13', verified: true, section: '4.5' },
    ],
    's5-1': [
      { video: 'BV1CAxaeHEeH', part: 45, partLabel: '定积分的定义', duration: '35:58', verified: true, section: '5.1' },
      { video: 'BV1CAxaeHEeH', part: 46, partLabel: '定积分的性质', duration: '37:19', verified: true, section: '5.1' },
    ],
    's5-2': [
      { video: 'BV1CAxaeHEeH', part: 47, partLabel: '变上限积分函数', duration: '41:11', verified: true, section: '5.2' },
      { video: 'BV1CAxaeHEeH', part: 48, partLabel: '牛顿-莱布尼兹定理', duration: '38:49', verified: true, section: '5.2' },
    ],
    's5-3': [
      { video: 'BV1CAxaeHEeH', part: 49, partLabel: '定积分的换元法（上集）', duration: '43:00', verified: true, section: '5.3' },
      { video: 'BV1CAxaeHEeH', part: 50, partLabel: '定积分的换元法（下集）', duration: '41:45', verified: true, section: '5.3' },
    ],
    's5-4': [
      { video: 'BV1CAxaeHEeH', part: 51, partLabel: '定积分分部积分法', duration: '28:01', verified: true, section: '5.4' },
    ],
    's5-5': [
      { video: 'BV1CAxaeHEeH', part: 52, partLabel: '无穷限的反常积分', duration: '35:22', verified: true, section: '5.5' },
      { video: 'BV1CAxaeHEeH', part: 53, partLabel: '无界函数的反常积分', duration: '54:06', verified: true, section: '5.5' },
    ],
    's6-1': [
      { video: 'BV1CAxaeHEeH', part: 54, partLabel: '定积分应用（求面积）', duration: '31:04', verified: true, section: '6.1' },
      { video: 'BV1CAxaeHEeH', part: 55, partLabel: '微元法', duration: '2:57', verified: true, section: '6.1' },
    ],
    's6-2': [
      { video: 'BV1CAxaeHEeH', part: 56, partLabel: '定积分应用（求面积-极坐标）', duration: '9:34', verified: true, section: '6.2' },
      { video: 'BV1CAxaeHEeH', part: 57, partLabel: '求旋转体的体积', duration: '30:16', verified: true, section: '6.2' },
      { video: 'BV1CAxaeHEeH', part: 58, partLabel: '壳法求旋转体的体积', duration: '14:25', verified: true, section: '6.2' },
      { video: 'BV1CAxaeHEeH', part: 59, partLabel: '求非旋转体的体积', duration: '18:13', verified: true, section: '6.2' },
      { video: 'BV1CAxaeHEeH', part: 60, partLabel: '求平面曲线的弧长', duration: '32:16', verified: true, section: '6.2' },
    ],
    's6-3': [
      { video: 'BV1e34y1M736', part: null, partLabel: '主 ｜ 考研数学难点：定积分的物理应用（超细致！万有引力，静水压力，变力做功，抽水做功）', duration: '124:48', verified: true, section: '6.3', role: 'primary', external: true },
      { video: 'BV1hW4y1D7ow', part: null, partLabel: '备 ｜ 数一，数二必看！彻底搞定微积分物理学应用（做功、引力、压力） 全网最形象！', duration: '33:36', verified: true, section: '6.3', role: 'backup', external: true },
    ],
    's7-1': [
      { video: 'BV1CAxaeHEeH', part: 61, partLabel: '微分方程的基本概念', duration: '31:41', verified: true, section: '7.1' },
    ],
    's7-2': [
      { video: 'BV1CAxaeHEeH', part: 62, partLabel: '可分离变量的微分方程', duration: '28:46', verified: true, section: '7.2' },
    ],
    's7-3': [
      { video: 'BV1CAxaeHEeH', part: 64, partLabel: '一阶线性微分方程', duration: '43:54', verified: true, section: '7.4' },
      { video: 'BV1CAxaeHEeH', part: 65, partLabel: '伯努利方程', duration: '12:30', verified: true, section: '7.4' },
    ],
    's7-4': [
      { video: 'BV1CAxaeHEeH', part: 66, partLabel: '可降阶的高阶微分方程', duration: '33:46', verified: true, section: '7.5' },
    ],
    's7-5': [
      { video: 'BV1CAxaeHEeH', part: 67, partLabel: '二阶常系数齐次线性微分方程（理论）', duration: '41:38', verified: true, section: '7.6' },
      { video: 'BV1CAxaeHEeH', part: 68, partLabel: '二阶常系数齐次线性微分方程（做题）', duration: '17:55', verified: true, section: '7.6' },
    ],
    's7-6': [
      { video: 'BV1CAxaeHEeH', part: 69, partLabel: '常系数非齐次线性微分方程（观察法）', duration: '9:55', verified: true, section: '7.7' },
    ],
    's7-7': [
      { video: 'BV1VD4y1d7GH', part: null, partLabel: '主 ｜ 一个视频，通关欧拉方程！', duration: '12:17', verified: true, section: '7.7', role: 'primary', external: true },
      { video: 'BV1p94y1m7M4', part: null, partLabel: '备 ｜ （数一）欧拉方程', duration: '14:08', verified: true, section: '7.7', role: 'backup', external: true },
    ],
    's7-8': [
      { video: 'BV1p64y1u7vA', part: null, partLabel: '主 ｜ 高等数学一-9.7常系数线性微分方程组', duration: '20:08', verified: true, section: '7.8', role: 'primary', external: true },
      { video: 'BV19x4y1S72P', part: null, partLabel: '备 ｜ 常系数线性微分方程组解法举例', duration: '11:43', verified: true, section: '7.8', role: 'backup', external: true },
    ],
    'tx1-1': [
    ],
    'tx1-2': [
    ],
    /* 第 8 章：正文已建，但视频分 P 尚未核实。
       显式写空数组表示「暂无视频」，避免编造 part 号（与 s7-7/s7-8 同一处理）。 */
    's8-1': [
      { video: 'BV1CAxaeHEeH', part: 70, partLabel: '69 向量 线性运算 空间直角坐标系 向量模', duration: '73:32', verified: false, section: '8.1', match: 'P70 标题「69 向量 线性运算 空间直角坐标系 向量模」，直接对应 §8.1 向量及其线性运算' },
    ],
    's8-2': [
      { video: 'BV1CAxaeHEeH', part: 71, partLabel: '70 方向角 方向余弦 数量积 向量积', duration: '63:10', verified: false, section: '8.2', match: 'P71 标题「70 方向角 方向余弦 数量积 向量积」，直接对应 §8.2 数量积与向量积' },
    ],
    's8-3': [
      { video: 'BV1CAxaeHEeH', part: 72, partLabel: '71 曲面方程 平面方程 直线方程', duration: '98:05', verified: false, section: '8.3', match: 'P72 标题「71 曲面方程 平面方程 直线方程」，含平面与直线方程（另含曲面，属 §8.4）' },
    ],
    's8-4': [
      { video: 'BV1CAxaeHEeH', part: 72, partLabel: '71 曲面方程 平面方程 直线方程', duration: '98:05', verified: false, section: '8.4', match: 'P74「72 曲面基本问题 旋转曲面 柱面」直接对应；P72 同含曲面方程' },
      { video: 'BV1CAxaeHEeH', part: 74, partLabel: '72 曲面基本问题 旋转曲面 柱面', duration: '48:47', verified: false, section: '8.4', match: 'P74「72 曲面基本问题 旋转曲面 柱面」直接对应；P72 同含曲面方程' },
    ],
    's8-5': [
      { video: 'BV1VzRGYTEdq', part: null, partLabel: '主 ｜ 投影曲线不会？空间画图头疼？20min拿捏空间曲线方程！|高数下', duration: '20:12', verified: true, section: '8.5', role: 'primary', external: true },
      { video: 'BV1y84y1K7Vk', part: null, partLabel: '备 ｜ 空间曲线及其方程（曲线形式及投影）', duration: '17:19', verified: true, section: '8.5', role: 'backup', external: true },
    ],
    's8-6': [
      { video: 'BV1CAxaeHEeH', part: 73, partLabel: '习题讲解1【向量代数与空间解析几何】', duration: '70:34', verified: false, section: '8.6', match: 'P73「习题讲解1【向量代数与空间解析几何】」为本章综合题讲解' },
    ],
    's9-1': [
      { video: 'BV1CAxaeHEeH', part: 75, partLabel: '73 平面点集 多元函数概念 极限 连续', duration: '41:24', verified: false, section: '9.1', match: 'P75 标题「73 平面点集 多元函数概念 极限 连续」' },
    ],
    's9-2': [
      { video: 'BV1CAxaeHEeH', part: 76, partLabel: '偏导数', duration: '34:37', verified: false, section: '9.2', match: 'P76 标题「偏导数」' },
    ],
    's9-3': [
      { video: 'BV1CAxaeHEeH', part: 78, partLabel: '全微分', duration: '37:23', verified: false, section: '9.3', match: 'P78 标题「全微分」' },
    ],
    's9-4': [
      { video: 'BV1CAxaeHEeH', part: 79, partLabel: '多元复合函数求导', duration: '67:31', verified: false, section: '9.4', match: 'P79「多元复合函数求导」+ P80「全微分形式不变性」' },
      { video: 'BV1CAxaeHEeH', part: 80, partLabel: '全微分形式不变性', duration: '12:15', verified: false, section: '9.4', match: 'P79「多元复合函数求导」+ P80「全微分形式不变性」' },
    ],
    's9-5': [
      { video: 'BV1CAxaeHEeH', part: 81, partLabel: '隐函数求导', duration: '40:39', verified: false, section: '9.5', match: 'P81 标题「隐函数求导」' },
    ],
    's9-6': [
      { video: 'BV1CAxaeHEeH', part: 82, partLabel: '一元向量值函数及其导数', duration: '13:56', verified: false, section: '9.6', match: 'P83「空间曲线的切线和法平面」+ P84「曲面的切平面和法线」；P82 为一元向量值函数（前置）' },
      { video: 'BV1CAxaeHEeH', part: 83, partLabel: '空间曲线的切线和法平面', duration: '18:56', verified: false, section: '9.6', match: 'P83「空间曲线的切线和法平面」+ P84「曲面的切平面和法线」；P82 为一元向量值函数（前置）' },
      { video: 'BV1CAxaeHEeH', part: 84, partLabel: '曲面的切平面和法线', duration: '29:46', verified: false, section: '9.6', match: 'P83「空间曲线的切线和法平面」+ P84「曲面的切平面和法线」；P82 为一元向量值函数（前置）' },
    ],
    's9-7': [
      { video: 'BV1CAxaeHEeH', part: 85, partLabel: '方向导数与梯度', duration: '109:58', verified: false, section: '9.7', match: 'P85 标题「方向导数与梯度」' },
    ],
    's9-8': [
      { video: 'BV1CAxaeHEeH', part: 86, partLabel: '多元函数的极值', duration: '35:15', verified: false, section: '9.8', match: 'P86 标题「多元函数的极值」' },
    ],
    's9-9': [
      { video: 'BV1CE411L7jg', part: null, partLabel: '主 ｜ 高等数学|8.10 二元函数的泰勒公式（理论部分）【2020新增】', duration: '65:46', verified: true, section: '9.9', role: 'primary', external: true },
      { video: 'BV1AP4y1p7XJ', part: null, partLabel: '备 ｜ 快速学会“二元函数泰勒展开”', duration: '35:45', verified: true, section: '9.9', role: 'backup', external: true },
    ],
    's9-10': [
      { video: 'BV1rK4y1M7nG', part: null, partLabel: '主 ｜ Origin曲线拟合实例教程（最小二乘法）', duration: '31:10', verified: true, section: '9.10', role: 'primary', external: true },
      { video: 'BV1Z64y1V7y4', part: null, partLabel: '备 ｜ 最小二乘法【看不懂来揍我】', duration: '14:13', verified: true, section: '9.10', role: 'backup', external: true },
    ],
    's10-1': [
      { video: 'BV1CAxaeHEeH', part: 87, partLabel: '二重积分的定义与性质', duration: '35:42', verified: false, section: '10.1', match: 'P87 标题「二重积分的定义与性质」' },
    ],
    's10-2': [
      { video: 'BV1CAxaeHEeH', part: 88, partLabel: '二重积分｜直角坐标', duration: '88:41', verified: false, section: '10.2', match: 'P88「直角坐标」+ P89「极坐标」+ P90「换元法」' },
      { video: 'BV1CAxaeHEeH', part: 89, partLabel: '二重积分｜极坐标', duration: '52:45', verified: false, section: '10.2', match: 'P88「直角坐标」+ P89「极坐标」+ P90「换元法」' },
      { video: 'BV1CAxaeHEeH', part: 90, partLabel: '二重积分的换元法', duration: '32:57', verified: false, section: '10.2', match: 'P88「直角坐标」+ P89「极坐标」+ P90「换元法」' },
    ],
    's10-3': [
      { video: 'BV1CAxaeHEeH', part: 91, partLabel: '三重积分', duration: '90:28', verified: false, section: '10.3', match: 'P91 标题「三重积分」' },
    ],
    's10-4': [
      { video: 'BV1CAxaeHEeH', part: 140, partLabel: '【黑板】多重积分的应用', duration: '41:34', verified: false, section: '10.4', match: 'P140「【黑板】多重积分的应用」对应重积分应用' },
    ],
    's10-5': [
      { video: 'BV1sX4y1N7q5', part: null, partLabel: '主 ｜ 含参变量的积分—五大定理详细证明', duration: '42:41', verified: true, section: '10.5', role: 'primary', external: true },
      { video: 'BV1PrZoYsE1s', part: null, partLabel: '备 ｜ 高数 第10章 第11节 含参变量的积分', duration: '24:33', verified: true, section: '10.5', role: 'backup', external: true },
    ],
    's11-1': [
      { video: 'BV1CAxaeHEeH', part: 92, partLabel: '第一二曲线积分', duration: '96:07', verified: false, section: '11.1', match: 'P92 标题「第一二曲线积分」，含第一型（对弧长）曲线积分' },
    ],
    's11-2': [
      { video: 'BV1CAxaeHEeH', part: 92, partLabel: '第一二曲线积分', duration: '96:07', verified: false, section: '11.2', match: 'P92 同一分P含第二型（对坐标）曲线积分' },
    ],
    's11-3': [
      { video: 'BV1CAxaeHEeH', part: 94, partLabel: '格林公式&积分与路径无关条件', duration: '56:25', verified: false, section: '11.3', match: 'P94 标题「格林公式&积分与路径无关条件」' },
    ],
    's11-4': [
      { video: 'BV1CAxaeHEeH', part: 95, partLabel: '对面积的曲面积分', duration: '50:17', verified: false, section: '11.4', match: 'P95 标题「对面积的曲面积分」' },
    ],
    's11-5': [
      { video: 'BV1CAxaeHEeH', part: 96, partLabel: '对坐标的曲面积分', duration: '79:00', verified: false, section: '11.5', match: 'P96 标题「对坐标的曲面积分」' },
    ],
    's11-6': [
      { video: 'BV1CAxaeHEeH', part: 98, partLabel: '高斯公式与斯托克斯公式', duration: '80:16', verified: false, section: '11.6', match: 'P98「高斯公式与斯托克斯公式」含高斯公式' },
    ],
    's11-7': [
      { video: 'BV1CAxaeHEeH', part: 98, partLabel: '高斯公式与斯托克斯公式', duration: '80:16', verified: false, section: '11.7', match: 'P98 同一分P含斯托克斯公式' },
    ],
    's12-1': [
      { video: 'BV1CAxaeHEeH', part: 99, partLabel: '常数项级数的概念与性质', duration: '46:24', verified: false, section: '12.1', match: 'P99 标题「常数项级数的概念与性质」' },
    ],
    's12-2': [
      { video: 'BV1CAxaeHEeH', part: 100, partLabel: '常数项级数的敛散性判断', duration: '108:35', verified: false, section: '12.2', match: 'P100 标题「常数项级数的敛散性判断」' },
    ],
    's12-3': [
      { video: 'BV1CAxaeHEeH', part: 101, partLabel: '幂级数（1）', duration: '75:53', verified: false, section: '12.3', match: 'P101/P102「幂级数（1）（2）」' },
      { video: 'BV1CAxaeHEeH', part: 102, partLabel: '幂级数（2）', duration: '77:59', verified: false, section: '12.3', match: 'P101/P102「幂级数（1）（2）」' },
    ],
    's12-4': [
      { video: 'BV1CAxaeHEeH', part: 103, partLabel: '函数的幂级数展开', duration: '69:19', verified: false, section: '12.4', match: 'P103 标题「函数的幂级数展开」' },
    ],
    's12-5': [
      { video: 'BV1CAxaeHEeH', part: 103, partLabel: '函数的幂级数展开', duration: '69:19', verified: false, section: '12.5', match: 'P103 同一分P含展开式的应用（近似计算与求和）' },
    ],
    's12-6': [
      { video: 'BV1xV4y1V7gp', part: null, partLabel: '主 ｜ 数学分析（不挂科）：一致收敛（期末速通）', duration: '18:43', verified: true, section: '12.6', role: 'primary', external: true },
      { video: 'BV1hh41127Js', part: null, partLabel: '备 ｜ 直观理解函数列的【一致收敛】和【逐点收敛】', duration: '4:49', verified: true, section: '12.6', role: 'backup', external: true },
    ],
    's12-7': [
      { video: 'BV1144y1K7HE', part: null, partLabel: '主 ｜ 25分钟搞懂傅里叶级数', duration: '24:16', verified: true, section: '12.7', role: 'primary', external: true },
      { video: 'BV1zv4y1U7gd', part: null, partLabel: '备 ｜ 数学分析：傅里叶级数（最易懂讲法）', duration: '34:49', verified: true, section: '12.7', role: 'backup', external: true },
    ],
    's12-8': [
      { video: 'BV1144y1K7HE', part: null, partLabel: '主 ｜ 25分钟搞懂傅里叶级数', duration: '24:16', verified: true, section: '12.7', role: 'primary', external: true },
      { video: 'BV1zv4y1U7gd', part: null, partLabel: '备 ｜ 数学分析：傅里叶级数（最易懂讲法）', duration: '34:49', verified: true, section: '12.7', role: 'backup', external: true },
    ],

    /* ---- 线性代数（BV1Et421E7jk，P2–P22 一一对应；分P号与时长取自 B 站官方接口）---- */
    'la-s1-1': [
      { video: 'BV1Et421E7jk', part: 2, partLabel: '二三阶行列式', duration: '19:59', verified: true, section: '1-1' },
    ],
    'la-s1-2': [
      { video: 'BV1Et421E7jk', part: 3, partLabel: '全排列和对换', duration: '20:28', verified: true, section: '1-2' },
    ],
    'la-s1-3': [
      { video: 'BV1Et421E7jk', part: 4, partLabel: '行列式的定义', duration: '23:29', verified: true, section: '1-3' },
    ],
    'la-s1-4': [
      { video: 'BV1Et421E7jk', part: 5, partLabel: '行列式的性质', duration: '25:17', verified: true, section: '1-4' },
    ],
    'la-s1-5': [
      { video: 'BV1Et421E7jk', part: 6, partLabel: '行列式按行(列)展开', duration: '31:13', verified: true, section: '1-5' },
    ],
    'la-s1-6': [
      { video: 'BV1Et421E7jk', part: 7, partLabel: '行列式的计算', duration: '45:19', verified: true, section: '1-6' },
    ],
    'la-s2-1': [
      { video: 'BV1Et421E7jk', part: 8, partLabel: '矩阵与其运算', duration: '39:34', verified: true, section: '2-1' },
    ],
    'la-s2-2': [
      { video: 'BV1Et421E7jk', part: 9, partLabel: '逆矩阵', duration: '22:56', verified: true, section: '2-2' },
    ],
    'la-s2-3': [
      { video: 'BV1Et421E7jk', part: 10, partLabel: '矩阵的公式', duration: '9:22', verified: true, section: '2-3' },
    ],
    'la-s2-4': [
      { video: 'BV1Et421E7jk', part: 11, partLabel: '分块矩阵', duration: '11:18', verified: true, section: '2-4' },
    ],
    'la-s3-1': [
      { video: 'BV1Et421E7jk', part: 12, partLabel: '克拉默法则', duration: '6:39', verified: true, section: '3-1' },
    ],
    'la-s3-2': [
      { video: 'BV1Et421E7jk', part: 13, partLabel: '线性方程组', duration: '61:34', verified: true, section: '3-2' },
    ],
    'la-s3-3': [
      { video: 'BV1Et421E7jk', part: 14, partLabel: '初等变换与秩', duration: '32:12', verified: true, section: '3-3' },
    ],
    'la-s4-1': [
      { video: 'BV1Et421E7jk', part: 15, partLabel: '向量组及其线性组合', duration: '29:20', verified: true, section: '4-1' },
    ],
    'la-s4-2': [
      { video: 'BV1Et421E7jk', part: 16, partLabel: '向量组的线性相关性', duration: '29:16', verified: true, section: '4-2' },
    ],
    'la-s4-3': [
      { video: 'BV1Et421E7jk', part: 17, partLabel: '方程组解的结构', duration: '34:02', verified: true, section: '4-3' },
    ],
    'la-s5-1': [
      { video: 'BV1Et421E7jk', part: 18, partLabel: '特征值与特征向量', duration: '43:52', verified: true, section: '5-1' },
    ],
    'la-s5-2': [
      { video: 'BV1Et421E7jk', part: 19, partLabel: '对称矩阵的对角化', duration: '21:09', verified: true, section: '5-2' },
    ],
    'la-s6-1': [
      { video: 'BV1Et421E7jk', part: 20, partLabel: '二次型及其标准形', duration: '25:47', verified: true, section: '6-1' },
    ],
    'la-s6-2': [
      { video: 'BV1Et421E7jk', part: 21, partLabel: '正交变换及配方法化标准形', duration: '20:40', verified: true, section: '6-2' },
    ],
    'la-s6-3': [
      { video: 'BV1Et421E7jk', part: 22, partLabel: '正定二次型', duration: '11:46', verified: true, section: '6-3' },
    ],
  };

  /* ---------------- 查询接口（供自检脚本与其它脚本使用） ---------------- */
  function entriesFor(sid) { return MAP[sid] || []; }
  function masterOf(bv) { return VIDEOS[bv] || null; }
  function hasVideo(sid) { return entriesFor(sid).length > 0; }

  /* ---------------- 入口文案 ---------------- */
  var TOP_HEAD = '🎬 先看视频讲解';
  var BOTTOM_HEAD = '🔁 看完还想听一遍？';
  var EMPTY_TEXT = '本节暂无配套讲解视频 —— 本知识点在宋浩合集与已审核的站外课程中都没有合适资源。请看正文学，或用相邻小节作为参照。';

  function entryUrl(e) {
    var m = masterOf(e.video);
    if (!m) return '#';
    return e.part === null || e.part === undefined ? m.url : m.url + '?p=' + e.part;
  }

  /* ---------------- 渲染：讲解区的入口 ----------------
     口径（2026-09-16 起）：**每个小节只有一个入口，位于讲解区顶部**
     （`data-video-pos="top"`）。底部「看完还想听一遍？」卡片已按用户要求删除。
     ⚠️ 但这里**仍然用 querySelectorAll**，不要改成 querySelector：
     ① 渲染器保留对 `data-video-pos="bottom"` 的兼容（is-bottom 样式仍在 CSS 里）；
     ② 同一个 key 若出现多个容器，必须全部渲染——用 querySelector 只会渲染第一个，
        其余会整块消失（v0.2.0 踩过）。
     `tests/check-bilingual.py` 会正向断言"没有底部入口"，所以内容层不会再有第二个容器。 */
  function renderButtons(sid) {
    var hosts = document.querySelectorAll('[data-video-entry="' + sid + '"]');
    if (!hosts.length) return;
    Array.prototype.slice.call(hosts).forEach(function (host) {
      renderOne(host, sid);
    });
  }

  function renderOne(host, sid) {
    var entries = entriesFor(sid);
    var isBottom = host.getAttribute('data-video-pos') === 'bottom';
    var head = isBottom ? BOTTOM_HEAD : TOP_HEAD;

    var box = document.createElement('div');
    box.className = 'video-cta' + (isBottom ? ' is-bottom' : '') + (entries.length ? '' : ' is-empty');

    var h = document.createElement('div');
    h.className = 'vc-head';
    h.textContent = head;
    box.appendChild(h);

    if (!entries.length) {
      var p = document.createElement('p');
      p.className = 'vc-none';
      p.textContent = EMPTY_TEXT;
      box.appendChild(p);
      host.appendChild(box);
      return;
    }

    var ul = document.createElement('ul');
    ul.className = 'vc-list';
    entries.forEach(function (e) {
      var m = masterOf(e.video);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'video-btn';
      a.href = entryUrl(e);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('data-video', e.video);
      a.setAttribute('data-part', e.part === null ? '' : String(e.part));
      a.title = e.section + ' ' + e.partLabel + ' · ' + (m ? m.title : e.video)
              + (m && m.up ? ' · UP：' + m.up : '')
              + (e.external ? '（外部补充资源，非宋浩合集）' : '')
              + (e.verified ? '' : '（分 P 号待核实）');

      var ico = document.createElement('span');
      ico.className = 'vb-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.textContent = '▶';
      a.appendChild(ico);

      var label = document.createElement('span');
      label.className = 'vb-label';
      label.textContent = '视频讲解';
      a.appendChild(label);

      // 时长：数据来自 B 站接口，真实可核；没有数据的条目不渲染这一格
      if (e.duration) {
        var dm = document.createElement('span');
        dm.className = 'vb-dur';
        dm.textContent = e.duration;
        a.appendChild(dm);
      }

      if (e.part !== null && e.part !== undefined) {
        var badge = document.createElement('span');
        badge.className = 'vb-p';
        badge.textContent = 'P' + e.part;
        a.appendChild(badge);
      }

      // 外部补充资源（未匹配小节的站外课程）：标注"主/备"与来源，
      // 与宋浩合集条目在视觉上区分开，避免读者误以为同一来源。
      if (e.external) {
        var tag = document.createElement('span');
        tag.className = 'vb-p';
        tag.textContent = e.role === 'backup' ? '备' : '主';
        a.appendChild(tag);
        var src = document.createElement('span');
        src.className = 'vb-dur';
        src.textContent = '外部补充';
        a.appendChild(src);
      }

      var t = document.createElement('span');
      t.className = 'vb-title';
      t.textContent = e.partLabel;
      a.appendChild(t);

      var ext = document.createElement('span');
      ext.className = 'vb-ext';
      ext.setAttribute('aria-label', '在新窗口打开外部网站');
      ext.textContent = '↗';
      a.appendChild(ext);

      li.appendChild(a);
      ul.appendChild(li);
    });
    box.appendChild(ul);

    // 数据可信度提示：只要有未核实的 P 号就明说，不让学生以为链接一定对
    var unverified = entries.filter(function (e) { return !e.verified; }).length;
    if (unverified) {
      var note = document.createElement('p');
      note.className = 'vc-note';
      note.textContent = '共 ' + entries.length + ' 个视频入口'
        + (entries.length === unverified ? '，分 P 号均待核实' : '，其中 ' + unverified + ' 个分 P 号待核实')
        + '：点击后请以 B 站实际标题为准。合集：' + (masterOf(entries[0].video) || {}).title + ' 等。';
      box.appendChild(note);
    }

    host.appendChild(box);
  }

  /* ---------------- 渲染：首页/目录页每章的入口 ---------------- */
  function renderChapterCards() {
    var cards = document.querySelectorAll('[data-chapter-videos]');
    if (!cards.length) return;
    Array.prototype.slice.call(cards).forEach(function (card) {
      var ids = (card.getAttribute('data-chapter-videos') || '').split(',').filter(Boolean);

      // 按**合集**去重，而不是按 video+part。
      // 教训：早先按 `video#part` 去重，而"按标题找、无 P 号"的条目 part 是 null，
      // 同一合集的多个 null 会被当成同一条，卡片上的数量凭空少算（实测 20 → 15）。
      // 而且"本章有多少个入口"这个数字对读者没用——他要的是"去哪看"，所以直接列合集名。
      var seen = {}, collections = [];
      ids.forEach(function (sid) {
        entriesFor(sid).forEach(function (e) {
          if (seen[e.video]) return;
          seen[e.video] = 1;
          collections.push({ video: e.video, count: entriesFor(sid).length });
        });
      });

      var box = document.createElement('div');
      box.className = 'card-video-wrap';

      if (!collections.length) {
        var none = document.createElement('span');
        none.className = 'card-video is-empty';
        none.textContent = '🎬 本章暂无讲解视频';
        box.appendChild(none);
      } else {
        // 目录页只给"入口"：列出本章用到的合集，点进去到章节页再用按钮精确定位到某个 P
        var names = collections.map(function (c) {
          var m = masterOf(c.video);
          return m ? m.title : c.video;
        });
        var a = document.createElement('a');
        a.className = 'card-video';
        a.href = chapterHrefOf(card);
        a.textContent = '🎬 视频讲解 · ' + names.join('、');
        a.title = '进入本章后，每个小节的讲解区顶部与底部各有视频按钮，'
                + '按分 P 定位到对应知识点';
        box.appendChild(a);
      }
      card.appendChild(box);
    });
  }

  /* 章节卡片的 href 就是它自己；找不到时退回 '#' */
  function chapterHrefOf(card) {
    var href = card.getAttribute('href');
    return href || '#';
  }

  /* ---------------- 自动挂载 ---------------- */
  function boot() {
    // 按 key 去重后再渲染：renderButtons(key) 自己会处理该 key 下的全部容器
    // （顶部 + 底部）。若在这里对每个容器都调一次，每个入口会被渲染两遍。
    var seen = {};
    document.querySelectorAll('[data-video-entry]').forEach(function (host) {
      var sid = host.getAttribute('data-video-entry');
      if (seen[sid]) return;
      seen[sid] = 1;
      renderButtons(sid);
    });
    renderChapterCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 暴露给自检脚本（tests/check-video-entry.js） */
  window.__VIDEO__ = {
    VIDEOS: VIDEOS,
    MAP: MAP,
    entriesFor: entriesFor,
    masterOf: masterOf,
    hasVideo: hasVideo,
    entryUrl: entryUrl,
    TOP_HEAD: TOP_HEAD,
    BOTTOM_HEAD: BOTTOM_HEAD,
    EMPTY_TEXT: EMPTY_TEXT,
  };
})();
