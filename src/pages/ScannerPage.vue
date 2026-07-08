<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import type { QRToken } from '@/types'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

const router = useRouter()
const auth = useAuthStore()
const scanning = ref(false)
const result = ref<{ success: boolean; message: string } | null>(null)
const scannerRef = ref<HTMLDivElement | null>(null)
let html5QrScanner: any = null

async function handleScan(decodedText: string) {
  if (!auth.user) return

  scanning.value = true
  result.value = null

  try {
    const token: QRToken = JSON.parse(decodedText)

    const response = await api.post('/attendance/qr', {
      userId: token.userId,
      eventId: token.eventId,
      issuedAt: token.issuedAt,
      exp: token.exp,
      sig: token.sig,
      recordedBy: auth.user.id,
    })

    result.value = { success: true, message: `Check-in recorded for ${(response as any).user?.name || 'officer'}` }
  } catch (err: unknown) {
    result.value = { success: false, message: err instanceof Error ? err.message : 'Scan failed' }
  } finally {
    scanning.value = false
  }
}

onMounted(async () => {
  try {
    const { Html5Qrcode } = await import('html5-qrcode')

    if (scannerRef.value) {
      html5QrScanner = new Html5Qrcode('qr-scanner')
      await html5QrScanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText: string) => {
          handleScan(decodedText)
        },
        () => {} // ignore errors
      )
    }
  } catch (err) {
    result.value = { success: false, message: 'Camera access required for scanning' }
  }
})

onUnmounted(() => {
  if (html5QrScanner) {
    html5QrScanner.stop().catch(() => {})
    html5QrScanner.clear()
  }
})
</script>

<template>
  <div class="max-w-md mx-auto space-y-5">
    <!-- Header -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
      <div class="absolute -right-8 -top-8 w-32 h-32 border border-white/10 rounded-full" />
      <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">Scanner</div>
      <h1 class="text-2xl font-bold">Scan officer QR</h1>
      <p class="text-white/50 text-sm mt-1">Point camera at officer's QR code</p>
    </div>

    <!-- Camera viewport -->
    <Card>
      <CardContent class="p-4">
        <div id="qr-scanner" ref="scannerRef" class="w-full rounded-xl overflow-hidden" />
        <div v-if="!scannerRef" class="text-center py-12 text-slate text-sm">
          Initializing camera...
        </div>
      </CardContent>
    </Card>

    <!-- Status -->
    <div v-if="scanning" class="text-center">
      <Badge variant="default" class="text-base px-4 py-1 animate-pulse">Processing scan...</Badge>
    </div>

    <!-- Result -->
    <div
      v-if="result"
      :class="[
        'rounded-xl border-l-4 px-4 py-3 text-sm font-medium',
        result.success
          ? 'border-success bg-success/10 text-success'
          : 'border-danger bg-danger/10 text-danger',
      ]"
    >
      {{ result.message }}
    </div>

    <!-- Manual fallback -->
    <div class="text-center">
      <button
        class="text-xs text-navy font-bold hover:underline"
        @click="router.push('/events')"
      >
        Back to events
      </button>
    </div>

    <!-- Bottom stamp -->
    <div class="bg-gold rounded-lg px-5 py-3 flex items-center justify-between text-xs font-bold">
      <span class="text-navy-deep">ISUFST · Dingle Campus</span>
      <span class="text-yellow-900">{{ new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
    </div>
  </div>
</template>
