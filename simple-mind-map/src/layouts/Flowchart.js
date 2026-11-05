import Base from './Base'
import { walk, asyncRun, createUid } from '../utils'
import { CONSTANTS } from '../constants/constant'

//  节点角色
//  decision：判断节点，存在多条分叉分支；flowchart 下渲染为菱形，flowchart2 下渲染为矩形
//  condition：条件节点，挂在父子连接线上的紧凑白底小标签
//  action：执行节点，普通矩形卡片（含开始节点与末端节点）
const ROLE = {
  DECISION: 'decision',
  CONDITION: 'condition',
  ACTION: 'action'
}

// 分叉树枝之间的水平间距
const BRANCH_GAP = 44
// 判断节点到条件框的垂直间距，预留菱形底顶点下方正交折线横梁空间
const MARGIN_TO_CONDITION = 44
// 条件框到下游步骤节点的垂直间距，让条件框紧贴在下游节点箭头上方
const MARGIN_FROM_CONDITION = 28
// 普通父子节点之间的垂直间距
const MARGIN_NORMAL = 48
// 正交折线安全横梁相对节点底部（含展开按钮）的额外间距
const BUS_GAP = 18
// 菱形判断框的形状附加内边距系数
// 默认菱形会把内容宽、高各加一半作为内边距，导致菱形尺寸爆炸、文字占比过低
const DIAMOND_SHAPE_PADDING_X_RATIO = 0.28
const DIAMOND_SHAPE_PADDING_Y_RATIO = 0.45
// 条件节点缺少可参考高度时的兜底高度
const DEFAULT_CONDITION_HEIGHT = 28

// 写法②的条件前缀正则，排除【判断】【步骤】【动作】【注意】【说明】等非条件标记
const CONDITION_PREFIX_REG = /^【(?!(?:判断|步骤|动作|注意|说明))([^】]+)】\s*([\s\S]+)$/
// 条件表达式语义特征正则
const CONDITION_TEXT_REG = /([=!<>]=?|&&|\|\||\bIN\b|\bNOT\b|\btrue\b|\bfalse\b|\byes\b|\bno\b|是否|满足|否则|当[\s\S]*则|若)/i

// 主题主色缺失时的回退主色
const FALLBACK_MAIN_COLOR = '#5476a5'

// 去除文本中的 HTML 标签，得到用于角色判定的纯文本
const getPlainText = text => {
  if (!text) return ''
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// 数值区间收敛
const clampNum = (value, min, max) => {
  if (value < min) return min
  if (value > max) return max
  return value
}

// 解析颜色为 RGB 对象，无法识别时返回 null
const parseColor = color => {
  if (typeof color !== 'string') return null
  let value = color.trim()
  if (!value || value === 'transparent') return null
  if (value[0] === '#') {
    value = value.slice(1)
    if (value.length === 3) {
      value = value
        .split('')
        .map(item => item + item)
        .join('')
    }
    if (value.length < 6) return null
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    return { r, g, b }
  }
  const match = value.match(/rgba?\(([^)]+)\)/i)
  if (!match) return null
  const arr = match[1].split(',').map(item => parseFloat(item))
  if (arr.length < 3 || arr.some(item => isNaN(item))) return null
  return { r: arr[0], g: arr[1], b: arr[2] }
}

// RGB 分量转十六进制
const toHex = value => {
  return Math.round(clampNum(value, 0, 255))
    .toString(16)
    .padStart(2, '0')
}

// 两个颜色按比例混合，ratio 为 colorA 的占比
const mixColor = (colorA, colorB, ratio) => {
  const a = parseColor(colorA)
  const b = parseColor(colorB)
  if (!a || !b) return colorB || colorA
  return `#${toHex(a.r * ratio + b.r * (1 - ratio))}${toHex(
    a.g * ratio + b.g * (1 - ratio)
  )}${toHex(a.b * ratio + b.b * (1 - ratio))}`
}

