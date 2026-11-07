<template>
  <Sidebar ref="sidebar" :title="$t('shortcutKey.title')">
    <div class="box" :class="{ isDark: isDark }">
      <div v-for="item in shortcutKeyList" :key="item.type">
        <div class="title">{{ item.type }}</div>
        <div class="list" v-for="item2 in item.list" :key="item2.value">
          <div class="item">
            <span
              v-if="item2.icon"
              class="icon iconfont"
              :class="[item2.icon]"
            ></span>
            <span class="name" :title="item2.name">{{ item2.name }}</span>
            <div class="value" :title="item2.value">{{ item2.value }}</div>
          </div>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { shortcutKeyList } from '@/config'
import { mapState } from 'vuex'

// 快捷键
export default {
  components: {
    Sidebar
  },
  data() {
    return {}
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    }),

    shortcutKeyList() {
      return shortcutKeyList[this.$i18n.locale] || shortcutKeyList.zh
    }
  },
  watch: {
    activeSidebar(val) {
      if (val === 'shortcutKey') {
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    }
  }
}
</script>

<style lang="less" scoped>
@import '../../../style/tokens.less';

.box {
  padding: 0 20px;

  &.isDark {
    .title {
      color: @dark-text-main;
    }

    .list {
      .item {
        .icon {
          color: @dark-text-sub;
        }
        .name {
          color: @dark-text-sub;
        }

        .value {
          color: @dark-text-weak;
        }
      }
    }
  }

  .title {
    font-size: 16px;
    font-weight: 500;
    color: @text-main;
    margin: 26px 0 20px;
  }

  .list {
    font-size: 14px;

    .item {
      display: flex;
      align-items: center;
      margin-bottom: 15px;

      .icon {
        font-size: 16px;
        margin-right: 16px;
      }

      .name {
        color: @text-main;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .value {
        color: @text-weak;
        margin-left: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}
</style>
