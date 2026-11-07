<template>
  <div
    class="sidebarContainer"
    @click.stop
    :class="{ show: show, isDark: isDark }"
    :style="{ zIndex: zIndex }"
  >
    <span class="closeBtn el-icon-close" @click="close"></span>
    <div class="sidebarHeader" v-if="title">
      {{ title }}
    </div>
    <div class="sidebarContent customScrollbar" ref="sidebarContent">
      <slot></slot>
    </div>
  </div>
</template>

<script>
import { store } from '@/config'
import { mapState, mapMutations } from 'vuex'

// 侧边栏容器
export default {
  props: {
    title: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      show: false,
      zIndex: 0
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  watch: {
    show(val, oldVal) {
      if (val && !oldVal) {
        this.zIndex = store.sidebarZIndex++
      }
    }
  },
  created() {
    this.$bus.$on('closeSideBar', this.handleCloseSidebar)
  },
  beforeDestroy() {
    this.$bus.$off('closeSideBar', this.handleCloseSidebar)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    handleCloseSidebar() {
      this.close()
    },

    close() {
      this.show = false
      this.setActiveSidebar(null)
    },

    getEl() {
      return this.$refs.sidebarContent
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';

.sidebarContainer {
  position: fixed;
  right: -@sidebar-width;
  top: 110px;
  bottom: 0;
  width: @sidebar-width;
  background-color: @panel-bg;
  backdrop-filter: saturate(180%) blur(16px);
  border-left: 1px solid @border-weak;
  display: flex;
  flex-direction: column;
  transition: all @duration-base @ease-out;

  &.isDark {
    background-color: @dark-panel-blur;
    border-left-color: @dark-border;

    .sidebarHeader {
      border-bottom-color: @dark-border;
      color: @dark-text-main;
    }

    .closeBtn {
      color: @dark-text-sub;

      &:hover {
        background-color: @dark-fill-hover;
        color: @dark-text-main;
      }
    }
  }

  &.show {
    right: 0;
    box-shadow: @shadow-panel;
  }

  .closeBtn {
    position: absolute;
    right: 12px;
    top: 8px;
    font-size: 16px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: @radius-sm;
    cursor: pointer;
    color: @text-sub;
    transition: background-color @duration-fast @ease-out,
      color @duration-fast @ease-out;

    &:hover {
      background-color: @fill-hover;
      color: @text-main;
    }
  }

  .sidebarHeader {
    width: 100%;
    height: 44px;
    border-bottom: 1px solid @border-weak;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-grow: 0;
    flex-shrink: 0;
  }

  .sidebarContent {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
}
</style>
