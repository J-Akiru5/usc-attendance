<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDelegationStore } from '@/stores/delegations'
import { supabase } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Button from '@/components/ui/Button.vue'
import type { DelegationScope, EventDelegate } from '@/types'

const router = useRouter()
const store = useDelegationStore()
const error = ref('')

onMounted(async () => {
  try {
    await store.fetchMine()
  } catch {
    // Non-critical card: stay hidden if it cannot load.
  }
})

const has = (g: EventDelegate, scope: DelegationScope) => g.scopes.includes(scope)

async function exportCsv(g: EventDelegate) {
  error.value = ''
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch(`/api/attendance/export?eventId=${encodeURIComponent(g.eventId)}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `${g.event?.title || 'attendance'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Export failed'
  }
}

function until(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <div v-if="store.mine.length > 0">
    <h2 class="text-lg font-semibold text-navy mb-4 font-serif">Your event access</h2>
    <div v-if="error" class="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div class="space-y-3">
      <Card v-for="g in store.mine" :key="g.id">
        <CardContent class="p-4 space-y-3">
          <div>
            <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">Temporary access</div>
            <div class="font-bold text-navy">{{ g.event?.title }}</div>
            <div class="text-xs text-slate">Until {{ until(g.expiresAt) }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button v-if="has(g, 'scan')" variant="gold" @click="router.push('/scan')">Scan QR</Button>
            <Button
              v-if="has(g, 'view_roster') || has(g, 'manual_checkin')"
              variant="outline"
              @click="router.push(`/attendance/${g.eventId}`)"
            >
              Attendance list
            </Button>
            <Button v-if="has(g, 'export')" variant="outline" @click="exportCsv(g)">Export CSV</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
