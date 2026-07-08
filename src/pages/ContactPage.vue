<script setup lang="ts">
const contacts = [
  { label: 'Organization', value: 'University Student Council', sub: 'ISUFST Dingle Campus' },
  { label: 'Email', value: 'usc@isufst.edu.ph', href: 'mailto:usc@isufst.edu.ph' },
  { label: 'Campus', value: 'ISUFST Dingle Campus', sub: 'Dingle, Iloilo, Philippines' },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20">
      <div class="max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-soft mb-3">Contact</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Get in touch</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          For questions about the system, account issues, or general inquiries, reach out to the University Student Council.
        </p>
      </div>
    </section>

    <!-- Contact Info -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-2xl mx-auto px-4 md:px-6">
        <div class="rounded-2xl border border-line bg-paper-panel p-8 md:p-10 shadow-sm">
          <div class="space-y-8">
            <div
              v-for="c in contacts"
              :key="c.label"
            >
              <div class="text-xs font-mono uppercase tracking-wider text-slate mb-2">{{ c.label }}</div>
              <a
                v-if="c.href"
                :href="c.href"
                class="text-lg font-semibold text-navy hover:text-gold-dark transition-colors"
              >
                {{ c.value }}
              </a>
              <div v-else>
                <div class="text-lg font-semibold text-navy">{{ c.value }}</div>
                <div v-if="c.sub" class="text-sm text-slate mt-0.5">{{ c.sub }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-8 text-center">
          <p class="text-sm text-slate">
            For technical support, contact
            <span class="font-semibold text-navy">Syntaxure Labs</span>
            through the USC technical committee.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
