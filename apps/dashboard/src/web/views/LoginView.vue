<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";

const router = useRouter();
const username = ref("");
const password = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await api.login(username.value, password.value);
    void router.push("/");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <form
      class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#14141c] p-6 shadow-2xl shadow-black/60"
      @submit.prevent="submit"
    >
      <h1 class="text-lg font-semibold text-neutral-100">PM2 Dashboard</h1>
      <p class="mt-1 text-sm text-neutral-500">Masuk untuk mengelola proses PM2</p>

      <label class="mt-5 block text-xs text-neutral-400">Username</label>
      <input
        v-model="username"
        type="text"
        autocomplete="username"
        required
        class="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0b10] px-4 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
        placeholder="admin"
      />

      <label class="mt-4 block text-xs text-neutral-400">Password</label>
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        class="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0b10] px-4 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
        placeholder="••••••••"
      />

      <p v-if="error" class="mt-3 text-xs text-red-400">{{ error }}</p>

      <button
        type="submit"
        class="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        :disabled="busy"
      >
        {{ busy ? "Masuk..." : "Masuk" }}
      </button>
    </form>
  </div>
</template>
