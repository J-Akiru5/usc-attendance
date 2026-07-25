<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { officers, tierLabels } from '@/data/officers'
import OrgChart from '@/components/ui/OrgChart.vue'

interface SelectedOfficer {
  name?: string
  designation: string
  photo?: string
}

const selectedOfficer = ref<SelectedOfficer | null>(null)

const selectedTierLabel = computed(() => {
  if (!selectedOfficer.value?.name) return null
  const officer = officers.find(o => o.name === selectedOfficer.value!.name)
  return officer ? tierLabels[officer.tier] : null
})

function selectOfficer(data: SelectedOfficer) {
  selectedOfficer.value = data
}

function closeModal() {
  selectedOfficer.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeModal()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20 relative overflow-hidden">
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image:
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
          background-size: 40px 40px;
        "
      />
      <div class="relative px-4 md:px-12 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Leadership</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">USC Officers</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Meet the officers and administrators serving the student body of ISUFST Dingle Campus.
        </p>
      </div>
    </section>

    <!-- Org Chart -->
    <section class="bg-[#0B132B] py-6 md:py-10 relative overflow-hidden">
      <OrgChart :officers="officers" @select="selectOfficer" />
    </section>

    <!-- Profile Modal -->
    <Teleport to="body">
      <div
        v-if="selectedOfficer"
        class="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-black/60 px-4"
        @click.self="closeModal"
      >
        <!-- Modal card -->
        <div class="relative w-full max-w-xl bg-slate-900/90 border border-amber-500/20 backdrop-blur-md rounded-2xl p-6 shadow-2xl">
          <!-- Close button -->
          <button
            class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            @click="closeModal"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div class="flex flex-col md:flex-row gap-6 items-center">
            <!-- Left: Photo -->
            <div class="shrink-0 w-48 sm:w-56 aspect-[3/4] rounded-xl border border-white/10 overflow-hidden bg-slate-800">
              <img
                v-if="selectedOfficer.photo"
                :src="selectedOfficer.photo"
                :alt="selectedOfficer.name"
                class="w-full h-full object-cover object-top"
                style="image-rendering: -webkit-optimize-contrast;"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-16 h-16 text-white/10" viewBox="0 0 48 48" fill="none">
                  <path d="M24 4C18.477 4 14 8.477 14 14s4.477 10 10 10 10-4.477 10-10S29.523 4 24 4z" fill="currentColor"/>
                  <path d="M24 28c-6.627 0-12 3.582-12 8v4h24v-4c0-4.418-5.373-8-12-8z" fill="currentColor"/>
                </svg>
              </div>
            </div>

            <!-- Right: Details -->
            <div class="flex-1 text-center md:text-left min-w-0">
              <h3 class="text-2xl font-bold text-white leading-tight break-words">
                {{ selectedOfficer.name || '—' }}
              </h3>
              <p class="text-amber-400 font-semibold uppercase tracking-wider text-sm mt-2">
                {{ selectedOfficer.designation }}
              </p>

              <div v-if="selectedTierLabel" class="mt-5 space-y-1.5 pt-5 border-t border-white/10">
                <div class="flex items-center gap-2 text-gray-400 text-xs font-mono uppercase tracking-wider justify-center md:justify-start">
                  <svg class="w-3.5 h-3.5 text-amber-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  <span>{{ selectedTierLabel.label }}</span>
                </div>
                <p class="text-gray-500 text-xs leading-relaxed">{{ selectedTierLabel.sublabel }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