// 判断颜色是否为浅色，无法识别时按浅色处理
const isLightColor = color => {
  if (typeof color !== 'string' || !color) return true
  let value = color.trim()
  if (!value || value === 'transparent') return true
  let r = 0
  let g = 0
  let b = 0
  if (value[0] === '#') {
    value = value.slice(1)
    if (value.length === 3) {
      value = value
        .split('')
        .map(item => item + item)
        .join('')
    }
    if (value.length < 6) return true
    r = parseInt(value.slice(0, 2), 16)
    g = parseInt(value.slice(2, 4), 16)
    b = parseInt(value.slice(4, 6), 16)
  } else {
    const match = value.match(/rgba?\(([^)]+)\)/i)
    if (!match) return true
    const arr = match[1].split(',').map(item => parseFloat(item))
    r = arr[0]
    g = arr[1]
    b = arr[2]
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return true
  return r * 0.299 + g * 0.587 + b * 0.114 >= 128
}

//  流程图布局（方案 A1 / A2）
//  flowchart：自上而下树状分叉 + 菱形判断框 + 连线白底条件框 + 矩形执行框
//  flowchart2：自上而下树状分叉 + 统一矩形判断框 + 连线白底条件框
class Flowchart extends Base {
  constructor(opt = {}, layout) {
    super(opt)
    this.layout = layout
    // 角色派生样式缓存与缩放箭头缓存，按主题/系数复用
    this._roleStyleCache = null
    this._roleStyleCacheKey = ''
    this._scaledMarkerCache = {}
  }

  //  布局（两阶段坐标计算流水线）
  doLayout(callback) {
    let task = [
      () => {
        this.computedBaseValue()
      },
      () => {
        this.computedLeftValue()
      },
      () => {
        callback(this.root)
      }
    ]
    asyncRun(task)
  }

  //  第一阶段：创建节点、计算纵坐标 top 与子树总宽 childrenAreaWidth
  computedBaseValue() {
    // 前序遍历：创建节点，同时完成写法②的条件前缀预解糖
    walk(
      this.renderer.renderTree,
      null,
      (cur, parent, isRoot, layerIndex, index, ancestors) => {
        this.normalizeConditionPrefix(cur, parent, isRoot)
        let newNode = this.createNode(
          cur,
          parent,
          isRoot,
          layerIndex,
          index,
          ancestors
        )
        // 根节点定位在画布中心位置
        if (isRoot) {
          this.setNodeCenter(newNode)
        }
        if (!cur.data.expand) {
          return true
        }
      },
      null,
      true,
      0
    )
    // 前序遍历：计算纵坐标，此时全部节点均已创建，可安全获取兄弟分支的高度
    walk(
      this.root,
      null,
      (node, parent, isRoot) => {
        this.computedTop(node, parent, isRoot)
      },
      null,
      true,
      0
    )
    // 后序遍历：自底向上汇总子树总宽，用于多级树枝水平避让
    walk(
      this.root,
      null,
      null,
      node => {
        this.computedChildrenAreaWidth(node)
      },
      true,
      0
    )
  }

  //  第二阶段：自顶向下按子树列宽分配横坐标 left
  computedLeftValue() {
    walk(
      this.root,
      null,
      node => {
        this.computedLeft(node)
      },
      null,
      true,
      0
    )
  }

  //  计算节点纵坐标：全图自上而下推进
  computedTop(node, parent, isRoot) {
    if (isRoot || !parent) {
      return
    }
    node.top = parent.top + parent.height + this.getFlowchartMarginY(parent, node)
  }

  //  计算父子节点之间的垂直间距
  getFlowchartMarginY(parentNode, node) {
    // 判断节点 → 条件框：预留菱形底顶点下方的横梁空间
    if (this.getFlowchartNodeRole(node) === ROLE.CONDITION) {
      return MARGIN_TO_CONDITION
    }
    // 条件框 → 下游步骤节点：紧凑间距，还原条件标签紧贴箭头上方的效果
    if (this.getFlowchartNodeRole(parentNode) === ROLE.CONDITION) {
      return MARGIN_FROM_CONDITION
    }
    // 混合分支对齐：同一次分叉中既有条件分支又有直连分支时，补齐条件框占用的高度
    if (this.checkIsMixedBranch(parentNode, node)) {
      return (
        MARGIN_TO_CONDITION +
        MARGIN_FROM_CONDITION +
        this.getSiblingConditionHeight(parentNode)
      )
    }
    return MARGIN_NORMAL
  }

  //  判断当前分支是否属于「部分分支带条件框、部分分支直连下游步骤」的混合分叉
  checkIsMixedBranch(parentNode, node) {
    const children = parentNode.children || []
    if (children.length < 2) return false
    return children.some(item => {
      return (
        item !== node && this.getFlowchartNodeRole(item) === ROLE.CONDITION
      )
    })
  }

