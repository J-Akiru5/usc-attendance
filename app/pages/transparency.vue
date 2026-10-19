<script setup lang="ts">
import { computed } from 'vue'

/**
 * The public transparency board (plan §8.7). A NEW route: it never touches the
 * frozen public pages, the public layout's nav or the global CSS. Summary only —
 * the server sends totals per budget line and nothing else (no names, no student
 * data, no receipts), and only while the council has switched the board on.
 */
definePageMeta({ layout: 'public' })

interface PublicLine {
  name: string
  category: string
  allocatedCentavos: number
  allocatedPesos: string
  expenseCentavos: number
  expensePesos: string
  incomeCentavos: number
  incomePesos: string
  remainingCentavos: number
  remainingPesos: string
}
interface PublicTransparency {
  enabled: boolean
  note?: string | null
  updatedAt?: string
  semester?: { name: string, startsOn: string, endsOn: string } | null
  lines?: PublicLine[]
  totals?: {
    allocatedCentavos: number
    allocatedPesos: string
    expenseCentavos: number
    expensePesos: string
    incomeCentavos: number
    incomePesos: string
    remainingCentavos: number
    remainingPesos: string
  } | null
  proposals?: { total: number, byStatus: Record<string, number> }
}

const { data, error } = await useAsyncData('transparency', () => $fetch<PublicTransparency>('/api/transparency'))

const board = computed(() => data.value ?? { enabled: false })
const lines = computed(() => board.value.lines ?? [])
const totals = computed(() => board.value.totals ?? null)
const statusRows = computed(() =>
  Object.entries(board.value.proposals?.byStatus ?? {}).sort((a, b) => b[1] - a[1])
)

const STATUS_LABELS: Record<string, string> = {
  decided: 'Decided by the body',
  noted: 'Noted, awaiting approval',
  approved: 'Approved by the Campus Administrator',
  released: 'Released',
  liquidated: 'Liquidated',
  rejected: 'Rejected'
}

const peso = (centavos: number) =>
  `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const asOf = computed(() => board.value.updatedAt
  ? new Date(board.value.updatedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })
  : '')
</script>

<template>
  <div class="min-h-screen bg-paper">
    <section class="bg-navy text-white">
      <div class="px-4 md:px-12 py-12 md:py-16">
        <div class="max-w-5xl mx-auto">
          <div class="text-[10px] font-mono uppercase tracking-[0.3em] text-gold/70">
            Public record
          </div>
          <h1 class="mt-3 text-3xl md:text-4xl font-bold font-serif">
            Transparency board
          </h1>
          <p class="mt-3 max-w-2xl text-sm md:text-base text-white/60 leading-relaxed">
            How the University Student Council's semester budget is allocated, what has been spent and
            what has come in. Summary only — no student names, no personal data and no individual receipts.
          </p>
          <p v-if="board.enabled && board.semester" class="mt-4 text-xs font-mono uppercase tracking-wider text-gold/60">
            {{ board.semester.name }}<span v-if="asOf"> · updated {{ asOf }}</span>
          </p>
        </div>
      </div>
    </section>

    <section class="px-4 md:px-12 py-10 md:py-14">
      <div class="max-w-5xl mx-auto">
        <div v-if="error" class="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
          The board could not be loaded right now. Please try again later.
        </div>

        <div v-else-if="!board.enabled" class="rounded-2xl border border-line bg-paper-panel p-8 text-center">
          <h2 class="text-lg font-semibold text-navy font-serif">
            Not published yet
          </h2>
          <p class="mt-2 text-sm text-slate max-w-xl mx-auto">
            The council has not switched the public summary on. When it does, the semester's budget
            lines and their totals will appear here.
          </p>
        </div>

        <template v-else>
          <p v-if="board.note" class="mb-6 text-sm text-slate italic">
            {{ board.note }}
          </p>

          <div v-if="totals" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="rounded-2xl border border-line bg-paper-panel p-5">
              <div class="text-[10px] font-mono uppercase tracking-widest text-slate">
                Allocated
              </div>
              <div class="mt-2 text-2xl font-bold text-navy font-serif">
                {{ totals.allocatedPesos }}
              </div>
            </div>
            <div class="rounded-2xl border border-line bg-paper-panel p-5">
              <div class="text-[10px] font-mono uppercase tracking-widest text-slate">
                Spent
              </div>
              <div class="mt-2 text-2xl font-bold text-navy font-serif">
                {{ totals.expensePesos }}
              </div>
            </div>
            <div class="rounded-2xl border border-line bg-paper-panel p-5">
              <div class="text-[10px] font-mono uppercase tracking-widest text-slate">
                Income
              </div>
              <div class="mt-2 text-2xl font-bold text-navy font-serif">
                {{ totals.incomePesos }}
              </div>
            </div>
            <div class="rounded-2xl border border-line bg-paper-panel p-5">
              <div class="text-[10px] font-mono uppercase tracking-widest text-slate">
                Remaining
              </div>
              <div class="mt-2 text-2xl font-bold font-serif" :class="totals.remainingCentavos < 0 ? 'text-danger' : 'text-navy'">
                {{ totals.remainingPesos }}
              </div>
            </div>
          </div>

          <div class="mt-8 overflow-x-auto rounded-2xl border border-line bg-paper-panel">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-navy/5 text-left text-[10px] font-mono uppercase tracking-widest text-slate">
                  <th class="px-4 py-3">
                    Budget line
                  </th>
                  <th class="px-4 py-3">
                    Category
                  </th>
                  <th class="px-4 py-3 text-right">
                    Allocated
                  </th>
                  <th class="px-4 py-3 text-right">
                    Spent
                  </th>
                  <th class="px-4 py-3 text-right">
                    Income
                  </th>
                  <th class="px-4 py-3 text-right">
                    Remaining
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                <tr v-for="line in lines" :key="line.name">
                  <td class="px-4 py-3 font-medium text-navy">
                    {{ line.name }}
                  </td>
                  <td class="px-4 py-3 text-slate">
                    {{ line.category }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    {{ line.allocatedPesos }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    {{ line.expensePesos }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    {{ line.incomePesos }}
                  </td>
                  <td class="px-4 py-3 text-right font-semibold" :class="line.remainingCentavos < 0 ? 'text-danger' : 'text-navy'">
                    {{ line.remainingPesos }}
                  </td>
                </tr>
                <tr v-if="lines.length === 0">
                  <td colspan="6" class="px-4 py-6 text-center text-sm text-slate">
                    No line items recorded for this semester yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="statusRows.length" class="mt-8">
            <h2 class="text-lg font-semibold text-navy font-serif">
              Proposals
            </h2>
            <p class="mt-1 text-sm text-slate">
              How many proposals stand at each stage of the council's approval chain.
            </p>
            <ul class="mt-4 flex flex-wrap gap-3">
              <li v-for="[status, count] in statusRows" :key="status" class="rounded-full border border-line bg-paper-panel px-4 py-2 text-xs text-navy">
                {{ STATUS_LABELS[status] ?? status }}:
                <span class="font-semibold">{{ count }}</span>
              </li>
            </ul>
          </div>

          <div v-if="totals" class="mt-6 text-xs text-slate">
            Checked against the council's books: allocated {{ peso(totals.allocatedCentavos) }} plus income
            {{ peso(totals.incomeCentavos) }} less spending {{ peso(totals.expenseCentavos) }} leaves
            {{ peso(totals.remainingCentavos) }}.
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
