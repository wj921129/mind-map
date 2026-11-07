<template>
  <div
    class="sidebarTriggerContainer "
    @click.stop
    :class="{ hasActive: show && activeSidebar, show: show, isDark: isDark }"
    :style="{ maxHeight: maxHeight + 'px' }"
  >
    <div class="toggleShowBtn" :class="{ hide: !show }" @click="show = !show">
      <span class="iconfont iconjiantouyou"></span>
    </div>
    <div class="trigger customScrollbar">
      <div
        class="triggerItem"
        v-for="item in triggerList"
        :key="item.value"
        :class="{ active: activeSidebar === item.value }"
        @click="trigger(item)"
      >
        <div class="triggerIcon iconfont" :class="[item.icon]"></div>
        <div class="triggerName">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { sidebarTriggerList } from '@/config'

// 侧边栏触发器
export default {
  data() {
    return {
      show: true,
      maxHeight: 0
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      isReadonly: state => state.isReadonly,
      enableAi: state => state.localConfig.enableAi
    }),

    triggerList() {
      let list = sidebarTriggerList[this.$i18n.locale] || sidebarTriggerList.zh
      if (this.isReadonly) {
        list = list.filter(item => {
          return ['outline', 'shortcutKey', 'ai'].includes(item.value)
        })
      }
      if (!this.enableAi) {
        list = list.filter(item => {
          return item.value !== 'ai'
        })
      }
      return list
    }
  },
  watch: {
    isReadonly(val) {
      if (val) {
        this.setActiveSidebar(null)
      }
    }
  },
  created() {
    window.addEventListener('resize', this.onResize)
    this.updateSize()
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.onResize)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    trigger(item) {
      this.setActiveSidebar(item.value)
    },

    onResize() {
      this.updateSize()
    },

    updateSize() {
      const topMargin = 110
      const bottomMargin = 80
      this.maxHeight = window.innerHeight - topMargin - bottomMargin
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';

.sidebarTriggerContainer {
  position: fixed;
  top: 110px;
  bottom: 80px;
  right: -60px;
  transition: all @duration-base @ease-out;
  display: flex;
  flex-direction: column;
  justify-content: center;

  &.isDark {
    .toggleShowBtn {
      background: @primary-deep;
      border: 1px solid @dark-border;
      border-right: none;

      &:hover {
        box-shadow: -2px 0 12px rgba(58, 142, 230, 0.3);
      }
    }
    .trigger {
      background-color: @dark-panel-blur;
      backdrop-filter: saturate(180%) blur(16px);
      border-color: @dark-border;

      .triggerItem {
        color: @dark-text-sub;

        &:hover {
          background-color: @dark-fill-hover;
        }
      }
    }
  }

  &.show {
    right: 0;
  }

  &.hasActive {
    right: @sidebar-width + @sidebar-gap;
  }

  .toggleShowBtn {
    position: absolute;
    left: -6px;
    width: 35px;
    height: 60px;
    background: @primary;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    transition: left @duration-fast @ease-out,
      box-shadow @duration-fast @ease-out,
      background-color @duration-fast @ease-out,
      border-color @duration-fast @ease-out;
    border: 1px solid transparent;
    border-right: none;
    z-index: 0;
    border-top-left-radius: @radius-lg;
    border-bottom-left-radius: @radius-lg;
    display: flex;
    align-items: center;
    padding-left: 4px;

    &.hide {
      left: -8px;

      span {
        transform: rotateZ(180deg);
      }
    }

    &:hover {
      left: -18px;
      box-shadow: -2px 0 12px rgba(64, 158, 255, 0.35);
    }

    span {
      color: #fff;
      transition: transform @duration-fast @ease-out;
    }
  }

  .trigger {
    position: relative;
    width: 60px;
    border: 1px solid @border-weak;
    background-color: @panel-bg;
    backdrop-filter: saturate(180%) blur(16px);
    box-shadow: @shadow-panel;
    border-radius: @radius-lg;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;

    .triggerItem {
      height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      color: @text-sub;
      user-select: none;
      white-space: nowrap;
      transition: background-color @duration-fast @ease-out,
        color @duration-fast @ease-out;

      &:hover {
        background-color: @fill-hover;
      }

      &.active {
        color: @primary;
        font-weight: bold;
      }

      .triggerIcon {
        font-size: 18px;
        margin-bottom: 5px;
      }

      .triggerName {
        font-size: @font-size-base;
      }
    }
  }
}
</style>
