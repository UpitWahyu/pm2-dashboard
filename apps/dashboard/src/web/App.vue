<script setup lang="ts">
import ToastHost from "./components/ToastHost.vue";
</script>

<template>
  <div class="min-h-screen bg-[#0b0b10] text-neutral-200">
    <RouterView />
    <ToastHost />
  </div>
</template>
