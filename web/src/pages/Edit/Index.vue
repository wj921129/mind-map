<template>
  <div
    class="container"
    :class="{ isDark: isDark, activeSidebar: activeSidebar }"
  >
    <template v-if="show">
      <Toolbar v-if="!isZenMode"></Toolbar>
      <Edit></Edit>
    </template>
  </div>
</template>

<script>
import Toolbar from './components/Toolbar.vue'
import Edit from './components/Edit.vue'
import { mapState, mapMutations } from 'vuex'
import { getLocalConfig } from '@/api'

export default {
  components: {
    Toolbar,
    Edit
  },
  data() {
    return {
      show: false
    }
  },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
  },
  watch: {
    isDark() {
      this.setBodyDark()
    }
  },
  async created() {
    this.initLocalConfig()
    const loading = this.$loading({
      lock: true,
      text: this.$t('other.loading')
    })
    this.show = true
    loading.close()
    this.setBodyDark()
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

    // 初始化本地配置
    initLocalConfig() {
      let config = getLocalConfig()
      if (config) {
        this.setLocalConfig({
          ...this.$store.state.localConfig,
          ...config
        })
      }
    },

    setBodyDark() {
      this.isDark
        ? document.body.classList.add('isDark')
        : document.body.classList.remove('isDark')
    }
  }
}
</script>

<style lang="less">
@import '../../style/tokens.less';

.container {
}

body {
  &.isDark {
    /* el-button */
    .el-button {
      background-color: @dark-panel;
      color: @dark-text-main;
      border-color: @dark-border;
    }

    /* el-input */
    .el-input__inner {
      background-color: @dark-panel;
      border-color: @dark-border;
      color: @dark-text-main;
    }

    .el-input.is-disabled .el-input__inner {
      background-color: @dark-panel;
      border-color: @dark-border;
      color: @dark-text-weak;
    }

    .el-input-group__append,
    .el-input-group__prepend {
      background-color: @dark-panel;
      border-color: @dark-border;
    }

    .el-input-group__append button.el-button {
      color: @dark-text-main;
    }

    /* el-select */
    .el-select-dropdown {
      background-color: @dark-panel;
      border-color: @dark-border;

      .el-select-dropdown__item {
        color: @dark-text-sub;
      }

      .el-select-dropdown__item.selected {
        color: @primary;
      }

      .el-select-dropdown__item.hover,
      .el-select-dropdown__item:hover {
        background-color: @dark-fill-hover;
      }
    }

    .el-select .el-input.is-disabled .el-input__inner:hover {
      border-color: @dark-border;
    }

    /* el-popper*/
    .el-popper {
      background-color: @dark-panel;
      border-color: @dark-border;
    }

    .el-popper[x-placement^='bottom'] .popper__arrow {
      background-color: @dark-panel;
    }

    .el-popper[x-placement^='bottom'] .popper__arrow::after {
      border-bottom-color: @dark-panel;
    }

    .el-popper[x-placement^='top'] .popper__arrow {
      background-color: @dark-panel;
    }

    .el-popper[x-placement^='top'] .popper__arrow::after {
      border-top-color: @dark-panel;
    }

    /* el-tabs */
    .el-tabs__item {
      color: @dark-text-sub;

      &:hover,
      &.is-active {
        color: @primary;
      }
    }

    .el-tabs__nav-wrap::after {
      background-color: @dark-text-sub;
    }

    /* el-slider */
    .el-slider__runway {
      background-color: @dark-text-sub;
    }

    /* el-radio-group */
    .el-radio-group {
      .el-radio-button__inner {
        background-color: @dark-panel;
        color: @dark-text-sub;
      }

      .el-radio-button__orig-radio:checked + .el-radio-button__inner {
        color: #fff;
        background-color: @primary;
      }
    }

    /* el-dialog */
    .el-dialog {
      background-color: @dark-panel;

      .el-dialog__header {
        border-bottom: 1px solid @dark-border;
      }

      .el-dialog__title {
        color: @dark-text-main;
      }

      .el-dialog__body {
        background-color: @dark-panel;
      }

      .el-dialog__footer {
        border-top: 1px solid @dark-border;
      }
    }

    /* el-upload */
    .el-upload__tip {
      color: #999;
    }

    /* 富文本编辑器 */
    .toastui-editor-main-container {
      background-color: #fff;
    }
  }
}
</style>
