<template>
  <div
    class="navigatorContainer customScrollbar"
    :class="{ isDark: isDark, hasSidebar: !!activeSidebar }"
  >
    <div class="item">
      <el-select
        v-model="lang"
        size="small"
        style="width: 100px"
        @change="onLangChange"
      >
        <el-option
          v-for="item in langList"
          :key="item.value"
          :label="item.name"
          :value="item.value"
        />
      </el-select>
    </div>
    <div class="item">
      <el-tooltip
        effect="dark"
        :content="$t('navigatorToolbar.backToRoot')"
        placement="top"
      >
        <div class="btn iconfont icondingwei" @click="backToRoot"></div>
      </el-tooltip>
    </div>
    <div class="item">
      <div class="btn iconfont iconsousuo" @click="showSearch"></div>
    </div>
    <div class="item">
      <MouseAction :isDark="isDark" :mindMap="mindMap"></MouseAction>
    </div>
    <div class="item">
      <el-tooltip
        effect="dark"
        :content="
          openMiniMap
            ? $t('navigatorToolbar.closeMiniMap')
            : $t('navigatorToolbar.openMiniMap')
        "
        placement="top"
      >
        <div class="btn iconfont icondaohang1" @click="toggleMiniMap"></div>
      </el-tooltip>
    </div>
    <div class="item">
      <!-- <el-switch
        v-model="isReadonly"
        :active-text="$t('navigatorToolbar.readonly')"
        :inactive-text="$t('navigatorToolbar.edit')"
        @change="readonlyChange"
      >
      </el-switch> -->
      <el-tooltip
        effect="dark"
        :content="
          isReadonly
            ? $t('navigatorToolbar.edit')
            : $t('navigatorToolbar.readonly')
        "
        placement="top"
      >
        <div
          class="btn iconfont"
          :class="[isReadonly ? 'iconyanjing' : 'iconbianji1']"
          @click="readonlyChange"
        ></div>
      </el-tooltip>
    </div>
    <div class="item">
      <Fullscreen :isDark="isDark" :mindMap="mindMap"></Fullscreen>
    </div>
    <div class="item">
      <Scale :isDark="isDark" :mindMap="mindMap"></Scale>
    </div>
    <div class="item">
      <div
        class="btn iconfont"
        :class="[isDark ? 'iconmoon_line' : 'iconlieri']"
        @click="toggleDark"
      ></div>
    </div>
    <!-- <div class="item">
      <el-tooltip
        effect="dark"
        :content="$t('navigatorToolbar.changeSourceCodeEdit')"
        placement="top"
      >
        <div class="btn iconfont iconyuanma" @click="openSourceCodeEdit"></div>
      </el-tooltip>
    </div> -->
    <div class="item">
      <Demonstrate :isDark="isDark" :mindMap="mindMap"></Demonstrate>
    </div>
    <div class="item">
      <el-dropdown @command="handleCommand">
        <div class="btn el-icon-more"></div>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="shortcutKey">
            <span class="iconfont iconjianpan"></span>
            {{ $t('navigatorToolbar.shortcutKeys') }}
          </el-dropdown-item>
          <el-dropdown-item command="aiChat">
            <span class="iconfont iconAIshengcheng"></span>
            {{ $t('navigatorToolbar.ai') }}
          </el-dropdown-item>
          <el-dropdown-item command="client">
            <span class="iconfont iconxiazai"></span>
            {{ $t('navigatorToolbar.downloadClient') }}
          </el-dropdown-item>
          <el-dropdown-item command="github">
            <span class="iconfont icongithub"></span>
            Github
          </el-dropdown-item>
          <el-dropdown-item command="site">
            <span class="iconfont iconwangzhan"></span>
            {{ $t('navigatorToolbar.site') }}
          </el-dropdown-item>
          <el-dropdown-item disabled
            >{{ $t('navigatorToolbar.current') }}v{{
              version
            }}</el-dropdown-item
          >
        </el-dropdown-menu>
      </el-dropdown>
    </div>
  </div>
</template>

