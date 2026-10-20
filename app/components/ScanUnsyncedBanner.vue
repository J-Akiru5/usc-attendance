<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useScanQueue } from '@/composables/useScanQueue'
import { useAuthStore } from '@/stores/auth'
import { unacknowledgedRefusals, unsyncedBanner } from '@/utils/scan-queue'

/**
 * BC-6: one persistent truth about unsynced work, on every officer page.
 * The count comes from IndexedDB (shared `useState`, refreshed on mount and
 * whenever the tab regains focus), so it is the same count after a reload.
 *
 * T-0008: the banner also says when the queue belongs to a different officer,
 * so the next officer is not told work is theirs to sync. It never names that
 * officer, and it does not count their refusals as this officer's.
 */
const auth = useAuthStore()
const { pending, refused, acknowledgedIds, storage, ownership, claim, refresh } = useScanQueue()

const officerId = computed(() => auth.user?.id ?? '')

const banner = computed(() => {
  const notRecorded = ownership.value === 'foreign'
    ? 0
    : unacknowledgedRefusals(refused.value, acknowledgedIds.value).length
  // Only claim persistence was refused when the request was actually answered;
  // "not asked yet" must not read as "unsafe".
  const persisted = storage.value?.persisted === true
    ? true
    : storage.value?.requested
      ? false
      : null
  return unsyncedBanner({
    pending: pending.value.length,
    notRecorded,
    persisted,
    foreignOwner: ownership.value === 'foreign'
  })
})

let onFocus: (() => void) | undefined

/**
 * BC-6: a reload or closed tab must not silently abandon queued work. This
 * lives in the banner rather than the scanner so it covers every officer page.
 */
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (pending.value.length === 0 || ownership.value === 'foreign') return
  event.preventDefault()
  event.returnValue = ''
}

async function resolveQueue() {
  await refresh()
  if (officerId.value) await claim(officerId.value)
}

onMounted(() => {
  void resolveQueue()
  onFocus = () => {
    void resolveQueue()
  }
  window.addEventListener('focus', onFocus)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  if (onFocus) window.removeEventListener('focus', onFocus)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <!-- BC-13: the queue count is a status change, so it is announced. The live
       region wraps the link rather than replacing it - role=status on the <a>
       would strip the link semantics from the thing officers tap. -->
  <div v-if="banner.visible" role="status" aria-live="polite">
    <NuxtLink
      to="/scan#queue"
      data-testid="scan-unsynced-banner"
      class="flex items-start gap-3 rounded-xl border-l-4 px-4 py-3 text-sm transition-colors"
      :class="banner.tone === 'danger'
        ? 'border-danger bg-danger/10 text-danger hover:bg-danger/15'
        : 'border-gold bg-gold/10 text-navy hover:bg-gold/20'"
    >
      <span class="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">!</span>
      <span class="min-w-0 flex-1">
        <span class="font-semibold">{{ banner.label }}</span>
        <span class="mt-0.5 block text-xs font-normal opacity-80">
          {{ ownership === 'foreign'
            ? 'Only the officer who took these scans can send them.'
            : 'Tap to open the scanner queue.' }}
        </span>
        <span v-if="banner.atCap" class="mt-1 block text-xs font-bold">
          Queue full - sync now before scanning anyone else.
        </span>
        <span v-if="banner.storageWarning" class="mt-1 block text-xs font-semibold">
          {{ banner.storageWarning }}
        </span>
      </span>
    </NuxtLink>
  </div>
</template>