  //  获取兄弟条件节点的平均高度，用于混合分支对齐
  getSiblingConditionHeight(parentNode) {
    const conditions = (parentNode.children || []).filter(item => {
      return this.getFlowchartNodeRole(item) === ROLE.CONDITION
    })
    if (!conditions.length) return DEFAULT_CONDITION_HEIGHT
    const total = conditions.reduce((sum, item) => sum + item.height, 0)
    return total / conditions.length
  }

  //  计算节点横坐标：单子节点中心对齐父节点，多子节点按分支列宽围绕父节点中心分配
  computedLeft(node) {
    const children = node.children || []
    if (children.length <= 0) {
      return
    }
    const centerX = node.left + node.width / 2
    if (children.length === 1) {
      children[0].left = centerX - children[0].width / 2
      return
    }
    const totalWidth = node.childrenAreaWidth || 0
    let cursorX = centerX - totalWidth / 2
    children.forEach(item => {
      const colWidth = Math.max(item.width, item.childrenAreaWidth || 0)
      const colCenterX = cursorX + colWidth / 2
      item.left = colCenterX - item.width / 2
      cursorX += colWidth + BRANCH_GAP
    })
  }

  //  自底向上汇总子树总宽 childrenAreaWidth
  computedChildrenAreaWidth(node) {
    const children = node.children || []
    const len = children.length
    if (len <= 0) {
      node.childrenAreaWidth = 0
      return
    }
    // 单子节点：取子节点自身宽度与其子树宽度的较大值，不叠加额外外边距
    if (len === 1) {
      const child = children[0]
      node.childrenAreaWidth = Math.max(
        child.width,
        child.childrenAreaWidth || 0
      )
      return
    }
    // 多子节点：累加各分支列宽，并叠加分支间距
    let total = (len - 1) * BRANCH_GAP
    children.forEach(item => {
      total += Math.max(item.width, item.childrenAreaWidth || 0)
    })
    node.childrenAreaWidth = total
  }

  //  写法②的条件前缀预解糖：将「【条件】步骤」拆解为外层条件节点 + 内层步骤节点
  //  通过 _prefixDesugared 标记保证多次重绘幂等，严禁重复包裹
  normalizeConditionPrefix(cur, parent, isRoot) {
    if (!cur || !cur.data || isRoot) return
    if (cur.data._prefixDesugared) return
    if (cur.data.flowchartRole === ROLE.CONDITION) return
    // 父节点已经是条件节点时不再嵌套拆解
    if (
      parent &&
      this.getFlowchartNodeRole(parent, null, false) === ROLE.CONDITION
    ) {
      return
    }
    const text = getPlainText(cur.data.text)
    const match = text.match(CONDITION_PREFIX_REG)
    if (!match) return
    const conditionText = (match[1] || '').trim()
    const stepText = (match[2] || '').trim()
    if (!conditionText || !stepText) return
    // 外层节点改造为条件节点
    cur.data.text = conditionText
    cur.data.richText = false
    cur.data.flowchartRole = ROLE.CONDITION
    cur.data._prefixDesugared = true
    // 内层新建步骤节点，继承原节点的全部子节点
    const stepNode = {
      data: {
        text: stepText,
        uid: createUid()
      },
      children: cur.children || []
    }
    cur.children = [stepNode]
  }

  //  解析节点角色判定所需的信息，兼容 MindMapNode 实例与 renderTree 原始节点对象
  getRoleCheckInfo(nodeOrData) {
    if (!nodeOrData) return null
    // MindMapNode 实例
    if (nodeOrData.nodeData && nodeOrData.nodeData.data) {
      const data = nodeOrData.nodeData
      return {
        data: data.data,
        children: data.children || [],
        isRoot: nodeOrData.isRoot === true,
        parent: nodeOrData.parent || null
      }
    }
    // renderTree 原始节点对象
    if (nodeOrData.data) {
      const node = nodeOrData._node || null
      return {
        data: nodeOrData.data,
        children: nodeOrData.children || [],
        isRoot: node ? node.isRoot === true : false,
        parent: node ? node.parent || null : null
      }
    }
    return null
  }