<script>
import Scale from './Scale.vue'
import Fullscreen from './Fullscreen.vue'
import MouseAction from './MouseAction.vue'
import { langList } from '@/config'
import i18n from '@/i18n'
import { storeLang, getLang } from '@/api'
import { mapState, mapMutations } from 'vuex'
import pkg from 'simple-mind-map/package.json'
import Demonstrate from './Demonstrate.vue'

// 导航器工具栏
export default {
  components: {
    Scale,
    Fullscreen,
    MouseAction,
    Demonstrate
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      version: pkg.version,
      langList,
      lang: '',
      openMiniMap: false
    }
  },
  computed: {
    ...mapState({
      isReadonly: state => state.isReadonly,
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
  },
  created() {
    this.lang = getLang()
  },
  methods: {
    ...mapMutations([
      'setLocalConfig',
      'setIsReadonly',
      'setIsSourceCodeEdit',
      'setActiveSidebar'
    ]),

    readonlyChange() {
      this.setIsReadonly(!this.isReadonly)
      this.mindMap.setMode(this.isReadonly ? 'readonly' : 'edit')
    },

    toggleMiniMap() {
      this.openMiniMap = !this.openMiniMap
      this.$bus.$emit('toggle_mini_map', this.openMiniMap)
    },

    onLangChange(lang) {
      i18n.locale = lang
      storeLang(lang)
      this.$bus.$emit('lang_change')
    },

    showSearch() {
      this.$bus.$emit('show_search')
    },

    toggleDark() {
      this.setLocalConfig({
        isDark: !this.isDark
      })
    },

    handleCommand(command) {
      if (command === 'shortcutKey') {
        this.setActiveSidebar('shortcutKey')
        return
      } else if (command === 'aiChat') {
        this.setActiveSidebar('ai')
        return
      }
      let url = ''
      switch (command) {
        case 'github':
          url = 'https://github.com/wanglin2/mind-map'
          break
        case 'helpDoc':
          url = 'https://wanglin2.github.io/mind-map-docs/help/help1.html'
          break
        case 'devDoc':
          url =
            'https://wanglin2.github.io/mind-map-docs/start/introduction.html'
          break
        case 'site':
          url = 'https://sxmind.cn/'
          break
        case 'issue':
          url = 'https://github.com/wanglin2/mind-map/issues/new'
          break
        case 'client':
          url = 'https://sxmind.cn/'
          break
        default:
          break
      }
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.click()
    },

    backToRoot() {
      this.mindMap.renderer.setRootNodeCenter()
    },

    openSourceCodeEdit() {
      this.setIsSourceCodeEdit(true)
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';

.navigatorContainer {
  padding: 0 12px;
  position: fixed;
  right: 20px;
  bottom: 20px;
  background: @panel-bg;
  backdrop-filter: saturate(180%) blur(16px);
  border-radius: @radius-lg;
  box-shadow: @shadow-panel;
  border: 1px solid @border-weak;
  height: 44px;
  font-size: @font-size-sm;
  display: flex;
  align-items: center;
  z-index: 100;
  transition: transform @duration-base @ease-out;

  &.isDark {
    background: @dark-panel-blur;
    border-color: @dark-border;

    .item {
      a {
        color: @dark-text-sub;
      }

      .btn {
        color: @dark-text-sub;

        &:hover {
          background-color: @dark-fill-hover;
          color: @dark-text-main;
        }
      }
    }
  }

  .item {
    margin-right: 20px;

    &:last-of-type {
      margin-right: 0;
    }

    a {
      color: @text-main;
      text-decoration: none;
    }

    .btn {
      cursor: pointer;
      font-size: 18px;
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
  }
}

// 侧边栏打开时向左避让，避免被遮挡
// 仅在宽屏生效：导航条较长，窄屏空间不足时依靠 z-index 浮于侧边栏之上
@media screen and (min-width: 1000px) {
  .navigatorContainer {
    &.hasSidebar {
      transform: translateX(-@sidebar-width - @sidebar-gap);
    }
  }
}

@media screen and (max-width: 700px) {
  .navigatorContainer {
    left: 20px;
    overflow-x: auto;
    overflow-y: hidden;
    height: 60px;
  }
}
</style>
