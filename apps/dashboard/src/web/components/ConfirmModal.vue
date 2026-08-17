<script setup lang="ts">
const props = defineProps<{
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('cancel')"
  >
    <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16161f] p-5 shadow-2xl shadow-black/60">
      <h3 class="text-base font-semibold text-neutral-100">{{ props.title }}</h3>
      <p class="mt-2 text-sm text-neutral-400">{{ props.message }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-xl border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50"
          :disabled="props.busy"
          @click="emit('cancel')"
        >
          Batal
        </button>
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          :class="props.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'"
          :disabled="props.busy"
          @click="emit('confirm')"
        >
          {{ props.busy ? "Memproses..." : (props.confirmLabel ?? "Konfirmasi") }}
        </button>
      </div>
    </div>
  </div>
</template>