  //  判定节点角色
  getFlowchartNodeRole(nodeOrData, parentData, isRoot) {
    const info = this.getRoleCheckInfo(nodeOrData)
    if (!info) return ROLE.ACTION
    const rootFlag = isRoot === undefined ? info.isRoot : isRoot
    // 根节点始终作为执行节点渲染
    if (rootFlag) return ROLE.ACTION
    const data = info.data
    // 显式标记优先
    if (data.flowchartRole === ROLE.CONDITION) return ROLE.CONDITION
    if (data.flowchartRole === ROLE.DECISION) return ROLE.DECISION
    const text = getPlainText(data.text)
    if (/^【判断】|^\[判断\]/.test(text)) return ROLE.DECISION
    const childrenLen = info.children.length
    // 条件节点：自身恰好只有一个下游子节点，且具备条件语义特征
    if (childrenLen === 1 && this.checkIsConditionNode(text, parentData || info.parent)) {
      return ROLE.CONDITION
    }
    // 判断节点：存在多条分叉分支
    if (childrenLen >= 2) return ROLE.DECISION
    return ROLE.ACTION
  }

  //  判定节点是否具备条件节点特征
  checkIsConditionNode(text, parentData) {
    // 显式条件标记
    if (/^【条件】|^\[条件\]/.test(text)) return true
    // 条件表达式特征：控制在两行以内，避免普通长句业务描述被误判
    const lines = text.split(/\n/).filter(item => item.trim())
    if (lines.length <= 2 && CONDITION_TEXT_REG.test(text)) return true
    // 分叉全条件特征：父节点的所有分支均恰好只有一个下游节点
    return this.checkIsAllBranchCondition(parentData)
  }

  //  判断父节点是否属于「判断框 → 多条条件分支 → 各分支下游步骤」的典型结构
  checkIsAllBranchCondition(parentData) {
    const parentInfo = this.getRoleCheckInfo(parentData)
    if (!parentInfo) return false
    const siblings = parentInfo.children
    if (!siblings || siblings.length < 2) return false
    return siblings.every(item => (item.children || []).length === 1)
  }

  //  布局默认形状：flowchart 下判断节点渲染为菱形，其余为矩形
  getNodeDefaultShape(node) {
    if (this.layout !== CONSTANTS.LAYOUT.FLOWCHART) {
      return CONSTANTS.SHAPE.RECTANGLE
    }
    return this.getFlowchartNodeRole(node) === ROLE.DECISION
      ? CONSTANTS.SHAPE.DIAMOND
      : CONSTANTS.SHAPE.RECTANGLE
  }

  //  布局形状内边距覆写：收紧菱形判断框尺寸
  //  默认形状内边距会把内容宽高各加一半，菱形体积爆炸且文字占比过低，
  //  这里按内容尺寸比例收紧，让菱形与条件框、执行框的尺寸语言保持一致
  getNodeShapePadding(node, width, height, paddingX, paddingY) {
    if (this.layout !== CONSTANTS.LAYOUT.FLOWCHART) {
      return null
    }
    if (this.getFlowchartNodeRole(node) !== ROLE.DECISION) {
      return null
    }
    // 用户手动指定过形状时，尊重用户选择，不做菱形收紧
    if (node.getShape && node.getShape() !== CONSTANTS.SHAPE.DIAMOND) {
      return null
    }
    return {
      paddingX: width * DIAMOND_SHAPE_PADDING_X_RATIO,
      paddingY: height * DIAMOND_SHAPE_PADDING_Y_RATIO
    }
  }

  //  布局角色默认样式，优先级低于用户节点自定义样式、高于主题默认样式
  //  配色由主题主色派生，换任何主题流程图都自动保持同族协调
  getNodeDefaultStyle(node, prop) {
    if (!node || node.isGeneralization) return undefined
    const role = this.getFlowchartNodeRole(node)
    const roleStyle = this.getRoleStyle(role)
    return roleStyle ? roleStyle[prop] : undefined
  }

  //  获取主题主色：优先根节点填充色，其次二级节点边框/填充色
  getThemeMainColor() {
    const themeConfig = this.mindMap.themeConfig || {}
    const candidates = [
      themeConfig.root && themeConfig.root.fillColor,
      themeConfig.second && themeConfig.second.borderColor,
      themeConfig.second && themeConfig.second.fillColor
    ]
    for (let i = 0; i < candidates.length; i++) {
      if (parseColor(candidates[i])) {
        return candidates[i]
      }
    }
    return FALLBACK_MAIN_COLOR
  }

