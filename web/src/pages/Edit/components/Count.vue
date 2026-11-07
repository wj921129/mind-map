<template>
  <div class="countContainer" :class="{ isDark: isDark }">
    <div class="item">
      <span class="name">{{ $t('count.words') }}</span>
      <span class="value">{{ words }}</span>
    </div>
    <div class="item">
      <span class="name">{{ $t('count.nodes') }}</span>
      <span class="value">{{ num }}</span>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

// 字数及节点数量统计
let countEl = document.createElement('div')
export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      textStr: '',
      words: 0,
      num: 0
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    this.$bus.$on('data_change', this.onDataChange)
    if (this.mindMap) {
      this.onDataChange(this.mindMap.getData())
    }
  },
  beforeDestroy() {
    this.$bus.$off('data_change', this.onDataChange)
  },
  methods: {
    // 监听数据变化
    onDataChange(data) {
      this.textStr = ''
      this.words = 0
      this.num = 0
      this.walk(data)
      countEl.innerHTML = this.textStr
      this.words = countEl.textContent.length
    },

    // 遍历
    walk(data) {
      if (!data) return
      this.num++
      this.textStr += String(data.data.text) || ''
      if (data.children && data.children.length > 0) {
        data.children.forEach(item => {
          this.walk(item)
        })
      }
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';

.countContainer {
  padding: 0 14px;
  position: fixed;
  left: 20px;
  bottom: 20px;
  background-color: @panel-bg;
  backdrop-filter: saturate(180%) blur(16px);
  border: 1px solid @border-weak;
  border-radius: @radius-md;
  box-shadow: @shadow-panel;
  height: 32px;
  font-size: @font-size-sm;
  color: @text-sub;
  display: flex;
  align-items: center;
  user-select: none;
  z-index: 100;

  &.isDark {
    background-color: @dark-panel-blur;
    border-color: @dark-border;
    color: @dark-text-sub;

    .item {
      color: @dark-text-sub;

      .value {
        color: @dark-text-main;
      }
    }
  }

  .item {
    color: @text-sub;
    margin-right: 14px;
    display: flex;
    align-items: center;

    &:last-child,
    &:last-of-type {
      margin-right: 0;
    }

    .name {
      margin-right: 5px;
    }

    .value {
      color: @text-main;
      font-weight: 500;
    }
  }
}

@media screen and (max-width: 900px) {
  .countContainer {
    display: none;
  }
}
</style>
