<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDelegationStore } from '@/stores/delegations'
import type { DelegationScope } from '@/types'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{ eventId: string; canGrant: boolean }>()

const store = useDelegationStore()
const error = ref('')
const saving = ref(false)
const userId = ref('')
const scopes = ref<DelegationScope[]>(['scan'])

const SCOPE_LABELS: Record<DelegationScope, string> = {
  scan: 'Scan QR codes',
  manual_checkin: 'Record check-ins manually',
  view_roster: 'View the attendance list',
  export: 'Export attendance',
}
const scopeOptions = Object.keys(SCOPE_LABELS) as DelegationScope[]

const activeGrants = computed(() =>
  store.grants.filter((g) => !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now())
)
const pastGrants = computed(() =>
  store.grants.filter((g) => g.revokedAt || new Date(g.expiresAt).getTime() <= Date.now())
)

onMounted(async () => {
  try {
    await store.fetchForEvent(props.eventId)
    if (props.canGrant) await store.fetchCandidates()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load event access'
  }
})

function toggleScope(scope: DelegationScope) {
  scopes.value = scopes.value.includes(scope)
    ? scopes.value.filter((s) => s !== scope)
    : [...scopes.value, scope]
}

async function submit() {
  error.value = ''
  if (!userId.value) {
    error.value = 'Choose an officer'
    return
  }
  if (scopes.value.length === 0) {
    error.value = 'Choose at least one permission'
    return
  }
  saving.value = true
  try {
    await store.grant({ eventId: props.eventId, userId: userId.value, scopes: scopes.value })
    userId.value = ''
    scopes.value = ['scan']
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to grant access'
  } finally {
    saving.value = false
  }
}

async function revoke(grantId: string) {
  error.value = ''
  try {
    await store.revoke(grantId, props.eventId)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to revoke access'
  }
}

function formatExpiry(iso: string) {
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
  <Card>
    <CardContent class="p-6 space-y-5">
      <div>
        <h2 class="text-lg font-semibold text-navy">Event access</h2>
        <p class="text-xs text-slate">
          Temporary permissions for this event only. Access ends automatically when the event day
          ends, or sooner if you revoke it.
        </p>
      </div>

      <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        {{ error }}
      </div>

      <!-- Grant form (President / Secretary only) -->
      <form v-if="canGrant" class="space-y-3 rounded-xl border border-line p-4" @submit.prevent="submit">
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Officer</label>
        <select v-model="userId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
          <option value="" disabled>Select an officer…</option>
          <option v-for="c in store.candidates" :key="c.id" :value="c.id">
            {{ c.name }} — {{ c.position }}
          </option>
        </select>

        <div class="space-y-1.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-navy">Permissions</div>
          <label v-for="s in scopeOptions" :key="s" class="flex items-center gap-2 text-sm text-navy">
            <input type="checkbox" :checked="scopes.includes(s)" @change="toggleScope(s)" />
            {{ SCOPE_LABELS[s] }}
          </label>
        </div>

        <Button type="submit" variant="gold" :disabled="saving">
          {{ saving ? 'Granting…' : 'Grant access' }}
        </Button>
      </form>
      <p v-else class="text-xs text-slate">Only the President or Secretary can grant or revoke access.</p>

      <!-- Active grants -->
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-navy mb-2">
          Active ({{ activeGrants.length }})
        </div>
        <div v-if="activeGrants.length === 0" class="text-sm text-slate">No temporary access granted.</div>
        <div v-else class="space-y-2">
          <div
            v-for="g in activeGrants"
            :key="g.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
          >
            <div class="min-w-0">
              <div class="font-medium text-navy truncate">{{ g.user?.name }}</div>
              <div class="mt-1 flex flex-wrap gap-1">
                <Badge v-for="s in g.scopes" :key="s" variant="default">{{ SCOPE_LABELS[s] }}</Badge>
              </div>
              <div class="text-[11px] text-slate mt-1">
                Until {{ formatExpiry(g.expiresAt) }} · granted by {{ g.granter?.name }}
              </div>
            </div>
            <Button v-if="canGrant" variant="outline" @click="revoke(g.id)">Revoke</Button>
          </div>
        </div>
      </div>

      <!-- History -->
      <details v-if="pastGrants.length > 0">
        <summary class="cursor-pointer text-xs text-slate">Expired or revoked ({{ pastGrants.length }})</summary>
        <ul class="mt-2 space-y-1 text-xs text-slate">
          <li v-for="g in pastGrants" :key="g.id">
            {{ g.user?.name }} — {{ g.revokedAt ? 'revoked' : 'expired' }}
          </li>
        </ul>
      </details>
    </CardContent>
  </Card>
</template>
