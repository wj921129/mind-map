<template>
  <div class="scaleContainer" :class="{ isDark: isDark }">
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('scale.zoomOut')"
      placement="top"
    >
      <div class="btn el-icon-minus" @click="narrow"></div>
    </el-tooltip>
    <div class="scaleInfo">
      <input
        ref="inputRef"
        type="text"
        v-model="scaleNum"
        @input="onScaleNumInput"
        @change="onScaleNumChange"
        @focus="onScaleNumInputFocus"
        @keydown.stop
        @keyup.stop
      />%
    </div>
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('scale.zoomIn')"
      placement="top"
    >
      <div class="btn el-icon-plus" @click="enlarge"></div>
    </el-tooltip>
  </div>
</template>

<script>
// 放大缩小
export default {
  props: {
    mindMap: {
      type: Object
    },
    isDark: {
      type: Boolean
    }
  },
  data() {
    return {
      scaleNum: 100,
      cacheScaleNum: 0
    }
  },
  watch: {
    mindMap(val, oldVal) {
      if (val && !oldVal) {
        this.mindMap.on('scale', this.onScale)
        this.mindMap.on('draw_click', this.onDrawClick)
        this.scaleNum = this.toPer(this.mindMap.view.scale)
      }
    }
  },
  beforeDestroy() {
    this.mindMap.off('scale', this.onScale)
    this.mindMap.off('draw_click', this.onDrawClick)
  },
  methods: {
    // 转换成百分数
    toPer(scale) {
      return (scale * 100).toFixed(0)
    },

    // 缩小
    narrow() {
      this.mindMap.view.narrow()
    },

    // 放大
    enlarge() {
      this.mindMap.view.enlarge()
    },

    // 聚焦时缓存当前缩放倍数
    onScaleNumInputFocus() {
      this.cacheScaleNum = this.scaleNum
    },

    // 禁止输入非数字
    onScaleNumInput() {
      this.scaleNum = this.scaleNum.replace(/[^0-9]+/g, '')
    },

    // 手动输入缩放倍数
    onScaleNumChange() {
      const scaleNum = Number(this.scaleNum)
      if (Number.isNaN(scaleNum) || scaleNum <= 0) {
        this.scaleNum = this.cacheScaleNum
      } else {
        const cx = this.mindMap.width / 2
        const cy = this.mindMap.height / 2
        this.mindMap.view.setScale(this.scaleNum / 100, cx, cy)
      }
    },

    onScale(scale) {
      this.scaleNum = this.toPer(scale)
    },

    onDrawClick() {
      if (this.$refs.inputRef) this.$refs.inputRef.blur()
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';

.scaleContainer {
  display: flex;
  align-items: center;

  &.isDark {
    .btn {
      color: @dark-text-sub;

      &:hover {
        background-color: @dark-fill-hover;
        color: @dark-text-main;
      }
    }

    .scaleInfo {
      color: @dark-text-sub;

      input {
        color: @dark-text-sub;
      }

      &:hover,
      &:focus-within {
        background-color: @dark-fill-hover;
        color: @dark-text-main;

        input {
          color: @dark-text-main;
        }
      }
    }
  }

  .btn {
    cursor: pointer;
    font-size: 14px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: @radius-sm;
    color: @text-sub;
    transition: background-color @duration-fast @ease-out,
      color @duration-fast @ease-out;

    &:hover {
      background-color: @fill-hover;
      color: @text-main;
    }
  }

  .scaleInfo {
    margin: 0 4px;
    height: 24px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: @radius-sm;
    color: @text-sub;
    font-size: @font-size-sm;
    cursor: text;
    transition: background-color @duration-fast @ease-out,
      color @duration-fast @ease-out;

    &:hover,
    &:focus-within {
      background-color: @fill-hover;
      color: @text-main;

      input {
        color: @text-main;
      }
    }

    input {
      width: 28px;
      text-align: right;
      background-color: transparent;
      border: none;
      outline: none;
      font-size: @font-size-sm;
      color: @text-sub;
      padding-right: 1px;
    }
  }
}
</style>
