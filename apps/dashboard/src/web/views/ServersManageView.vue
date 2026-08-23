<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Database, Plus, RefreshCw, Server, Trash2, Pencil, Download } from "lucide-vue-next";
import { api, type ManagedServer } from "../api.js";
import { showToast } from "../useToast.js";
import AddServerModal from "../components/AddServerModal.vue";
import ConfirmModal from "../components/ConfirmModal.vue";

const router = useRouter();
const servers = ref<ManagedServer[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const dbAvailable = ref(false);
const syncBusy = ref(false);

const modalOpen = ref(false);
const editing = ref<ManagedServer | null>(null);

const pendingDelete = ref<ManagedServer | null>(null);
const deleteBusy = ref(false);

async function refresh(): Promise<void> {
  try {
    const [list, status] = await Promise.all([api.manageServers(), api.syncStatus()]);
    servers.value = list.servers;
    dbAvailable.value = status.dbAvailable;
    error.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function runSync(): Promise<void> {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    const res = await api.syncServers();
    showToast(
      `Sync selesai: ${res.syncedServers.length} server, ${res.syncedSecrets.length} secret`,
      "success",
    );
    await refresh();
  } catch (e) {
    showToast((e as Error).message, "error", 4000);
  } finally {
    syncBusy.value = false;
  }
}

async function doDelete(): Promise<void> {
  const target = pendingDelete.value;
  if (!target || deleteBusy.value) return;
  deleteBusy.value = true;
  try {
    await api.deleteServer(target.id);
    showToast(`Server '${target.name}' dihapus`, "success");
    pendingDelete.value = null;
    await refresh();
  } catch (e) {
    showToast((e as Error).message, "error", 4000);
  } finally {
    deleteBusy.value = false;
  }
}

function openAdd(): void {
  editing.value = null;
  modalOpen.value = true;
}
function openEdit(s: ManagedServer): void {
  editing.value = s;
  modalOpen.value = true;
}
function openDelete(s: ManagedServer): void {
  pendingDelete.value = s;
}

async function backup(): Promise<void> {
  try {
    const res = await fetch("/api/servers/backup");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pm2dash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup diunduh", "success");
  } catch (e) {
    showToast((e as Error).message, "error", 4000);
  }
}

const enabledCount = computed(() => servers.value.filter((s) => s.enabled).length);

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-8">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-neutral-100">
          <Server :size="20" class="text-emerald-400" />
          Kelola Server
        </h1>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{ servers.length }} server · {{ enabledCount }} aktif
          <span
            class="ml-1 inline-flex items-center gap-1"
            :class="dbAvailable ? 'text-emerald-400' : 'text-amber-400'"
          >
            <Database :size="12" />
            {{ dbAvailable ? "DB" : "env" }}
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-xl border border-white/10 p-2 text-neutral-400 hover:bg-white/5"
          title="Refresh"
          @click="refresh"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': loading }" />
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5"
          title="Unduh backup JSON"
          @click="backup"
        >
          <Download :size="15" />
          Backup
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50"
          :disabled="syncBusy || !dbAvailable"
          title="Sync .env ke database"
          @click="runSync"
        >
          <RefreshCw :size="15" :class="{ 'animate-spin': syncBusy }" />
          Sync .env
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          @click="openAdd"
        >
          <Plus :size="15" />
          Tambah
        </button>
      </div>
    </header>

    <p v-if="!dbAvailable" class="mt-4 rounded-xl border border-amber-500/20 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">
      Database tidak tersedia — menampilkan server dari <code>.env</code>. Tambah/edit disimpan ke database
      bila tersedia; saat ini perubahan via UI tidak persisten tanpa DB.
    </p>
    <p v-if="error" class="mt-4 rounded-xl border border-red-500/20 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
      {{ error }}
    </p>

    <div v-if="loading && servers.length === 0" class="mt-10 grid gap-4 sm:grid-cols-2">
      <div v-for="i in 2" :key="i" class="h-24 animate-pulse rounded-2xl border border-white/5 bg-[#14141c]"></div>
    </div>

    <div v-else class="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#12121a]">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-white/5 text-xs uppercase tracking-wider text-neutral-500">
            <th class="px-4 py-3 font-medium">Nama</th>
            <th class="px-4 py-3 font-medium">URL</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 text-right font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in servers"
            :key="s.id"
            class="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
            @click="router.push(`/servers/${encodeURIComponent(s.name)}`)"
          >
            <td class="px-4 py-3 font-medium text-neutral-200">{{ s.name }}</td>
            <td class="max-w-[280px] truncate px-4 py-3 text-neutral-400">{{ s.url }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full border px-2 py-0.5 text-[11px]"
                :class="s.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'"
              >
                {{ s.enabled ? "aktif" : "nonaktif" }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1" @click.stop>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-neutral-400 hover:bg-white/5"
                  title="Edit"
                  @click="openEdit(s)"
                >
                  <Pencil :size="15" />
                </button>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
                  title="Hapus"
                  @click="openDelete(s)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="servers.length === 0" class="px-4 py-10 text-center text-sm text-neutral-500">
        belum ada server — klik “Tambah” atau “Sync .env”
      </div>
    </div>

    <AddServerModal :open="modalOpen" :editing="editing" @close="modalOpen = false" @saved="refresh" />

    <ConfirmModal
      v-if="pendingDelete"
      title="Hapus server?"
      :message="`Server '${pendingDelete.name}' akan dihapus dari daftar. Agen di VPS tidak ikut dihentikan.`"
      danger
      :busy="deleteBusy"
      @confirm="doDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>
