<script setup lang="ts">
import { projects } from '@/data/projects'
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
      <div class="relative max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">What We Do</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Projects & Programs</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Initiatives and programs led by the University Student Council to serve the ISUFST student body and community.
        </p>
      </div>
    </section>

    <!-- Projects Grid -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="project in projects"
            :key="project.title"
            class="rounded-2xl border border-line bg-paper-panel p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div class="w-12 h-12 rounded-xl bg-navy/5 border border-line flex items-center justify-center mb-4">
              <span class="text-2xl">{{ project.icon }}</span>
            </div>
            <div class="text-[10px] font-mono uppercase tracking-wider text-gold-dark mb-2">{{ project.category }}</div>
            <h3 class="text-base font-bold text-navy mb-2">{{ project.title }}</h3>
            <p class="text-sm text-slate leading-relaxed">{{ project.description }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
