<script setup lang="ts">
import { toasts } from "../useToast.js";
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur"
        :class="{
          'border-emerald-500/30 bg-emerald-950/90 text-emerald-200': t.type === 'success',
          'border-red-500/30 bg-red-950/90 text-red-200': t.type === 'error',
          'border-sky-500/30 bg-sky-950/90 text-sky-200': t.type === 'info',
        }"
      >
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
