<script setup lang="ts">
import { useRouter } from 'vue-router'
import { officers } from '@/data/officers'
import { projects } from '@/data/projects'
import { publicEvents } from '@/data/events'

const router = useRouter()

const executiveOfficers = officers.filter(o => o.role === 'executive').slice(0, 4)
const previewProjects = projects.slice(0, 3)
const previewEvents = publicEvents.slice(0, 3)

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(p => !p.endsWith('.'))
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
</script>

<template>
  <div>
    <!-- ========== HERO ========== -->
    <section class="relative text-white overflow-hidden min-h-[580px] flex items-center">
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style="background-image: url('/isufst.jpg');"
      />
      <div class="absolute inset-0 bg-navy/60" />
      <div
        class="absolute inset-0"
        style="background: linear-gradient(100deg, rgba(12,27,54,0.98) 0%, rgba(12,27,54,0.92) 30%, rgba(12,27,54,0.65) 55%, rgba(12,27,54,0.15) 100%);"
      />
      <div
        class="absolute inset-x-0 bottom-0 h-40"
        style="background: linear-gradient(to top, rgba(12,27,54,0.85) 0%, transparent 100%);"
      />
      <div
        class="absolute inset-x-0 top-0 h-20"
        style="background: linear-gradient(to bottom, rgba(12,27,54,0.6) 0%, transparent 100%);"
      />

      <div class="relative max-w-7xl mx-auto px-4 md:px-6 py-20 md:py-28 w-full">
        <div class="max-w-2xl">
          <div class="text-xs font-mono uppercase tracking-widest text-gold mb-5">
            ISUFST Dingle Campus
          </div>

          <h1 class="text-4xl md:text-5xl lg:text-[3.75rem] font-bold font-serif leading-tight mb-3 drop-shadow-lg">
            University Student<br>Council
          </h1>

          <p class="text-white/50 text-sm font-mono uppercase tracking-wider mb-5">
            Official Website
          </p>

          <p class="text-white/80 text-base md:text-lg leading-relaxed mb-10 max-w-xl">
            Serving students. Leading change. Building community.<br>
            The official digital presence of the University Student Council.
          </p>

          <div class="flex flex-wrap gap-3">
            <button
              @click="router.push('/portal')"
              class="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-xl shadow-black/30 hover:brightness-110 transition-all"
            >
              Officer Portal
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </button>
            <button
              @click="router.push('/about')"
              class="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-white/40 bg-white/5 backdrop-blur-sm text-white font-medium text-sm hover:bg-white/15 hover:border-white/60 transition-all"
            >
              Learn More
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== ABOUT PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Who We Are</div>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-navy mb-6">
              Serving Students.<br>Leading Change.
            </h2>
            <p class="text-slate leading-relaxed mb-4">
              The University Student Council is the official student governing body of ISUFST Dingle Campus. We represent the student body, organize programs, and advocate for student welfare.
            </p>
            <p class="text-slate leading-relaxed mb-8">
              Through leadership, service, and collaboration, the USC works to create a vibrant and inclusive campus community for all students.
            </p>
            <router-link
              to="/about"
              class="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:text-gold-dark transition-colors"
            >
              About the Council
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </router-link>
          </div>

          <div class="rounded-2xl border border-line bg-paper-panel shadow-lg overflow-hidden">
            <div class="bg-navy px-4 py-3 flex items-center gap-2">
              <div class="flex gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              </div>
              <div class="ml-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">About the Council</div>
            </div>
            <div class="p-6">
              <div class="flex items-center gap-3 mb-5 pb-4 border-b border-line">
                <div class="w-10 h-10 rounded-full bg-navy border border-gold/40 flex items-center justify-center">
                  <span class="text-gold font-bold text-xs">USC</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-navy">University Student Council</div>
                  <div class="text-[10px] text-slate font-mono">ISUFST Dingle Campus</div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-navy/5 rounded-xl p-4 text-center border border-line/50">
                  <div class="text-2xl font-bold text-navy font-serif">14</div>
                  <div class="text-xs text-slate mt-1">Officers</div>
                </div>
                <div class="bg-navy/5 rounded-xl p-4 text-center border border-line/50">
                  <div class="text-2xl font-bold text-navy font-serif">6</div>
                  <div class="text-xs text-slate mt-1">Programs</div>
                </div>
              </div>
              <div class="space-y-2">
                <div v-for="item in ['Student representation', 'Campus programs', 'Community outreach', 'Leadership development']"
                  :key="item"
                  class="flex items-center gap-2 text-sm text-slate"
                >
                  <svg class="w-4 h-4 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  {{ item }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== OFFICERS PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Leadership</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Executive Officers</h2>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div
            v-for="officer in executiveOfficers"
            :key="officer.email"
            class="flex flex-col items-center text-center p-5 rounded-xl border border-line bg-paper-panel shadow-sm"
          >
            <div class="w-16 h-16 rounded-full bg-navy border-2 border-gold/40 flex items-center justify-center mb-3">
              <span class="text-gold font-bold text-base font-serif">{{ getInitials(officer.name) }}</span>
            </div>
            <p class="text-xs font-bold text-navy leading-tight">{{ officer.name }}</p>
            <p class="text-[10px] text-gold-dark font-semibold mt-0.5">{{ officer.position }}</p>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/officers"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all officers
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== PROJECTS PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">What We Do</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Projects & Programs</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            v-for="project in previewProjects"
            :key="project.title"
            class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm hover:shadow-md transition-all"
          >
            <div class="text-2xl mb-3">{{ project.icon }}</div>
            <div class="text-[10px] font-mono uppercase tracking-wider text-gold-dark mb-1.5">{{ project.category }}</div>
            <h3 class="text-sm font-bold text-navy mb-2">{{ project.title }}</h3>
            <p class="text-xs text-slate leading-relaxed">{{ project.description }}</p>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/projects"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all projects
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== EVENTS PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Get Involved</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Upcoming Events</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            v-for="event in previewEvents"
            :key="event.title"
            class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm hover:shadow-md transition-all"
          >
            <div class="flex items-center gap-3 mb-3">
              <span class="text-xl">{{ event.icon }}</span>
              <div class="text-[10px] font-mono uppercase tracking-wider text-gold-dark">{{ event.date }}</div>
            </div>
            <h3 class="text-sm font-bold text-navy mb-2">{{ event.title }}</h3>
            <p class="text-xs text-slate leading-relaxed">{{ event.description }}</p>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/events"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all events
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== CTA ========== -->
    <section class="py-16 md:py-20 bg-navy text-white">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-white mb-4">
          USC Officer?
        </h2>
        <p class="text-white/70 mb-8 max-w-xl mx-auto leading-relaxed">
          Access the Officer Portal for attendance management, event tracking, and other digital services.
        </p>
        <button
          @click="router.push('/portal')"
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold text-navy font-bold shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
        >
          Visit Officer Portal
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </button>
      </div>
    </section>
  </div>
</template>
