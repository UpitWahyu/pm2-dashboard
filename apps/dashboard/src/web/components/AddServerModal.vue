<script setup lang="ts">
import { ref, watch } from "vue";
import { Server, X } from "lucide-vue-next";
import type { ManagedServer, ServerCreateInput, ServerPatchInput } from "../api.js";
import { api } from "../api.js";
import { showToast } from "../useToast.js";

const props = defineProps<{
  open: boolean;
  // jika diset, modal berubah jadi mode edit
  editing?: ManagedServer | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved"): void;
}>();

const name = ref("");
const url = ref("");
const port = ref<string>("");
const token = ref("");
const enabled = ref(true);
const busy = ref(false);

// Reset form saat modal dibuka / target edit berubah
watch(
  () => [props.open, props.editing],
  () => {
    if (!props.open) return;
    if (props.editing) {
      name.value = props.editing.name;
      url.value = props.editing.url;
      port.value = props.editing.port != null ? String(props.editing.port) : "";
      token.value = props.editing.token;
      enabled.value = props.editing.enabled;
    } else {
      name.value = "";
      url.value = "";
      port.value = "";
      token.value = "";
      enabled.value = true;
    }
  },
  { immediate: true },
);

async function save(): Promise<void> {
  if (busy.value) return;
  if (!name.value.trim()) return showToast("Nama server wajib diisi", "error");
  if (!/^https?:\/\/.+/.test(url.value.trim())) return showToast("URL harus http(s)://...", "error");
  if (token.value.trim().length < 16) return showToast("Token agent minimal 16 karakter", "error");

  if (props.editing) {
    // Update mode
    const patch: ServerPatchInput = {
      url: url.value.trim(),
      port: port.value.trim() ? Number(port.value) : null,
      token: token.value.trim(),
      enabled: enabled.value,
    };
    busy.value = true;
    try {
      await api.updateServer(props.editing.id, patch);
      showToast(`Server '${name.value}' diperbarui`, "success");
      emit("saved");
      emit("close");
    } catch (e) {
      showToast((e as Error).message, "error", 4000);
    } finally {
      busy.value = false;
    }
  } else {
    // Create mode
    const input: ServerCreateInput = {
      name: name.value.trim(),
      url: url.value.trim(),
      port: port.value.trim() ? Number(port.value) : null,
      token: token.value.trim(),
    };
    busy.value = true;
    try {
      await api.createServer(input);
      showToast(`Server '${name.value}' ditambahkan`, "success");
      emit("saved");
      emit("close");
    } catch (e) {
      showToast((e as Error).message, "error", 4000);
    } finally {
      busy.value = false;
    }
  }
}

function close(): void {
  emit("close");
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="close">
    <div class="w-full max-w-md rounded-2xl border border-white/10 bg-[#14141c] p-6 shadow-2xl shadow-black/60">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-base font-semibold text-neutral-100">
          <Server :size="18" class="text-emerald-400" />
          {{ editing ? "Edit Server" : "Tambah Server" }}
        </h2>
        <button type="button" class="rounded-lg p-1.5 text-neutral-400 hover:bg-white/5" @click="close">
          <X :size="16" />
        </button>
      </div>

      <div class="mt-5 space-y-4">
        <div>
          <label class="block text-xs text-neutral-400">Nama server</label>
          <input
            v-model="name"
            type="text"
            :disabled="!!editing"
            class="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0b10] px-4 py-2.5 text-sm text-neutral-200 focus:border-white/20 focus:outline-none disabled:opacity-50"
            placeholder="vps-1"
          />
          <p v-if="editing" class="mt-1 text-[11px] text-neutral-600">nama tidak bisa diubah</p>
        </div>

        <div>
          <label class="block text-xs text-neutral-400">URL agent</label>
          <input
            v-model="url"
            type="text"
            class="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0b10] px-4 py-2.5 text-sm text-neutral-200 focus:border-white/20 focus:outline-none"
            placeholder="http://127.0.0.1:4001"
          />
        </div>

        <div>
          <label class="block text-xs text-neutral-400">Port (opsional)</label>
          <input
            v-model="port"
            type="number"
            class="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0b10] px-4 py-2.5 text-sm text-neutral-200 focus:border-white/20 focus:outline-none"
            placeholder="4001"
          />
        </div>

        <div>
          <label class="block text-xs text-neutral-400">Token agent</label>
          <input
            v-model="token"
            type="password"
            autocomplete="off"
            class="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0b10] px-4 py-2.5 text-sm text-neutral-200 focus:border-white/20 focus:outline-none"
            placeholder="minimal 16 karakter"
          />
        </div>

        <label v-if="editing" class="flex items-center gap-2 text-sm text-neutral-300">
          <input v-model="enabled" type="checkbox" class="h-4 w-4 rounded border-white/20 bg-[#0b0b10]" />
          Aktif (ikut polling & live WS)
        </label>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-xl border border-white/10 px-4 py-2 text-sm text-neutral-400 hover:bg-white/5"
          @click="close"
        >
          Batal
        </button>
        <button
          type="button"
          class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          :disabled="busy"
          @click="save"
        >
          {{ busy ? "Menyimpan..." : editing ? "Simpan" : "Tambah" }}
        </button>
      </div>
    </div>
  </div>
</template>
