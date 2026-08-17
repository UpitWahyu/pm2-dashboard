<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Activity, LogOut, RefreshCw, Server } from "lucide-vue-next";
import type { ServerSummary } from "@pm2-dashboard/shared";
import { api } from "../api.js";
import { formatBytes } from "../format.js";

const router = useRouter();
const servers = ref<ServerSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  try {
    servers.value = (await api.servers()).servers;
    error.value = null;
    lastUpdated.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

const totalOnline = computed(() => servers.value.filter((s) => s.online).length);

async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    // noop
  }
  window.location.href = "/login";
}

onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 10000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-8">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-neutral-100">
          <Server :size="20" class="text-emerald-400" />
          PM2 Dashboard
        </h1>
        <p class="mt-0.5 text-xs text-neutral-500">{{ servers.length }} server · {{ totalOnline }} online</p>
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
          class="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-400 hover:bg-white/5"
          @click="logout"
        >
          <LogOut :size="15" />
          Keluar
        </button>
      </div>
    </header>

    <p v-if="error" class="mt-6 rounded-xl border border-red-500/20 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
      {{ error }}
    </p>

    <div v-if="loading && servers.length === 0" class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-2xl border border-white/5 bg-[#14141c]"></div>
    </div>

    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="s in servers"
        :key="s.name"
        type="button"
        class="rounded-2xl border p-4 text-left transition hover:border-white/15 hover:bg-[#14141c]"
        :class="s.online ? 'border-white/10 bg-[#12121a]' : 'border-red-500/20 bg-[#12121a]'"
        @click="router.push(`/servers/${encodeURIComponent(s.name)}`)"
      >
        <div class="flex items-center justify-between">
          <span class="font-medium text-neutral-100">{{ s.name }}</span>
          <span class="flex items-center gap-1.5 text-xs" :class="s.online ? 'text-emerald-400' : 'text-red-400'">
            <span class="h-2 w-2 rounded-full" :class="s.online ? 'bg-emerald-400' : 'bg-red-400'"></span>
            {{ s.online ? "online" : "offline" }}
          </span>
        </div>

        <div class="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            {{ s.counts.online }} online
          </span>
          <span class="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-zinc-400">
            {{ s.counts.stopped }} stopped
          </span>
          <span
            v-if="s.counts.errored > 0"
            class="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300"
          >
            {{ s.counts.errored }} errored
          </span>
        </div>

        <div v-if="s.online" class="mt-3 flex items-center gap-3 text-xs text-neutral-500">
          <span class="flex items-center gap-1"><Activity :size="13" /> CPU {{ s.cpu.toFixed(1) }}%</span>
          <span>RAM {{ formatBytes(s.memory) }}</span>
          <span class="ml-auto text-neutral-600">{{ s.latencyMs }}ms</span>
        </div>
        <p v-else class="mt-3 text-xs text-red-400/80">{{ s.error }}</p>
      </button>
    </div>

    <p class="mt-8 text-center text-[11px] text-neutral-700">
      terakhir diperbarui {{ lastUpdated?.toLocaleTimeString("id-ID") ?? "—" }}
    </p>
  </div>
</template>
