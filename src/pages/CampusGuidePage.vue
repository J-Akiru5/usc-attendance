<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useCampusGuide } from '@/composables/useCampusGuide'

const { categories, loading, error, searchQuery, filteredCategories } = useCampusGuide()

const openItems = ref<Set<string>>(new Set())
const categoryRefs = ref<Record<string, HTMLElement | null>>({})

function toggleItem(catId: string, idx: number) {
  const key = `${catId}-${idx}`
  if (openItems.value.has(key)) {
    openItems.value.delete(key)
  } else {
    openItems.value.add(key)
  }
}

function isOpen(catId: string, idx: number) {
  return openItems.value.has(`${catId}-${idx}`)
}

async function scrollToCategory(id: string) {
  searchQuery.value = ''
  await nextTick()
  const el = categoryRefs.value[id]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
}

function getColors(color: string) {
  return colorMap[color] || colorMap.teal
}
</script>

<template>
  <div>
    <!-- ========== HEADER ========== -->
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
      <div class="relative px-4 md:px-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Student Handbook</div>
            <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Campus Guide</h1>
            <p class="text-white/70 max-w-lg leading-relaxed">
              Everything you need to know about ISUFST Dingle Campus — from enrollment to campus life.
            </p>
          </div>
          <!-- Illustration -->
          <div class="hidden lg:flex justify-end">
            <div class="w-56 h-44 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent" />
              <div class="relative z-10 text-center">
                <svg class="w-16 h-16 text-gold/60 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                <div class="text-xs text-white/40 mt-2 font-mono">Quick Reference</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== SEARCH + CATEGORIES ========== -->
    <section class="py-12 md:py-16 bg-paper">
      <div class="px-4 md:px-12">
        <!-- Search Bar -->
        <div class="max-w-2xl mx-auto mb-12">
          <div class="relative">
            <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search the campus guide..."
              class="w-full pl-12 pr-4 py-3.5 rounded-xl border border-line bg-white text-sm text-navy placeholder:text-slate/50 focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-all shadow-sm"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-navy/10 flex items-center justify-center text-navy hover:bg-navy/20 transition-colors"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Category Cards -->
        <div v-if="!searchQuery" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-12">
          <button
            v-for="cat in categories"
            :key="cat.id"
            @click="scrollToCategory(cat.id)"
            class="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-line bg-white hover:shadow-md hover:scale-[1.03] transition-all duration-300 cursor-pointer group"
          >
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110"
              :class="getColors(cat.color).bg"
            >
              {{ cat.icon }}
            </div>
            <span class="text-xs font-semibold text-navy text-center leading-tight">{{ cat.title }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ========== ACCORDION SECTIONS ========== -->
    <section class="pb-16 md:pb-20 bg-paper">
      <div class="px-4 md:px-12">
        <!-- Loading -->
        <div v-if="loading" class="space-y-6">
          <div v-for="n in 3" :key="n" class="space-y-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-navy/5 animate-pulse" />
              <div class="h-5 bg-navy/5 rounded animate-pulse w-48" />
            </div>
            <div class="space-y-2">
              <div
                v-for="m in 3"
                :key="m"
                class="rounded-xl border border-line bg-white p-5"
              >
                <div class="flex items-center justify-between">
                  <div class="h-4 bg-navy/5 rounded animate-pulse w-3/4" />
                  <div class="w-6 h-6 rounded-full bg-navy/5 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="text-center py-12">
          <svg class="w-12 h-12 text-slate/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
          <p class="text-sm text-slate mb-2">{{ error }}</p>
          <button @click="() => window.location.reload()" class="text-xs font-semibold text-navy hover:text-gold-dark transition-colors">
            Retry
          </button>
        </div>

        <!-- No results -->
        <div v-else-if="filteredCategories.length === 0" class="text-center py-12">
          <svg class="w-12 h-12 text-slate/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <p class="text-sm text-slate">No results found for "<span class="font-semibold">{{ searchQuery }}</span>"</p>
          <button @click="searchQuery = ''" class="mt-3 text-sm font-semibold text-navy hover:text-gold-dark transition-colors">
            Clear search
          </button>
        </div>

        <!-- Category sections -->
        <div v-else class="space-y-12">
          <div
            v-for="cat in filteredCategories"
            :key="cat.id"
            :ref="(el) => { categoryRefs[cat.id] = el as HTMLElement }"
          >
            <!-- Category header -->
            <div class="flex items-center gap-3 mb-4">
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                :class="getColors(cat.color).bg"
              >
                {{ cat.icon }}
              </div>
              <h2 class="text-lg font-bold font-serif text-navy">{{ cat.title }}</h2>
            </div>

            <!-- Accordion items -->
            <div class="space-y-2">
              <div
                v-for="(entry, idx) in cat.entries"
                :key="idx"
                class="rounded-xl border border-line bg-white overflow-hidden shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  @click="toggleItem(cat.id, idx)"
                  class="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-navy/[0.02] transition-colors"
                >
                  <span class="text-sm font-semibold text-navy pr-4">{{ entry.question }}</span>
                  <div
                    class="w-6 h-6 rounded-full border border-line flex items-center justify-center shrink-0 transition-all duration-200"
                    :class="isOpen(cat.id, idx) ? 'bg-navy border-navy rotate-180' : 'bg-transparent'"
                  >
                    <svg
                      class="w-3 h-3 transition-colors duration-200"
                      :class="isOpen(cat.id, idx) ? 'text-white' : 'text-slate'"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </button>
                <transition
                  enter-active-class="transition-all duration-300 ease-out"
                  enter-from-class="max-h-0 opacity-0"
                  enter-to-class="max-h-[500px] opacity-100"
                  leave-active-class="transition-all duration-200 ease-in"
                  leave-from-class="max-h-[500px] opacity-100"
                  leave-to-class="max-h-0 opacity-0"
                >
                  <div
                    v-show="isOpen(cat.id, idx)"
                    class="px-5 pb-4 text-sm text-slate leading-relaxed border-t border-line/50 overflow-hidden"
                  >
                    <div class="pt-3 whitespace-pre-line">{{ entry.answer }}</div>
                  </div>
                </transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
