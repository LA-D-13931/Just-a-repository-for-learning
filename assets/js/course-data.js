/* 自动生成，请勿手改 —— 源文件 assets/course-data.json，生成脚本 tools/gen-course-data.py
   浏览器侧的唯一数据源（file:// 下不能 fetch JSON，故编译成全局常量）。 */
window.COURSE_DATA = {
  "_comment": "全站唯一数据源。顶栏、侧栏、底部导航、章节状态全部由它生成；禁止在页面里手写导航。改这里 → 跑 tools/build-shell.py → 跑 tools/check-shell.py。",
  "meta": {
    "site": {
      "zh": "高等数学学习站",
      "en": "Advanced Mathematics"
    },
    "tagline": {
      "zh": "同济八版骨架 · 托马斯映射 · 中英对照",
      "en": "Tongji outline · Thomas mapping · bilingual"
    },
    "defaultLang": "zh",
    "totalHours": 136.0,
    "reviewHours": 2
  },
  "chapters": [
    {
      "id": "ch1",
      "num": 1,
      "file": "chapters/ch1.html",
      "status": "built",
      "hours": 15.0,
      "title": {
        "zh": "函数与极限",
        "en": "Functions and Limits"
      },
      "sections": [
        "s1-1",
        "s1-2",
        "s1-3",
        "s1-4",
        "s1-5",
        "s1-6",
        "s1-7",
        "s1-8",
        "s1-9",
        "s1-10"
      ],
      "sectionHours": [
        2,
        1.5,
        2,
        1,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        1
      ],
      "card": {
        "desc": "映射与函数、数列与函数的极限、无穷小的比较、函数的连续性——整门课的地基。",
        "topics": [
          "映射与函数",
          "数列极限",
          "函数极限",
          "无穷小",
          "连续性",
          "间断点"
        ]
      },
      "thomas": "1–2"
    },
    {
      "id": "ch2",
      "num": 2,
      "file": "chapters/ch2.html",
      "status": "built",
      "hours": 10.0,
      "title": {
        "zh": "导数与微分",
        "en": "Derivatives and Differentials"
      },
      "sections": [
        "s2-1",
        "s2-2",
        "s2-3",
        "s2-4",
        "s2-5"
      ],
      "sectionHours": [
        2.5,
        3,
        1.5,
        1.5,
        1.5
      ],
      "card": {
        "desc": "导数定义与几何意义、求导法则、高阶导数、隐函数与参数方程求导、函数的微分。",
        "topics": [
          "导数定义",
          "求导法则",
          "高阶导数",
          "隐函数",
          "参数方程",
          "微分"
        ]
      },
      "thomas": "3"
    },
    {
      "id": "ch3",
      "num": 3,
      "file": "chapters/ch3.html",
      "status": "built",
      "hours": 13.0,
      "title": {
        "zh": "微分中值定理与导数的应用",
        "en": "Mean Value Theorems and Applications"
      },
      "sections": [
        "s3-1",
        "s3-2",
        "s3-3",
        "s3-4",
        "s3-5",
        "s3-6",
        "s3-7",
        "s3-8"
      ],
      "sectionHours": [
        1.5,
        1.5,
        1.5,
        1.5,
        2,
        2,
        2,
        1
      ],
      "card": {
        "desc": "微分中值定理、洛必达法则、泰勒公式、单调性与极值、凹凸性与曲率。",
        "topics": [
          "中值定理",
          "洛必达法则",
          "泰勒公式",
          "单调性",
          "凹凸与拐点",
          "极值最值",
          "曲率"
        ]
      },
      "thomas": "4"
    },
    {
      "id": "ch4",
      "num": 4,
      "file": "chapters/ch4.html",
      "status": "built",
      "hours": 10,
      "title": {
        "zh": "不定积分",
        "en": "Indefinite Integrals"
      },
      "sections": [
        "s4-1",
        "s4-2",
        "s4-3",
        "s4-4",
        "s4-5"
      ],
      "sectionHours": [
        2,
        2,
        2,
        2,
        2
      ],
      "card": {
        "desc": "原函数与基本积分表、两类换元积分法、分部积分法、有理函数的积分。",
        "topics": [
          "原函数",
          "基本积分表",
          "换元法",
          "分部积分",
          "有理函数"
        ]
      },
      "thomas": "4–5"
    },
    {
      "id": "ch5",
      "num": 5,
      "file": "chapters/ch5.html",
      "status": "built",
      "hours": 12.0,
      "title": {
        "zh": "定积分",
        "en": "Definite Integrals"
      },
      "sections": [
        "s5-1",
        "s5-2",
        "s5-3",
        "s5-4",
        "s5-5"
      ],
      "sectionHours": [
        2.5,
        2,
        2.5,
        2.5,
        2.5
      ],
      "card": {
        "desc": "定积分的定义与性质、微积分基本定理、换元与分部、反常积分。",
        "topics": [
          "定积分定义",
          "基本定理",
          "换元法",
          "分部积分",
          "反常积分"
        ]
      },
      "thomas": "5"
    },
    {
      "id": "ch6",
      "num": 6,
      "file": "chapters/ch6.html",
      "status": "built",
      "hours": 6.0,
      "title": {
        "zh": "定积分的应用",
        "en": "Applications of Definite Integrals"
      },
      "sections": [
        "s6-1",
        "s6-2",
        "s6-3"
      ],
      "sectionHours": [
        2,
        2.5,
        1.5
      ],
      "card": {
        "desc": "元素法、平面图形的面积、旋转体与已知截面立体的体积、平面曲线的弧长。",
        "topics": [
          "元素法",
          "平面面积",
          "体积",
          "弧长"
        ]
      },
      "thomas": "6"
    },
    {
      "id": "ch7",
      "num": 7,
      "file": "chapters/ch7.html",
      "status": "built",
      "hours": 12.0,
      "title": {
        "zh": "微分方程",
        "en": "Differential Equations"
      },
      "sections": [
        "s7-1",
        "s7-2",
        "s7-3",
        "s7-4",
        "s7-5",
        "s7-6",
        "s7-7",
        "s7-8"
      ],
      "sectionHours": [
        1,
        1.5,
        1.5,
        1.5,
        2,
        2,
        1.5,
        1
      ],
      "card": {
        "desc": "一阶微分方程、可降阶的高阶方程、二阶常系数线性方程。",
        "topics": [
          "一阶方程",
          "可降阶",
          "常系数线性",
          "初值问题"
        ]
      },
      "thomas": "9"
    },
    {
      "id": "ch8",
      "num": 8,
      "file": "chapters/ch8.html",
      "status": "built",
      "hours": 8.0,
      "title": {
        "zh": "向量代数与空间解析几何",
        "en": "Vectors and Analytic Geometry in Space"
      },
      "sections": [
        "s8-1",
        "s8-2",
        "s8-3",
        "s8-4",
        "s8-5",
        "s8-6"
      ],
      "sectionHours": [
        1.5,
        1.5,
        1.5,
        1.5,
        1,
        1
      ],
      "card": {
        "desc": "向量及其运算、平面与直线方程、曲面与空间曲线。",
        "topics": [
          "向量运算",
          "数量积",
          "平面",
          "直线",
          "曲面",
          "空间曲线"
        ]
      },
      "thomas": "12"
    },
    {
      "id": "ch9",
      "num": 9,
      "file": "chapters/ch9.html",
      "status": "built",
      "hours": 16.0,
      "title": {
        "zh": "多元函数微分法及其应用",
        "en": "Differential Calculus of Several Variables"
      },
      "sections": [
        "s9-1",
        "s9-2",
        "s9-3",
        "s9-4",
        "s9-5",
        "s9-6",
        "s9-7",
        "s9-8",
        "s9-9",
        "s9-10"
      ],
      "sectionHours": [
        2,
        1.5,
        2,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5
      ],
      "card": {
        "desc": "偏导数与全微分、复合函数求导、多元极值与最值、最小二乘法。",
        "topics": [
          "偏导数",
          "全微分",
          "复合求导",
          "极值最值",
          "最小二乘"
        ]
      },
      "thomas": "13"
    },
    {
      "id": "ch10",
      "num": 10,
      "file": "chapters/ch10.html",
      "status": "built",
      "hours": 8.0,
      "title": {
        "zh": "重积分",
        "en": "Multiple Integrals"
      },
      "sections": [
        "s10-1",
        "s10-2",
        "s10-3",
        "s10-4",
        "s10-5"
      ],
      "sectionHours": [
        1.5,
        2,
        1.5,
        1.5,
        1.5
      ],
      "card": {
        "desc": "二重积分、三重积分、重积分的应用。",
        "topics": [
          "二重积分",
          "三重积分",
          "极坐标",
          "应用"
        ]
      },
      "thomas": "14"
    },
    {
      "id": "ch11",
      "num": 11,
      "file": "chapters/ch11.html",
      "status": "built",
      "hours": 11.0,
      "title": {
        "zh": "曲线积分与曲面积分",
        "en": "Line and Surface Integrals"
      },
      "sections": [
        "s11-1",
        "s11-2",
        "s11-3",
        "s11-4",
        "s11-5",
        "s11-6",
        "s11-7"
      ],
      "sectionHours": [
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        2,
        1.5
      ],
      "card": {
        "desc": "两类曲线积分与曲面积分、格林公式、高斯公式、斯托克斯公式。",
        "topics": [
          "曲线积分",
          "曲面积分",
          "格林公式",
          "高斯公式",
          "斯托克斯"
        ]
      },
      "thomas": "15"
    },
    {
      "id": "ch12",
      "num": 12,
      "file": "chapters/ch12.html",
      "status": "built",
      "hours": 12.0,
      "title": {
        "zh": "无穷级数",
        "en": "Infinite Series"
      },
      "sections": [
        "s12-1",
        "s12-2",
        "s12-3",
        "s12-4",
        "s12-5",
        "s12-6",
        "s12-7",
        "s12-8"
      ],
      "sectionHours": [
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5,
        1.5
      ],
      "card": {
        "desc": "常数项级数、幂级数、傅里叶级数。",
        "topics": [
          "级数敛散",
          "幂级数",
          "傅里叶级数"
        ]
      },
      "thomas": "10"
    },
    {
      "id": "supp1",
      "num": 101,
      "file": "chapters/supp1.html",
      "status": "built",
      "hours": 3.0,
      "title": {
        "zh": "托马斯补充一：函数与变化率",
        "en": "Thomas Supplement 1"
      },
      "short": {
        "zh": "托马斯补充",
        "en": "Supplement"
      },
      "sections": [
        "tx1-1",
        "tx1-2"
      ],
      "sectionHours": [
        1.5,
        1.5
      ],
      "card": {
        "desc": "同济体系未单列、而托马斯 14 版独立成节的内容：软件绘图与作为变化率的导数。",
        "topics": [
          "数学软件绘图",
          "变化率",
          "导数"
        ]
      }
    }
  ],
  "tools": [
    {
      "id": "cheatsheet",
      "file": "cheatsheet.html",
      "status": "built",
      "title": {
        "zh": "公式速查表",
        "en": "Formula Sheet"
      }
    },
    {
      "id": "exam",
      "file": "exam.html",
      "status": "built",
      "title": {
        "zh": "综合自测卷",
        "en": "Mock Exam"
      }
    }
  ],
  "sections": {
    "_comment": "各节的显示名由章节页 h2 自动读取，此处不再手写。"
  }
};