  //  获取主题背景色
  getThemeBgColor() {
    const bg = (this.mindMap.themeConfig || {}).backgroundColor
    return parseColor(bg) ? bg : '#ffffff'
  }

  //  生成浅色主题下的角色配色：主色淡化做底、主色中间调做边框、主色加深做文字
  getLightRoleStyle(role, main, bg) {
    if (role === ROLE.DECISION) {
      return {
        fillColor: mixColor(main, bg, 0.12),
        borderColor: mixColor(main, bg, 0.55),
        borderWidth: 1.5,
        borderRadius: 0,
        color: mixColor(main, '#000000', 0.75)
      }
    }
    if (role === ROLE.CONDITION) {
      return {
        // 条件框是骑在连线上的轻量标签：比背景亮一档但不抢戏
        fillColor: mixColor('#ffffff', bg, 0.55),
        borderColor: mixColor(main, bg, 0.45),
        borderWidth: 1,
        borderRadius: 3,
        color: mixColor(main, '#000000', 0.65),
        fontSize: 12,
        paddingX: 10,
        paddingY: 5
      }
    }
    return {
      // 执行框是实体步骤节点：近白底突出主体
      fillColor: mixColor('#ffffff', bg, 0.85),
      borderColor: mixColor(main, bg, 0.6),
      borderWidth: 1.5,
      borderRadius: 2,
      color: mixColor(main, '#000000', 0.8)
    }
  }

  //  生成深色主题下的角色配色：主色压暗做底、主色提亮做边框与文字
  getDarkRoleStyle(role, main, bg) {
    if (role === ROLE.CONDITION) {
      return {
        // 深色下条件框用暗底提亮一档，避免亮白补丁扎眼
        fillColor: mixColor('#ffffff', bg, 0.12),
        borderColor: mixColor(main, bg, 0.5),
        borderWidth: 1,
        borderRadius: 3,
        color: mixColor(main, '#ffffff', 0.85),
        fontSize: 12,
        paddingX: 10,
        paddingY: 5
      }
    }
    if (role === ROLE.DECISION) {
      return {
        fillColor: mixColor(main, bg, 0.3),
        borderColor: mixColor(main, bg, 0.55),
        borderWidth: 1.5,
        borderRadius: 0,
        color: mixColor(main, '#ffffff', 0.9)
      }
    }
    return {
      fillColor: mixColor(main, bg, 0.22),
      borderColor: mixColor(main, bg, 0.5),
      borderWidth: 1.5,
      borderRadius: 2,
      color: mixColor(main, '#ffffff', 0.88)
    }
  }

  //  获取指定角色的派生样式，按主题缓存，避免每次样式合并重复计算
  getRoleStyle(role) {
    const themeConfig = this.mindMap.themeConfig || {}
    const cacheKey = `${themeConfig.backgroundColor}|${this.getThemeMainColor()}`
    if (this._roleStyleCacheKey !== cacheKey) {
      this._roleStyleCacheKey = cacheKey
      const main = this.getThemeMainColor()
      const bg = this.getThemeBgColor()
      const isLight = this.checkIsLightTheme()
      const roles = [ROLE.DECISION, ROLE.CONDITION, ROLE.ACTION]
      this._roleStyleCache = {}
      roles.forEach(item => {
        this._roleStyleCache[item] = isLight
          ? this.getLightRoleStyle(item, main, bg)
          : this.getDarkRoleStyle(item, main, bg)
      })
    }
    return this._roleStyleCache ? this._roleStyleCache[role] : undefined
  }

  //  获取流程图连线颜色：与角色节点同族的主题派生色
  //  主题自带的连线色（如牛油果的淡黄绿）与角色节点配色分属两个家族，直接使用会显得花
  getFlowchartLineColor() {
    const main = this.getThemeMainColor()
    const bg = this.getThemeBgColor()
    return this.checkIsLightTheme()
      ? mixColor(main, bg, 0.55)
      : mixColor(main, bg, 0.6)
  }

  //  判断节点及其祖先是否自定义过连线颜色，自定义则尊重用户设置不做覆写
  checkHasCustomLineColor(node) {
    let cur = node
    while (cur) {
      if (
        typeof cur.getSelfStyle === 'function' &&
        cur.getSelfStyle('lineColor')
      ) {
        return true
      }
      cur = cur.parent
    }
    return false
  }

