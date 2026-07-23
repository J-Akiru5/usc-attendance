<script setup lang="ts">
const values = [
  { title: 'Service', description: 'Dedicated to serving the student body through responsive and impactful programs.', icon: '🤝' },
  { title: 'Integrity', description: 'Committed to transparency, accountability, and ethical governance.', icon: '⚖️' },
  { title: 'Unity', description: 'Fostering a sense of community and belonging among all ISUFST students.', icon: '🤲' },
  { title: 'Excellence', description: 'Striving for the highest standards in leadership and academic support.', icon: '🌟' },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="relative text-white py-20 md:py-28 overflow-hidden">
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style="background-image: url('/isufst.webp');"
      />
      <div class="absolute inset-0 bg-navy/75" />
      <div class="absolute inset-0" style="background: linear-gradient(135deg, rgba(12,27,54,0.95) 0%, rgba(12,27,54,0.70) 60%, rgba(12,27,54,0.40) 100%);" />
      <div class="absolute inset-x-0 bottom-0 h-24" style="background: linear-gradient(to top, rgba(12,27,54,0.8) 0%, transparent 100%);" />

      <div class="relative px-4 md:px-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">About</div>
            <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold font-serif mb-4 leading-tight drop-shadow-lg">
              University Student Council
            </h1>
            <p class="text-white/70 max-w-lg leading-relaxed">
              The official student governing body of ISUFST Dingle Campus, serving the student body through leadership, programs, and advocacy.
            </p>
          </div>
          <div class="hidden lg:flex justify-end">
            <div class="w-72 h-48 rounded-2xl bg-white/5 border border-white/15 backdrop-blur-sm flex items-center justify-center relative overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent" />
              <div class="text-center relative z-10">
                <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-16 h-16 rounded-2xl object-cover border border-gold/40 mx-auto mb-3 shadow-md shrink-0" />
                <div class="text-sm font-semibold text-white">ISUFST Dingle Campus</div>
                <div class="text-xs text-white/50 font-mono mt-1">University Student Council</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Mission -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div class="rounded-2xl border border-line bg-paper-panel p-8 md:p-12 shadow-sm text-center">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-4">Mission</div>
          <p class="text-xl md:text-2xl font-serif text-navy leading-relaxed">
            To represent, serve, and empower the students of ISUFST Dingle Campus through
            <span class="text-gold-dark font-semibold">transparent governance</span>,
            <span class="text-gold-dark font-semibold">meaningful programs</span>, and
            <span class="text-gold-dark font-semibold">inclusive leadership</span>.
          </p>
        </div>
      </div>
    </section>

    <!-- About Content -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="px-4 md:px-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Our Role</div>
            <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-6">What We Do</h2>
            <p class="text-slate leading-relaxed mb-4">
              The University Student Council serves as the bridge between the student body and the administration. We organize campus programs, advocate for student welfare, and provide services that enhance the student experience.
            </p>
            <p class="text-slate leading-relaxed mb-8">
              From environmental campaigns to academic support, leadership seminars to community outreach, the USC works to build a vibrant and inclusive campus community.
            </p>

            <div class="flex items-center gap-3">
              <img src="/logo/ISUFST_logo.webp" alt="ISUFST Logo" class="w-10 h-10 rounded-full object-contain bg-white/10 p-0.5 border border-gold/20 shrink-0" />
              <div>
                <div class="text-sm font-semibold text-navy">ISUFST Dingle Campus</div>
                <div class="text-xs text-slate">Serving Students Since Establishment</div>
              </div>
            </div>
          </div>

          <div class="relative rounded-2xl border border-line bg-navy shadow-xl overflow-hidden group min-h-[340px] flex flex-col justify-between">
            <div
              class="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style="background-image: url('/library.webp');"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-navy-deep via-navy/70 to-navy/30" />

            <div class="relative z-10 p-5 flex items-center justify-between">
              <div class="bg-navy/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 flex items-center gap-2 shadow-lg">
                <span class="w-2 h-2 rounded-full bg-gold animate-pulse"></span>
                <span class="text-[10px] font-mono text-white/90 uppercase tracking-wider font-semibold">
                  Knowledge Management Library
                </span>
              </div>
            </div>

            <div class="relative z-10 p-6 pt-12">
              <div class="bg-navy/85 backdrop-blur-md border border-white/15 rounded-xl p-5 shadow-2xl">
                <div class="text-xs font-mono uppercase tracking-wider text-gold mb-2">Council Structure</div>
                <h3 class="text-base font-bold font-serif text-white mb-3">Organization</h3>
                <div class="grid grid-cols-2 gap-2">
                  <div v-for="item in ['Executive Board', 'Student Senate', 'Committees', 'Project Teams']" :key="item" class="flex items-center gap-2 text-xs text-white/80 bg-white/5 rounded-lg p-2 border border-white/10">
                    <svg class="w-3.5 h-3.5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span>{{ item }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Values -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Guiding Principles</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Our Values</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div
            v-for="value in values"
            :key="value.title"
            class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm text-center"
          >
            <div class="text-3xl mb-3">{{ value.icon }}</div>
            <h3 class="text-sm font-bold text-navy mb-2">{{ value.title }}</h3>
            <p class="text-xs text-slate leading-relaxed">{{ value.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Digital Services -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="px-4 md:px-12">
        <div class="text-center mb-8">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Digital Presence</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Going Digital</h2>
        </div>
        <p class="text-slate leading-relaxed text-center mb-8">
          The University Student Council is embracing digital tools to improve operations, transparency, and service delivery. The Officer Portal provides authorized officers with modern tools for attendance management and council operations.
        </p>
        <div class="text-center">
          <router-link
            to="/portal"
            class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-navy text-white text-sm font-bold hover:bg-navy-light transition-colors"
          >
            Visit Officer Portal
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>
