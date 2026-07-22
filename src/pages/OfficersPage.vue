<script setup lang="ts">
import { computed } from 'vue'
import { officers, tierLabels, type OfficerTier } from '@/data/officers'
import OfficerCard from '@/components/ui/OfficerCard.vue'

type CardVariant = 'institutional' | 'pivot' | 'executive' | 'committee' | 'senate'

const tiers: OfficerTier[] = ['administration', 'federated_usc', 'usc_advisers', 'usc_executive', 'student_senate']

function officersIn(tier: OfficerTier) {
  return computed(() => officers.filter(o => o.tier === tier))
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(p => !p.endsWith('.'))
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function variantFor(tier: OfficerTier): CardVariant {
  const map: Record<OfficerTier, CardVariant> = {
    administration: 'institutional',
    federated_usc: 'institutional',
    usc_advisers: 'pivot',
    usc_executive: 'executive',
    student_senate: 'senate',
  }
  return map[tier]
}
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

    <!-- Tier Sections -->
    <div class="bg-paper">
      <section
        v-for="(tier, tIdx) in tiers"
        :key="tier"
        class="py-12 md:py-16"
        :class="tIdx % 2 === 0 ? 'bg-paper' : 'bg-[#F0EDE6]'"
      >
        <div class="px-4 md:px-12">
          <!-- Section Header -->
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-8 h-1 rounded-full bg-gold" />
              <span class="text-[10px] font-mono uppercase tracking-wider text-gold-dark">
                Tier {{ tIdx + 1 }}
              </span>
            </div>
            <h2 class="text-xl md:text-2xl font-bold font-serif text-navy">
              {{ tierLabels[tier].label }}
            </h2>
            <p class="text-sm text-slate mt-1">
              {{ tierLabels[tier].sublabel }}
            </p>
          </div>

          <!-- Officers Grid -->
          <div
            :class="[
              tier === 'student_senate'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3'
                : tier === 'administration'
                  ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                  : 'grid grid-cols-1 sm:grid-cols-2 gap-4'
            ]"
          >
            <div
              v-for="officer in officersIn(tier).value"
              :key="officer.name"
              class="flex justify-center"
            >
              <OfficerCard
                :name="officer.name"
                :designation="officer.position"
                :initials="getInitials(officer.name)"
                :variant="variantFor(tier)"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