  //  判断当前主题是否为浅色主题
  checkIsLightTheme() {
    const themeConfig = this.mindMap.themeConfig || {}
    return isLightColor(themeConfig.backgroundColor)
  }

  //  绘制连线
  //  流程图统一采用自上而下的正交折线，不再区分主题的曲线/直连风格
  renderLine(node, lines, style, lineStyle) {
    const children = node.children || []
    if (children.length <= 0) {
      return []
    }
    let expandBtnSize = node.expandBtnSize || 0
    const { notShowExpandBtn } = this.mindMap.opt
    // 展开收起按钮被完全禁用、或当前节点不渲染展开按钮时，不需要为按钮预留空间
    if (notShowExpandBtn || this.nodeIsRemoveExpandBtn(node)) {
      expandBtnSize = 0
    }
    const centerX = node.left + node.width / 2
    const bottomY = node.top + node.height
    const minChildTop = children.reduce((min, item) => {
      return item.top < min ? item.top : min
    }, children[0].top)
    // 安全横梁：锚定在展开按钮下方，同时不得低于子节点顶部
    let busY = bottomY + expandBtnSize + BUS_GAP
    if (busY > minChildTop - 4) {
      busY = minChildTop - 4
    }
    if (busY < bottomY + 2) {
      busY = bottomY + 2
    }
    const isBranch = children.length >= 2
    children.forEach((item, index) => {
      const childCenterX = item.left + item.width / 2
      let path = ''
      if (!isBranch && Math.abs(childCenterX - centerX) < 0.5) {
        // 单分支且水平对齐：从节点底边垂直直连，展开按钮骑在连线上
        path = `M ${centerX},${bottomY} L ${childCenterX},${item.top}`
      } else {
        // 多分支：统一从节点底边下折至安全横梁，再分叉落到各子节点
        // 菱形判断框同样从底顶点出线，与普通矩形保持正交一致性
        path = this.createFoldLine([
          [centerX, bottomY],
          [centerX, busY],
          [childCenterX, busY],
          [childCenterX, item.top]
        ])
      }
      this.setLineStyle(style, lines[index], path, item)
    })
  }

  //  设置连线样式：进入条件白框不画箭头，进入下游步骤节点强制画箭头
  setLineStyle(style, line, path, childNode) {
    line.plot(this.transformPath(path))
    const isCondition =
      this.getFlowchartNodeRole(childNode) === ROLE.CONDITION
    const enableMarker = !isCondition
    style && style(line, childNode, enableMarker)
    // 用户没有自定义连线颜色时，将连线覆写为与角色节点同族的主题派生色
    if (!this.checkHasCustomLineColor(childNode)) {
      line.stroke({ color: this.getFlowchartLineColor() })
    }
    // 主题未开启 showLineMarker 时，也要为进入下游步骤节点的连线补上箭头
    if (enableMarker && !this.checkHasLineMarker(line)) {
      this.addLineMarker(line, childNode)
    }
  }

  //  判断连线是否已经带有箭头标记
  checkHasLineMarker(line) {
    const isMarker = val => {
      return typeof val === 'string' && val.indexOf('url(') === 0
    }
    return isMarker(line.attr('marker-end')) || isMarker(line.attr('marker-start'))
  }

  //  为连线补充箭头标记：尺寸随线宽等比缩放，避免细线配巨箭、粗线配小箭
  addLineMarker(line, childNode) {
    const lineWidth = parseFloat(line.attr('stroke-width')) || 1
    // 以 4px 线宽为基准缩放，限制在 0.45 ~ 1.2 倍之间
    const scale = this.clamp(lineWidth / 4, 0.45, 1.2)
    const marker = this.getScaledMarker(childNode, scale)
    if (!marker) return
    const markerPath = marker.findOne('path')
    const color = line.attr('stroke')
    if (
      markerPath &&
      typeof color === 'string' &&
      color &&
      color !== 'none'
    ) {
      markerPath.stroke({ color }).fill({ color })
    }
    line.attr('marker-start', '')
    line.attr('marker-end', '')
    line.marker(childNode.style.merge('lineMarkerDir') || 'end', marker)
  }

