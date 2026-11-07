<template>
  <div id="app">
    <router-view></router-view>
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style lang="less">
@import './style/tokens.less';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  color: @text-main;
}

.customScrollbar {
  &::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 7px;
    background-color: rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: background-color @duration-fast @ease-out;

    &:hover {
      background-color: rgba(0, 0, 0, 0.35);
    }
  }

  &::-webkit-scrollbar-track {
    box-shadow: none;
    background: transparent;
    display: none;
  }
}

// 暗黑模式下自定义滚动条滑块样式
body.isDark {
  .customScrollbar::-webkit-scrollbar-thumb,
  &.customScrollbar::-webkit-scrollbar-thumb {
    background-color: hsla(0, 0%, 100%, 0.22);

    &:hover {
      background-color: hsla(0, 0%, 100%, 0.38);
    }
  }
}

.el-dialog {
  border-radius: @radius-lg;
}
</style>
