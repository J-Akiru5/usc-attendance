<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '@/lib/api'
import SignaturePad from '@/components/SignaturePad.vue'
import Button from '@/components/ui/Button.vue'

interface Pending {
  id: string
  eventId: string
  eventTitle: string
  createdAt: string
}

const pending = ref<Pending[]>([])
const dataUrl = ref<string | null>(null)
const pad = ref<InstanceType<typeof SignaturePad> | null>(null)
const saving = ref(false)
const error = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const current = computed(() => pending.value[0] ?? null)

async function poll() {
  if (document.hidden || saving.value) return
  try {
    pending.value = await api.get<Pending[]>('/attendance/pending-signature')
  } catch {
    // Not signed in yet / offline / password change pending: stay quiet.
  }
}

function onVisible() {
  if (!document.hidden) poll()
}

onMounted(() => {
  poll()
  timer = setInterval(poll, 6000)
  document.addEventListener('visibilitychange', onVisible)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

async function submit() {
  if (!current.value || !dataUrl.value) return
  saving.value = true
  error.value = ''
  try {
    await api.post('/attendance/sign', { attendanceId: current.value.id, signature: dataUrl.value })
    pending.value = pending.value.slice(1)
    dataUrl.value = null
    pad.value?.clear()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not save your signature'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="current"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Sign your attendance"
  >
    <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
      <div>
        <div class="text-xs font-bold uppercase tracking-wider text-gold-dark">
          You were checked in
        </div>
        <h2 class="text-lg font-bold text-navy font-serif">
          {{ current.eventTitle }}
        </h2>
        <p class="text-sm text-slate">
          Please sign to confirm you attended. This signature appears on the attendance report.
        </p>
      </div>

      <SignaturePad ref="pad" @change="dataUrl = $event" />

      <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
        {{ error }}
      </div>

      <div class="flex items-center justify-between">
        <span v-if="pending.length > 1" class="text-xs text-slate">{{ pending.length - 1 }} more to sign</span>
        <span v-else />
        <Button variant="gold" :disabled="!dataUrl || saving" @click="submit">
          {{ saving ? 'Saving…' : 'Submit signature' }}
        </Button>
      </div>
    </div>
  </div>
</template>
