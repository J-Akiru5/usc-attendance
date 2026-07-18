<script setup lang="ts">
import OrgChart from '@/components/ui/OrgChart.vue'
import { officers, oversight } from '@/data/officers'
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
      <!-- Ambient gold glow -->
      <div class="absolute inset-0 bg-gradient-radial from-gold/5 via-transparent to-transparent opacity-60 pointer-events-none" />
      <div class="relative px-4 md:px-12 text-center">
        <div class="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full border border-gold/20 bg-gold/5">
          <div class="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          <span class="text-xs font-mono uppercase tracking-wider text-gold/70">University Student Council</span>
        </div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4 text-white">USC Organizational Chart</h1>
        <p class="text-white/60 max-w-2xl mx-auto leading-relaxed text-sm md:text-base">
          Meet the officers serving the student body of ISUFST Dingle Campus for the current academic year.
        </p>
      </div>
    </section>

    <!-- Org Chart -->
    <section class="py-14 md:py-20 bg-navy-deep">
      <div class="w-full px-4 md:px-8">
        <OrgChart :oversight="oversight" :officers="officers" />
      </div>
    </section>
  </div>
</template>
