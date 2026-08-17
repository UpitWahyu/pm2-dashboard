<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Pause, Play, Search, X } from "lucide-vue-next";
import { api, liveWsUrl } from "../api.js";

const props = defineProps<{ serverName: string; procName: string; pmId: number }>();
const emit = defineEmits<{ close: [] }>();

type LogLine = { stream: "out" | "err"; line: string };
type Tab = "all" | "out" | "err";

const MAX_LINES = 2000;

const tab = ref<Tab>("all");
const lines = ref<LogLine[]>([]);
const paused = ref(false);
const autoScroll = ref(true);
const filter = ref("");
const loading = ref(true);
const error = ref<string | null>(null);
const bodyRef = ref<HTMLElement | null>(null);
let ws: WebSocket | null = null;

const visibleLines = computed(() => {
  const f = filter.value.trim().toLowerCase();
  if (!f) return lines.value;
  return lines.value.filter((l) => l.line.toLowerCase().includes(f));
});

function accepts(stream: "out" | "err"): boolean {
  return tab.value === "all" || tab.value === stream;
}

function scrollToBottom(): void {
  if (!autoScroll.value) return;
  void nextTick(() => {
    const el = bodyRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function loadTail(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const result = await api.logs(props.serverName, props.pmId, 100, tab.value);
    const out =
      result.stream === "err"
        ? []
        : result.out
            .split("\n")
            .filter((l) => l.length > 0)
            .map((line) => ({ stream: "out" as const, line }));
    const err =
      result.stream === "out"
        ? []
        : result.err
            .split("\n")
            .filter((l) => l.length > 0)
            .map((line) => ({ stream: "err" as const, line }));
    lines.value = [...out, ...err];
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
    scrollToBottom();
  }
}

function appendLine(stream: "out" | "err", line: string): void {
  const clean = line.replace(/\n$/, "");
  lines.value = [...lines.value, { stream, line: clean }].slice(-MAX_LINES);
  if (!paused.value) scrollToBottom();
}

function connectLive(): void {
  try {
    ws = new WebSocket(liveWsUrl(props.serverName));
  } catch {
    return; // tanpa backend WS (dev) — cukup polling REST
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as {
        type?: string;
        data?: { stream?: "out" | "err"; pm_id?: number; line?: string };
      };
      if (msg.type === "log" && msg.data && msg.data.pm_id === props.pmId && msg.data.line !== undefined) {
        const stream = msg.data.stream === "err" ? "err" : "out";
        if (accepts(stream)) appendLine(stream, msg.data.line);
      }
    } catch {
      // non-JSON
    }
  };
  ws.onclose = () => {
    ws = null;
  };
}

watch(tab, () => {
  void loadTail();
});

onMounted(() => {
  void loadTail();
  connectLive();
});
onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#16161f] shadow-2xl shadow-black/60">
      <!-- header -->
      <div class="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div class="min-w-0">
          <h3 class="truncate text-sm font-semibold text-neutral-100">Log — {{ props.procName }}</h3>
          <p class="text-xs text-neutral-500">server: {{ props.serverName }} · pm_id: {{ props.pmId }}</p>
        </div>
        <button
          type="button"
          class="rounded-lg p-1.5 text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <!-- toolbar -->
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2">
        <div class="flex rounded-lg border border-white/10 p-0.5">
          <button
            v-for="t in (['all', 'out', 'err'] as Tab[])"
            :key="t"
            type="button"
            class="rounded-md px-3 py-1 text-xs capitalize"
            :class="tab === t ? 'bg-white/10 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'"
            @click="tab = t"
          >
            {{ t }}
          </button>
        </div>
        <button
          type="button"
          class="rounded-lg border border-white/10 p-1.5 text-neutral-400 hover:bg-white/5"
          :title="paused ? 'Lanjut auto-scroll' : 'Jeda auto-scroll'"
          @click="paused = !paused"
        >
          <Pause v-if="!paused" :size="14" />
          <Play v-else :size="14" />
        </button>
        <div class="relative ml-auto">
          <Search :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            v-model="filter"
            type="text"
            placeholder="Filter..."
            class="w-44 rounded-lg border border-white/10 bg-[#0b0b10] py-1.5 pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
          />
        </div>
        <label class="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-400">
          <input v-model="autoScroll" type="checkbox" class="accent-emerald-500" />
          auto-scroll
        </label>
      </div>

      <!-- body -->
      <div ref="bodyRef" class="min-h-0 flex-1 overflow-y-auto bg-[#0b0b10] p-3 font-mono text-[11px] leading-relaxed">
        <div v-if="loading" class="text-neutral-500">memuat log...</div>
        <div v-else-if="error" class="text-red-400">{{ error }}</div>
        <template v-else>
          <div
            v-for="(l, i) in visibleLines"
            :key="i"
            :class="l.stream === 'err' ? 'text-red-400' : 'text-neutral-300'"
          >
            <span v-if="tab === 'all'" class="mr-1.5 select-none text-neutral-600">[{{ l.stream }}]</span>{{ l.line }}
          </div>
          <div v-if="visibleLines.length === 0" class="text-neutral-600">belum ada log</div>
        </template>
      </div>
    </div>
  </div>
</template>
