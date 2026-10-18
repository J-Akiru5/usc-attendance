<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/lib/api'
import { formatManila, isoToManilaInput, manilaInputToIso } from '@/lib/manila'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

const props = defineProps<{
  eventId: string
  opensAt: string | null | undefined
  closesAt: string | null | undefined
}>()
const emit = defineEmits<{ (e: 'saved', w: { checkInOpensAt: string | null, checkInClosesAt: string | null }): void }>()

const opens = ref(isoToManilaInput(props.opensAt))
const closes = ref(isoToManilaInput(props.closesAt))
const saving = ref(false)
const error = ref('')
const savedNote = ref('')
const live = ref({ opens: props.opensAt ?? null, closes: props.closesAt ?? null })

watch(
  () => [props.opensAt, props.closesAt],
  () => {
    opens.value = isoToManilaInput(props.opensAt)
    closes.value = isoToManilaInput(props.closesAt)
    live.value = { opens: props.opensAt ?? null, closes: props.closesAt ?? null }
  }
)

async function save(clear = false) {
  error.value = ''
  savedNote.value = ''
  saving.value = true
  try {
    const body = clear
      ? { checkInOpensAt: null, checkInClosesAt: null }
      : { checkInOpensAt: manilaInputToIso(opens.value), checkInClosesAt: manilaInputToIso(closes.value) }
    const res = await api.put<{ checkInOpensAt: string | null, checkInClosesAt: string | null }>(
      `/events/${props.eventId}/window`,
      body
    )
    live.value = { opens: res.checkInOpensAt, closes: res.checkInClosesAt }
    if (clear) {
      opens.value = ''
      closes.value = ''
    }
    savedNote.value = clear ? 'Window removed — check-in is open any time.' : 'Window saved.'
    emit('saved', res)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not save the window'
  } finally {
    saving.value = false
  }
}

const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm'
</script>

<template>
  <Card>
    <CardContent class="p-6 space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-navy">
          Check-in window
        </h2>
        <p class="text-xs text-slate">
          Scans and self check-ins are only accepted between these times (Philippine time). Leave both empty for no limit.
        </p>
        <p class="text-xs text-navy mt-1">
          Now: <strong>{{ live.opens || live.closes ? `${formatManila(live.opens)} → ${formatManila(live.closes)}` : 'no limit' }}</strong>
        </p>
      </div>

      <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        {{ error }}
      </div>
      <div v-if="savedNote" class="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        {{ savedNote }}
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Opens
          <input
            v-model="opens"
            type="datetime-local"
            :class="field"
            class="mt-1 font-normal normal-case tracking-normal"
          >
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Closes
          <input
            v-model="closes"
            type="datetime-local"
            :class="field"
            class="mt-1 font-normal normal-case tracking-normal"
          >
        </label>
      </div>

      <div class="flex gap-2">
        <Button variant="gold" :disabled="saving" @click="save(false)">
          {{ saving ? 'Saving…' : 'Save window' }}
        </Button>
        <Button variant="outline" :disabled="saving" @click="save(true)">
          Remove limit
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
