<script setup lang="ts">
import { officers } from '@/data/officers'
import OrgChart from '@/components/ui/OrgChart.vue'
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
    <section class="bg-paper py-12 md:py-16">
      <div class="px-4 md:px-8">
        <OrgChart :officers="officers" />
      </div>
    </section>
  </div>
</template>
