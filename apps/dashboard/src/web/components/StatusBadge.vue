<script setup lang="ts">
const props = defineProps<{ status: string }>();

const styles: Record<string, string> = {
  online: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  stopped: "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
  errored: "border-red-500/30 bg-red-500/15 text-red-300",
  launching: "border-amber-500/30 bg-amber-500/15 text-amber-300",
};
const dot: Record<string, string> = {
  online: "bg-emerald-400",
  stopped: "bg-zinc-500",
  errored: "bg-red-400",
  launching: "bg-amber-400",
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize"
    :class="styles[props.status] ?? 'border-sky-500/30 bg-sky-500/15 text-sky-300'"
  >
    <span class="h-1.5 w-1.5 rounded-full" :class="dot[props.status] ?? 'bg-sky-400'"></span>
    {{ props.status }}
  </span>
</template>
