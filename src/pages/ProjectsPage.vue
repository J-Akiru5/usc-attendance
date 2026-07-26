<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { projects as staticProjects } from '@/data/projects'
import type { Project } from '@/data/projects'

const projects = ref<Project[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch('/api/cms/projects')
    if (res.ok) {
      const data = await res.json()
      projects.value = data.length > 0 ? data : staticProjects
    } else {
      projects.value = staticProjects
    }
  } catch {
    projects.value = staticProjects
  } finally {
    loading.value = false
  }
})
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
        <div v-if="loading" class="text-center py-12">
          <div class="inline-flex items-center gap-2 text-gold">
            <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span class="text-sm font-mono uppercase tracking-wider">Loading projects...</span>
          </div>
        </div>
        <div v-else-if="projects.length === 0" class="text-center py-12">
          <p class="text-slate">No projects found.</p>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
