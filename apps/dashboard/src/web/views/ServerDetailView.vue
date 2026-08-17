<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft, FileText, Play, RotateCw, Square, Trash2 } from "lucide-vue-next";
import type { ProcessSummary } from "@pm2-dashboard/shared";
import { api, liveWsUrl, type ProcessAction } from "../api.js";
import { formatBytes, formatUptime } from "../format.js";
import { showToast } from "../useToast.js";
import ConfirmModal from "../components/ConfirmModal.vue";
import LogViewerModal from "../components/LogViewerModal.vue";
import StatusBadge from "../components/StatusBadge.vue";

const route = useRoute();
const router = useRouter();
const serverName = String(route.params.name);

const processes = ref<ProcessSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let ws: WebSocket | null = null;

const pendingAction = ref<{ process: ProcessSummary; action: ProcessAction } | null>(null);
const actionBusy = ref(false);
const logTarget = ref<{ name: string; pmId: number } | null>(null);

const actionLabel: Record<ProcessAction, string> = {
  restart: "Restart",
  stop: "Stop",
  start: "Start",
  delete: "Delete",
};

async function refresh(): Promise<void> {
  try {
    processes.value = (await api.processes(serverName)).processes;
    error.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

function askAction(process: ProcessSummary, action: ProcessAction): void {
  pendingAction.value = { process, action };
}

async function runAction(): Promise<void> {
  const pending = pendingAction.value;
  if (!pending || actionBusy.value) return;
  actionBusy.value = true;
  try {
    await api.action(serverName, pending.process.pm_id, pending.action);
    showToast(`${actionLabel[pending.action]} '${pending.process.name}' berhasil`, "success");
    pendingAction.value = null;
    await refresh();
  } catch (e) {
    showToast((e as Error).message, "error", 4000);
  } finally {
    actionBusy.value = false;
  }
}

function openLogs(process: ProcessSummary): void {
  logTarget.value = { name: process.name, pmId: process.pm_id };
}

function connectLive(): void {
  try {
    ws = new WebSocket(liveWsUrl(serverName));
  } catch {
    return; // dev tanpa backend WS — polling cukup
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { type?: string };
      if (msg.type === "process:event") void refresh();
    } catch {
      // non-JSON
    }
  };
  ws.onclose = () => {
    ws = null;
  };
}

onMounted(() => {
  void refresh();
  connectLive();
  pollTimer = setInterval(() => void refresh(), 8000);
});
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (ws) ws.close();
});
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-8">
    <header class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded-xl border border-white/10 p-2 text-neutral-400 hover:bg-white/5"
          title="Kembali"
          @click="router.push('/')"
        >
          <ChevronLeft :size="18" />
        </button>
        <div>
          <h1 class="text-xl font-semibold text-neutral-100">{{ serverName }}</h1>
          <p class="mt-0.5 text-xs text-neutral-500">{{ processes.length }} proses</p>
        </div>
      </div>
    </header>

    <p v-if="error" class="mt-6 rounded-xl border border-red-500/20 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
      {{ error }}
    </p>

    <div class="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#12121a]">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-white/5 text-xs uppercase tracking-wider text-neutral-500">
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium">Nama</th>
              <th class="px-4 py-3 font-medium">PM ID</th>
              <th class="px-4 py-3 font-medium">CPU</th>
              <th class="px-4 py-3 font-medium">RAM</th>
              <th class="px-4 py-3 font-medium">Uptime</th>
              <th class="px-4 py-3 font-medium">Restarts</th>
              <th class="px-4 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in processes"
              :key="p.pm_id"
              class="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
              @click="openLogs(p)"
            >
              <td class="px-4 py-3"><StatusBadge :status="p.status" /></td>
              <td class="max-w-[220px] truncate px-4 py-3 font-medium text-neutral-200">{{ p.name }}</td>
              <td class="px-4 py-3 text-neutral-500">{{ p.pm_id }}</td>
              <td class="px-4 py-3 text-neutral-400">{{ p.cpu.toFixed(1) }}%</td>
              <td class="px-4 py-3 text-neutral-400">{{ formatBytes(p.memory) }}</td>
              <td class="px-4 py-3 text-neutral-400">{{ formatUptime(p.uptime) }}</td>
              <td class="px-4 py-3 text-neutral-400">{{ p.restarts }}</td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-1" @click.stop>
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-neutral-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                    title="Restart"
                    @click="askAction(p, 'restart')"
                  >
                    <RotateCw :size="15" />
                  </button>
                  <button
                    v-if="p.status === 'online'"
                    type="button"
                    class="rounded-lg p-1.5 text-neutral-400 hover:bg-amber-500/10 hover:text-amber-400"
                    title="Stop"
                    @click="askAction(p, 'stop')"
                  >
                    <Square :size="15" />
                  </button>
                  <button
                    v-else
                    type="button"
                    class="rounded-lg p-1.5 text-neutral-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                    title="Start"
                    @click="askAction(p, 'start')"
                  >
                    <Play :size="15" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    @click="askAction(p, 'delete')"
                  >
                    <Trash2 :size="15" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loading && processes.length === 0" class="px-4 py-10 text-center text-sm text-neutral-500">
        memuat proses...
      </div>
      <div v-else-if="processes.length === 0" class="px-4 py-10 text-center text-sm text-neutral-500">
        tidak ada proses — klik baris untuk lihat log
      </div>
    </div>

    <p class="mt-4 flex items-center gap-1.5 text-[11px] text-neutral-600">
      <FileText :size="12" />
      klik baris untuk membuka log viewer
    </p>

    <ConfirmModal
      v-if="pendingAction"
      :title="`${actionLabel[pendingAction.action]} '${pendingAction.process.name}'?`"
      :message="
        pendingAction.action === 'delete'
          ? 'Proses akan dihapus dari daftar PM2. Tindakan ini tidak bisa dibatalkan.'
          : `Aksi ${actionLabel[pendingAction.action].toLowerCase()} akan dijalankan pada proses ini.`
      "
      :danger="pendingAction.action === 'delete'"
      :busy="actionBusy"
      @confirm="runAction"
      @cancel="pendingAction = null"
    />

    <LogViewerModal
      v-if="logTarget"
      :server-name="serverName"
      :proc-name="logTarget.name"
      :pm-id="logTarget.pmId"
      @close="logTarget = null"
    />
  </div>
</template>