  //  按缩放系数获取箭头标记，同一系数复用同一实例，避免 defs 中堆积
  getScaledMarker(childNode, scale) {
    const lineDraw = childNode.lineDraw
    if (!lineDraw || typeof lineDraw.marker !== 'function') return null
    const key = scale.toFixed(2)
    if (this._scaledMarkerCache[key]) {
      return this._scaledMarkerCache[key]
    }
    const size = 20 * scale
    const marker = lineDraw.marker(size, size, add => {
      add.ref(8 * scale, 5 * scale)
      add.size(size, size)
      add.attr('markerUnits', 'userSpaceOnUse')
      add.attr('orient', 'auto-start-reverse')
      add.path(
        `M0,0 L${2 * scale},${5 * scale} L0,${10 * scale} L${10 * scale},${5 * scale} Z`
      )
    })
    this._scaledMarkerCache[key] = marker
    return marker
  }

  //  数值区间收敛
  clamp(value, min, max) {
    if (value < min) return min
    if (value > max) return max
    return value
  }

  //  两点之间的直线距离
  getPointsDistance(a, b) {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
  }

  //  创建折线路径：所有中间拐角均做圆角处理
  //  基类只对最后一个拐角加圆角，流程图的多段正交折线需要各拐角对称圆角
  createFoldLine(list) {
    const { lineRadius } = this.mindMap.themeConfig
    const len = list.length
    if (len < 3 || !(lineRadius > 0)) {
      return this.createStraightLine(list)
    }
    let path = ''
    list.forEach((center, index) => {
      if (index === 0) {
        path += `M ${center[0]},${center[1]}`
        return
      }
      if (index === len - 1) {
        path += ` L ${center[0]},${center[1]}`
        return
      }
      const start = list[index - 1]
      const end = list[index + 1]
      // 三点共线时不需要圆角
      const isOneLine =
        (start[0].toFixed(0) === center[0].toFixed(0) &&
          center[0].toFixed(0) === end[0].toFixed(0)) ||
        (start[1].toFixed(0) === center[1].toFixed(0) &&
          center[1].toFixed(0) === end[1].toFixed(0))
      if (isOneLine) {
        path += ` L ${center[0]},${center[1]}`
        return
      }
      // 圆角半径不能超过相邻段长度的一半，避免窄横梁处圆角过冲
      const radius = Math.min(
        lineRadius,
        this.getPointsDistance(start, center) / 2,
        this.getPointsDistance(center, end) / 2
      )
      const cStart = this.computeNewPoint(start, center, radius)
      const cEnd = this.computeNewPoint(end, center, radius)
      path += ` L ${cStart[0]},${cStart[1]} Q ${center[0]},${center[1]} ${cEnd[0]},${cEnd[1]}`
    })
    return path
  }

  //  创建直线路径：无圆角配置时的降级拼接
  createStraightLine(list) {
    return list
      .map((item, index) => {
        return index === 0
          ? `M ${item[0]},${item[1]}`
          : `L ${item[0]},${item[1]}`
      })
      .join(' ')
  }

  //  渲染展开/收起按钮，统一定位在节点底边正中
  renderExpandBtn(node, btn) {
    const { width, height, expandBtnSize } = node
    let { translateX, translateY } = btn.transform()
    btn.translate(
      width / 2 - expandBtnSize / 2 - translateX,
      height + expandBtnSize / 2 - translateY
    )
  }

  //  条件标签节点不渲染展开收起按钮：它骑在父子连线上，并非实体步骤节点
  nodeIsRemoveExpandBtn(node) {
    return this.getFlowchartNodeRole(node) === ROLE.CONDITION
  }

  //  渲染展开收起按钮的隐藏占位元素
  renderExpandBtnRect(rect, expandBtnSize, width, height, node) {
    rect.size(width, expandBtnSize).x(0).y(height)
  }

  //  渲染概要节点：全图自上而下生长，因此概要挂在子树下方
  renderGeneralization(list) {
    list.forEach(item => {
      let {
        bottom,
        left,
        right,
        generalizationLineMargin,
        generalizationNodeMargin
      } = this.getNodeGeneralizationRenderBoundaries(item, 'v')
      let x1 = left
      let y1 = bottom + generalizationLineMargin
      let x2 = right
      let y2 = y1
      let cx = x1 + (x2 - x1) / 2
      let cy = y1 + 20
      let path = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`
      item.generalizationLine.plot(this.transformPath(path))
      item.generalizationNode.top = bottom + generalizationNodeMargin
      item.generalizationNode.left =
        left + (right - left - item.generalizationNode.width) / 2
    })
  }
}

// 节点角色枚举
Flowchart.ROLE = ROLE

export default Flowchart
