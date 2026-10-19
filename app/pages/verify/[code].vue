<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

/**
 * The public check behind a clearance certificate (plan §8.5). Anyone a student
 * shows the code to — a landlord, an office, a scholarship desk — can confirm it
 * here, and the answer is recomputed live rather than read from the certificate.
 */
definePageMeta({ layout: 'public' })

interface Verification {
  status: 'valid' | 'no-longer-cleared' | 'revoked' | 'unknown'
  name?: string
  studentNo?: string
  issuedAt?: string
  coveredPesos?: string
  checkedAt: string
}

const route = useRoute()
const code = computed(() => String(route.params.code ?? ''))
const result = ref<Verification | null>(null)
const loading = ref(true)

const headline = computed(() => {
  switch (result.value?.status) {
    case 'valid': return 'Valid clearance'
    case 'no-longer-cleared': return 'No longer cleared'
    case 'revoked': return 'Revoked'
    default: return 'Not found'
  }
})

const explanation = computed(() => {
  switch (result.value?.status) {
    case 'valid':
      return 'The student owed nothing when this certificate was issued, and still owes nothing today.'
    case 'no-longer-cleared':
      return 'This certificate was issued correctly, but the student has since been recorded with an unpaid fine, so it no longer reflects their standing.'
    case 'revoked':
      return 'The council revoked this certificate. Ask for the current one.'
    default:
      return 'No certificate carries that code. Check for a typo — codes use letters and numbers and never contain I, O, 0 or 1.'
  }
})

const tone = computed(() => {
  if (result.value?.status === 'valid') return 'border-success bg-success/10 text-navy'
  if (result.value?.status === 'unknown') return 'border-line bg-paper text-navy'
  return 'border-gold bg-gold/10 text-navy'
})

function formatWhen(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(async () => {
  try {
    result.value = await api.get<Verification>(`/verify/${encodeURIComponent(code.value)}`)
  } catch {
    result.value = { status: 'unknown', checkedAt: new Date().toISOString() }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-xl mx-auto space-y-5 py-6">
    <div class="text-center">
      <img src="/logo/USC_logo.webp" alt="USC" class="w-14 h-14 rounded-full object-cover border border-gold mx-auto">
      <h1 class="text-xl font-bold text-navy font-serif mt-3">
        Clearance verification
      </h1>
      <p class="text-xs text-slate mt-1 font-mono">
        {{ code }}
      </p>
    </div>

    <div v-if="loading" class="text-center text-slate py-10">
      Checking…
    </div>

    <template v-else-if="result">
      <div :class="['rounded-xl border-l-4 px-4 py-4', tone]">
        <div class="font-semibold text-lg">
          {{ headline }}
        </div>
        <p class="text-sm mt-1">
          {{ explanation }}
        </p>
      </div>

      <Card v-if="result.status === 'valid' || result.status === 'no-longer-cleared'">
        <CardContent class="p-4 space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-slate">Name</span>
            <span class="font-semibold text-navy">{{ result.name }}</span>
          </div>
          <div v-if="result.studentNo" class="flex items-center justify-between gap-3">
            <span class="text-slate">Student number</span>
            <span class="font-mono text-navy">{{ result.studentNo }}</span>
          </div>
          <div v-if="result.issuedAt" class="flex items-center justify-between gap-3">
            <span class="text-slate">Issued</span>
            <span class="text-navy">{{ formatWhen(result.issuedAt) }}</span>
          </div>
          <div v-if="result.coveredPesos" class="flex items-center justify-between gap-3">
            <span class="text-slate">Settled at issue</span>
            <span class="font-mono text-navy">{{ result.coveredPesos }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 pt-1 border-t border-line">
            <span class="text-slate">Checked</span>
            <span class="text-xs text-slate">{{ formatWhen(result.checkedAt) }}</span>
          </div>
        </CardContent>
      </Card>

      <p class="text-center text-xs text-slate">
        This page shows only what a clearance is for. Questions go to the council's Treasurer.
      </p>
    </template>
  </div>
</template>
