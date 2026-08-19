<script setup lang="ts">
import { computed } from 'vue'
import { officers } from '@/data/officers'

interface CeremonyItem {
  role: string
  officerName: string
  extra?: string[]
}

const ceremonyProgram: CeremonyItem[] = [
  { role: 'Prayer', officerName: 'Jared S. Demonteverde' },
  { role: 'Flag Speaks', officerName: 'Alliah Dace P. Ramos' },
  { role: 'Lupang Hinirang', officerName: 'Dein Andrey D. Daguro' },
  { role: 'Citizens Reply', officerName: 'Jeff Edrick C. Martinez' },
  { role: 'Panunumpa', officerName: 'Chene D. Manderico' },
  { role: 'Lingkod Bayan', officerName: 'Febe Jane' },
  { role: 'Bagong Pilipinas Pledge', officerName: 'Jonard V. Verdeflor' },
  { role: 'Quality Policy Statements', officerName: 'Rowena S. Borcelo' },
  { role: 'Dingle Hymn', officerName: 'Nikki Loraine B. Danugrao' },
  {
    role: 'Zumba Leaders',
    officerName: 'John David A. Natalio',
    extra: ['Daraug', 'Araño', 'Llabore', 'Espia'],
  },
]

function findOfficer(namePart: string) {
  return officers.find((o) => o.name.includes(namePart))
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter((p) => !p.endsWith('.'))
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const programWithPhotos = computed(() =>
  ceremonyProgram.map((item) => {
    const officer = findOfficer(item.officerName)
    const extras = item.extra?.map((name) => findOfficer(name)) ?? []
    return {
      ...item,
      photo: officer?.photo ?? null,
      fullName: officer?.name ?? item.officerName,
      position: officer?.position ?? '',
      extras: extras.map((o) => ({
        name: o?.name ?? 'Unknown',
        photo: o?.photo ?? null,
      })),
    }
  }),
)
</script>

<template>
  <section class="relative py-16 md:py-20 overflow-hidden">
    <!-- Background -->
    <div class="absolute inset-0 bg-navy" />
    <div
      class="absolute inset-0 opacity-[0.03]"
      style="
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px);
        background-size: 50px 50px;
      "
    />

    <div class="relative px-4 md:px-12">
      <!-- Header -->
      <div class="text-center mb-10">
        <div
          class="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 mb-4"
        >
          <span class="text-lg">🇵🇭</span>
          <span class="text-xs font-mono uppercase tracking-wider text-gold"
            >Upcoming Event</span
          >
        </div>
        <h2
          class="text-3xl md:text-4xl font-bold font-serif text-white mb-2 drop-shadow-lg"
        >
          Flag Raising Ceremony
        </h2>
        <div
          class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-mono uppercase tracking-wider text-white/50"
        >
          <span>Monday, August 10, 2026</span>
          <span class="flex items-center gap-1.5">
            <svg
              class="w-3.5 h-3.5 text-gold"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            ISUFST Dingle Campus
          </span>
        </div>
      </div>

      <!-- Ceremony Program -->
      <div class="max-w-2xl mx-auto space-y-3">
        <div
          v-for="item in programWithPhotos"
          :key="item.role"
          class="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 flex items-center gap-4 hover:bg-white/8 transition-colors"
        >
          <!-- Officer Photo or Initials -->
          <div
            class="w-12 h-12 rounded-full bg-navy border-2 border-gold/40 overflow-hidden shrink-0 flex items-center justify-center"
          >
            <img
              v-if="item.photo"
              :src="item.photo"
              :alt="item.fullName"
              class="w-full h-full object-cover object-top"
              style="image-rendering: -webkit-optimize-contrast"
            />
            <span v-else class="text-sm font-bold text-gold">{{
              getInitials(item.fullName)
            }}</span>
          </div>

          <!-- Role & Name -->
          <div class="flex-1 min-w-0">
            <div class="text-[10px] font-mono uppercase tracking-wider text-gold mb-0.5">
              {{ item.role }}
            </div>
            <div class="text-sm font-bold text-white truncate">
              {{ item.fullName }}
            </div>
            <div v-if="item.position" class="text-xs text-white/50">
              {{ item.position }}
            </div>
          </div>

          <!-- Extra Officers for Zumba -->
          <div
            v-if="item.extras.length > 0"
            class="hidden sm:flex items-center gap-1"
          >
            <div
              v-for="extra in item.extras"
              :key="extra.name"
              class="w-8 h-8 rounded-full bg-navy border border-gold/30 overflow-hidden flex items-center justify-center"
              :title="extra.name"
            >
              <img
                v-if="extra.photo"
                :src="extra.photo"
                :alt="extra.name"
                class="w-full h-full object-cover object-top"
              />
              <span v-else class="text-[8px] font-bold text-gold">{{
                getInitials(extra.name)
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Extra Officers Names for Zumba (mobile) -->
      <div class="sm:hidden max-w-2xl mx-auto mt-3">
        <div
          class="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-3"
        >
          <div class="text-[10px] font-mono uppercase tracking-wider text-gold mb-2">
            Zumba Leaders
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="extra in programWithPhotos[9]?.extras ?? []"
              :key="extra.name"
              class="text-xs text-white/70 bg-white/10 rounded-full px-2.5 py-1"
            >
              {{ extra.name }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
