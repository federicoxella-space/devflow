#!/usr/bin/env bash
set -eu

git init -q -b main
git config user.name eval
git config user.email eval@example.invalid
git config commit.gpgsign false

cat > package.json <<'JSON'
{
  "name": "vue-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "test": "vitest"
  },
  "dependencies": {
    "vue": "^3.4.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.57.0"
  }
}
JSON

cat > pnpm-lock.yaml <<'YAML'
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
YAML

cat > vite.config.ts <<'TS'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})
TS

mkdir -p src

cat > src/main.ts <<'TS'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
TS

cat > src/App.vue <<'VUE'
<script setup lang="ts">
const title = 'Hello from Vue'
</script>

<template>
  <h1>{{ title }}</h1>
</template>
VUE
