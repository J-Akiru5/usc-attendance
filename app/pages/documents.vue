<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * Public documents & resolutions archive (plan §8.8) — a new route, laid out in
 * the frozen public site's own language. It never touches the pages that are
 * already published: `/api/documents/public` only ever returns filings the
 * council marked public, and search covers the text inside uploaded files.
 */
definePageMeta({ layout: 'public' })

interface DocumentRow {
  id: string
  number: string
  title: string
  summary: string
  year: number
  tags: string[]
  currentVersion: number
  createdAt: string
  updatedAt: string
  type: { id: string, key: string, name: string }
  event: { id: string, title: string, date: string } | null
  _count: { attachments: number }
}

interface DocumentDetail {
  id: string
  number: string
  title: string
  body: string
  year: number
  tags: string[]
  currentVersion: number
  versions: { current: number, filed: number[] }
  attachments: { id: string, fileName: string, mime: string, size: number }[]
  creator: { name: string, position: string } | null
}

const documents = ref<DocumentRow[]>([])
const types = ref<{ id: string, key: string, name: string }[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const query = ref('')
const typeId = ref('')
const year = ref('')

const openId = ref('')
const detail = ref<DocumentDetail | null>(null)
const detailLoading = ref(false)

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (query.value.trim()) params.set('q', query.value.trim())
    if (typeId.value) params.set('typeId', typeId.value)
    if (year.value) params.set('year', year.value)
    params.set('pageSize', '20')
    const res = await fetch(`/api/documents/public?${params.toString()}`)
    if (!res.ok) throw new Error(`The archive could not be loaded (${res.status})`)
    const data = await res.json()
    documents.value = data.documents ?? []
    types.value = data.types ?? types.value
    total.value = data.total ?? 0
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'The archive could not be loaded'
    documents.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function open(id: string) {
  if (openId.value === id) {
    openId.value = ''
    detail.value = null
    return
  }
  openId.value = id
  detail.value = null
  detailLoading.value = true
  try {
    const res = await fetch(`/api/documents/public/${id}`)
    if (!res.ok) throw new Error('That document is not available')
    detail.value = (await res.json()).document
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'That document is not available'
    openId.value = ''
  } finally {
    detailLoading.value = false
  }
}

function clearFilters() {
  query.value = ''
  typeId.value = ''
  year.value = ''
  void load()
}

onMounted(load)
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy relative overflow-hidden">
      <div class="absolute -top-24 right-0 w-96 h-96 rounded-full bg-gold/5 blur-[100px]" />
      <div class="px-6 md:px-12 py-14 relative z-10">
        <div class="text-[10px] font-mono uppercase tracking-[0.3em] text-gold/70">
          University Student Council
        </div>
        <h1 class="text-3xl md:text-4xl font-bold text-white mt-3">
          Documents &amp; Resolutions
        </h1>
        <p class="text-sm md:text-base text-white/60 mt-3 max-w-2xl leading-relaxed">
          The council's public record: resolutions, minutes, memoranda, the constitution and by-laws, and reports.
          Search the archive — including the text inside the uploaded files.
        </p>
      </div>
    </section>

    <!-- Search -->
    <section class="px-6 md:px-12 -mt-6 relative z-20">
      <form class="bg-white rounded-2xl border border-line shadow-lg p-4 md:p-5" @submit.prevent="load">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div class="md:col-span-6">
            <label for="doc-search" class="text-[10px] font-bold text-navy uppercase tracking-wider block mb-1.5">
              Search the archive
            </label>
            <input
              id="doc-search"
              v-model="query"
              type="search"
              placeholder="e.g. coastal cleanup ordinance"
              class="w-full px-3.5 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
            >
          </div>
          <div class="md:col-span-3">
            <label for="doc-type" class="text-[10px] font-bold text-navy uppercase tracking-wider block mb-1.5">
              Type
            </label>
            <select
              id="doc-type"
              v-model="typeId"
              class="w-full px-3.5 py-2 border border-line rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
            >
              <option value="">
                Everything
              </option>
              <option v-for="type in types" :key="type.id" :value="type.id">
                {{ type.name }}
              </option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label for="doc-year" class="text-[10px] font-bold text-navy uppercase tracking-wider block mb-1.5">
              Year
            </label>
            <input
              id="doc-year"
              v-model="year"
              inputmode="numeric"
              placeholder="2026"
              class="w-full px-3.5 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
            >
          </div>
          <div class="md:col-span-1 flex items-end gap-2">
            <button
              type="submit"
              class="w-full px-3 py-2 rounded-lg bg-gold text-navy text-sm font-bold hover:brightness-110 transition-all"
            >
              Find
            </button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 mt-3">
          <span class="text-xs text-slate">
            {{ total }} document{{ total === 1 ? '' : 's' }} in the public archive
          </span>
          <button
            v-if="query || typeId || year"
            type="button"
            class="text-xs font-semibold text-navy hover:underline"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </form>
    </section>

    <!-- Results -->
    <section class="px-6 md:px-12 py-10 flex-1">
      <div v-if="error" class="max-w-4xl mx-auto rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
        {{ error }}
      </div>

      <div v-if="loading" class="text-center text-slate py-12">
        Loading the archive…
      </div>

      <div v-else-if="documents.length === 0" class="max-w-4xl mx-auto text-center py-12">
        <p class="text-slate">
          {{ query ? 'Nothing in the public archive matches that search.' : 'No public documents have been published yet.' }}
        </p>
        <p class="text-xs text-slate mt-2">
          Officers-only filings are not listed here.
        </p>
      </div>

      <ul v-else class="max-w-4xl mx-auto space-y-4">
        <li v-for="doc in documents" :key="doc.id">
          <article class="bg-white rounded-2xl border border-line overflow-hidden">
            <div class="p-5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-semibold text-navy">
                  {{ doc.type?.name ?? 'Document' }}
                </span>
                <span class="font-mono text-xs text-slate">{{ doc.number }}</span>
                <span v-if="doc.currentVersion > 1" class="text-xs text-slate">
                  · revision {{ doc.currentVersion }}
                </span>
                <span v-if="doc._count?.attachments" class="text-xs text-slate">
                  · {{ doc._count.attachments }} file{{ doc._count.attachments === 1 ? '' : 's' }}
                </span>
              </div>

              <h2 class="text-lg font-bold text-navy mt-2">
                {{ doc.title }}
              </h2>
              <p class="text-sm text-slate mt-1.5 leading-relaxed">
                {{ doc.summary }}
              </p>

              <div class="flex flex-wrap items-center gap-2 mt-3">
                <span
                  v-for="tag in doc.tags"
                  :key="tag"
                  class="inline-flex items-center rounded-full bg-paper px-2 py-0.5 text-[11px] text-slate border border-line"
                >
                  {{ tag }}
                </span>
                <span v-if="doc.event" class="text-xs text-slate">
                  · filed against {{ doc.event.title }}
                </span>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-line">
                <span class="text-xs text-slate">
                  Filed {{ formatDate(doc.createdAt) }}<span v-if="doc.updatedAt !== doc.createdAt"> · last revised {{ formatDate(doc.updatedAt) }}</span>
                </span>
                <button
                  type="button"
                  class="text-xs font-bold text-navy hover:underline"
                  @click="open(doc.id)"
                >
                  {{ openId === doc.id ? 'Close' : 'Read' }}
                </button>
              </div>
            </div>

            <!-- Full text -->
            <div v-if="openId === doc.id" class="border-t border-line bg-paper px-5 py-5">
              <div v-if="detailLoading" class="text-sm text-slate">
                Loading…
              </div>
              <template v-else-if="detail">
                <p v-if="!detail.body" class="text-sm text-slate italic">
                  The text of this filing is in the attached file.
                </p>
                <p v-else class="text-sm text-ink whitespace-pre-wrap leading-relaxed">
                  {{ detail.body }}
                </p>

                <div v-if="detail.attachments.length" class="mt-4 space-y-1.5">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-navy">
                    Attached files
                  </div>
                  <a
                    v-for="file in detail.attachments"
                    :key="file.id"
                    :href="`/api/documents/${detail.id}/attachments/${file.id}`"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy hover:border-gold"
                  >
                    <span class="truncate">{{ file.fileName }}</span>
                    <span class="text-xs text-slate shrink-0">{{ formatSize(file.size) }}</span>
                  </a>
                </div>

                <p v-if="detail.creator" class="text-xs text-slate mt-4">
                  Filed by {{ detail.creator.name }}<span v-if="detail.creator.position">, {{ detail.creator.position }}</span>.
                </p>
              </template>
            </div>
          </article>
        </li>
      </ul>
    </section>
  </div>
</template>
