<template>
  <div
    v-if="showMiniMap"
    class="navigatorBox"
    :class="{ isDark: isDark, hasActiveSidebar: !!activeSidebar }"
    ref="navigatorBox"
    :style="{ width: width + 'px' }"
    @mousedown="onMousedown"
    @mousemove="onMousemove"
  >
    <div
      class="svgBox"
      ref="svgBox"
      :style="{
        transform: `scale(${svgBoxScale})`,
        left: svgBoxLeft + 'px',
        top: svgBoxTop + 'px'
      }"
    >
      <img :src="mindMapImg" @mousedown.prevent />
    </div>
    <div
      class="windowBox"
      :style="viewBoxStyle"
      :class="{ withTransition: withTransition }"
      @mousedown.stop="onViewBoxMousedown"
      @mousemove="onViewBoxMousemove"
    ></div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      showMiniMap: false,
      timer: null,
      boxWidth: 0,
      boxHeight: 0,
      svgBoxScale: 1,
      svgBoxLeft: 0,
      svgBoxTop: 0,
      viewBoxStyle: {
        left: 0,
        top: 0,
        bottom: 0,
        right: 0
      },
      mindMapImg: '',
      width: 0,
      setSizeTimer: null,
      withTransition: true
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
  },
  mounted() {
    this.setSize()
    window.addEventListener('resize', this.setSize)
    this.$bus.$on('toggle_mini_map', this.toggle_mini_map)
    this.$bus.$on('data_change', this.data_change)
    this.$bus.$on('view_data_change', this.data_change)
    this.$bus.$on('node_tree_render_end', this.data_change)
    window.addEventListener('mouseup', this.onMouseup)
    this.mindMap.on(
      'mini_map_view_box_position_change',
      this.onViewBoxPositionChange
    )
  },
  destroyed() {
    window.removeEventListener('resize', this.setSize)
    this.$bus.$off('toggle_mini_map', this.toggle_mini_map)
    this.$bus.$off('data_change', this.data_change)
    this.$bus.$off('view_data_change', this.data_change)
    this.$bus.$off('node_tree_render_end', this.data_change)
    window.removeEventListener('mouseup', this.onMouseup)
    this.mindMap.off(
      'mini_map_view_box_position_change',
      this.onViewBoxPositionChange
    )
  },
  methods: {
    // 切换显示小地图
    toggle_mini_map(show) {
      this.showMiniMap = show
      this.$nextTick(() => {
        if (this.$refs.navigatorBox) {
          this.init()
        }
        if (this.$refs.svgBox) {
          this.drawMiniMap()
        }
      })
    },

    // 思维导图数据改变，更新小地图
    data_change() {
      if (!this.showMiniMap) {
        return
      }
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.drawMiniMap()
      }, 500)
    },

    // 计算容器宽度
    setSize() {
      clearTimeout(this.setSizeTimer)
      this.setSizeTimer = setTimeout(() => {
        this.width = Math.min(window.innerWidth - 80, 370)
        this.$nextTick(() => {
          if (this.showMiniMap) {
            this.init()
            this.drawMiniMap()
          }
        })
      }, 300)
    },

    // 获取宽高
    init() {
      let { width, height } = this.$refs.navigatorBox.getBoundingClientRect()
      this.boxWidth = width
      this.boxHeight = height
    },

    // 渲染小地图
    drawMiniMap() {
      let {
        getImgUrl,
        viewBoxStyle,
        miniMapBoxScale,
        miniMapBoxLeft,
        miniMapBoxTop
      } = this.mindMap.miniMap.calculationMiniMap(this.boxWidth, this.boxHeight)
      // 渲染到小地图
      getImgUrl(img => {
        this.mindMapImg = img
      })
      this.viewBoxStyle = viewBoxStyle
      this.svgBoxScale = miniMapBoxScale
      this.svgBoxLeft = miniMapBoxLeft
      this.svgBoxTop = miniMapBoxTop
    },

    // 小地图鼠标按下事件
    onMousedown(e) {
      this.mindMap.miniMap.onMousedown(e)
    },

    // 小地图鼠标移动事件
    onMousemove(e) {
      this.mindMap.miniMap.onMousemove(e)
    },

    // 鼠标松开事件，最好绑定要window
    onMouseup(e) {
      if (!this.withTransition) {
        this.withTransition = true
      }
      if (this.mindMap.miniMap) this.mindMap.miniMap.onMouseup(e)
    },

    // 视口框的鼠标按下事件
    onViewBoxMousedown(e) {
      this.mindMap.miniMap.onViewBoxMousedown(e)
    },

    // 视口框的鼠标移动事件
    onViewBoxMousemove(e) {
      this.mindMap.miniMap.onViewBoxMousemove(e)
    },

    // 视口框的位置大小改变了，需要更新
    onViewBoxPositionChange({ left, right, top, bottom }) {
      this.withTransition = false
      this.viewBoxStyle.left = left
      this.viewBoxStyle.right = right
      this.viewBoxStyle.top = top
      this.viewBoxStyle.bottom = bottom
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';
.navigatorBox {
  position: absolute;
  height: 220px;
  background-color: @panel-bg;
  backdrop-filter: saturate(180%) blur(16px);
  bottom: 80px;
  right: 70px;
  box-shadow: @shadow-float;
  border-radius: @radius-lg;
  border: 1px solid @border-weak;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  transition: right @duration-base @ease-out,
    background-color @duration-base @ease-out,
    border-color @duration-base @ease-out;

  &.isDark {
    background-color: @dark-panel-blur;
    border-color: @dark-border;
    box-shadow: @shadow-float;
  }

  &.hasActiveSidebar {
    right: @sidebar-width + 70px;
  }

  .svgBox {
    position: absolute;
    left: 0;
    transform-origin: left top;
  }

  .windowBox {
    position: absolute;
    border: 2px solid rgb(238, 69, 69);
    background-color: rgba(238, 69, 69, 0.2);

    &.withTransition {
      transition: all 0.3s;
    }
  }
}
</style>
