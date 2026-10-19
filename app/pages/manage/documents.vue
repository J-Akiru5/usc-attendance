<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { formatManila } from '@/lib/manila'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

/**
 * Documents & resolutions archive, staff side (plan §8.8): file a document, let
 * the system number it, publish it or keep it for officers, attach the paper
 * itself, read and extend its version history.
 */
definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

interface DocumentTypeRow {
  id: string
  key: string
  name: string
  prefix: string
  pad: number
  archived: boolean
  sequences: { year: number, last: number }[]
  _count: { documents: number }
}

interface DocumentRow {
  id: string
  number: string
  title: string
  summary: string
  year: number
  tags: string[]
  visibility: 'public' | 'officers'
  currentVersion: number
  archived: boolean
  eventId: string | null
  financeRef: string | null
  createdAt: string
  updatedAt: string
  type: { id: string, key: string, name: string }
  creator: { id: string, name: string } | null
  event: { id: string, title: string, date: string } | null
  _count: { versions: number, attachments: number }
}

interface AttachmentRow {
  id: string
  versionId: string | null
  fileName: string
  mime: string
  size: number
  hasText: boolean
  createdAt: string
  creator: { id: string, name: string } | null
}

interface VersionRow {
  id: string
  version: number
  title: string
  changeNote: string | null
  visibility: string
  createdAt: string
  creator: { id: string, name: string } | null
  _count: { attachments: number }
}

interface DocumentDetail {
  id: string
  number: string
  title: string
  body: string
  tags: string[]
  visibility: 'public' | 'officers'
  currentVersion: number
  archived: boolean
  eventId: string | null
  financeRef: string | null
  createdAt: string
  updatedAt: string
  type: DocumentTypeRow
  creator: { id: string, name: string, position: string } | null
  event: { id: string, title: string } | null
  versions: VersionRow[]
  attachments: AttachmentRow[]
}

interface EventOption { id: string, title: string, date: string }

const types = ref<DocumentTypeRow[]>([])
const documents = ref<DocumentRow[]>([])
const events = ref<EventOption[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref(false)

// Browsing
const q = ref('')
const typeId = ref('')
const scope = ref<'all' | 'public' | 'officers'>('all')
const archived = ref<'active' | 'archived' | 'all'>('active')
const ranked = ref(false)

// Filing a new document
const form = ref({
  typeId: '',
  year: manilaYear(),
  title: '',
  body: '',
  tags: '',
  visibility: 'officers' as 'public' | 'officers',
  eventId: '',
  financeRef: ''
})

// The open document
const openId = ref('')
const detail = ref<DocumentDetail | null>(null)
const detailLoading = ref(false)
const newVersion = ref({ title: '', body: '', tags: '', visibility: 'officers' as 'public' | 'officers', changeNote: '' })
const links = ref({ eventId: '', financeRef: '' })
const fileInput = ref<HTMLInputElement | null>(null)
const oldVersion = ref<{ version: number, title: string, body: string, tags: string[], visibility: string, changeNote: string | null, createdAt: string, creator: { name: string } | null } | null>(null)

const currentSequence = computed(() => {
  const type = types.value.find(t => t.id === form.value.typeId)
  if (!type) return null
  return type.sequences.find(s => s.year === Number(form.value.year))?.last ?? 0
})

const nextNumber = computed(() => {
  const type = types.value.find(t => t.id === form.value.typeId)
  if (!type) return ''
  const sequence = (currentSequence.value ?? 0) + 1
  return `${type.prefix} ${form.value.year}-${String(sequence).padStart(type.pad, '0')}`
})

/** The filing year a new document defaults to — the year it is here, not UTC's. */
function manilaYear(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date())
}

const formatDateTime = formatManila

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function loadTypes() {
  const data = await api.get<{ types: DocumentTypeRow[] }>('/documents/types')
  types.value = data.types ?? []
  if (!form.value.typeId && types.value.length > 0) {
    form.value.typeId = types.value.find(t => t.key === 'resolution')?.id ?? types.value[0]!.id
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (q.value.trim()) params.set('q', q.value.trim())
    if (typeId.value) params.set('typeId', typeId.value)
    if (scope.value !== 'all') params.set('scope', scope.value)
    if (archived.value !== 'active') params.set('archived', archived.value)
    params.set('pageSize', '25')
    const data = await api.get<{ documents: DocumentRow[], total: number, ranked: boolean }>(`/documents?${params.toString()}`)
    documents.value = data.documents ?? []
    total.value = data.total
    ranked.value = data.ranked
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the archive'
  } finally {
    loading.value = false
  }
}

async function loadEvents() {
  try {
    const data = await api.get<EventOption[]>('/events')
    events.value = (data ?? []).slice(0, 200)
  } catch {
    // Without the event list the link picker stays empty; filing still works.
  }
}

async function fileDocument() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await api.post<{ document: DocumentRow }>('/documents', {
      typeId: form.value.typeId,
      year: form.value.year,
      title: form.value.title,
      body: form.value.body,
      tags: form.value.tags,
      visibility: form.value.visibility,
      eventId: form.value.eventId || undefined,
      financeRef: form.value.financeRef || undefined
    })
    notice.value = `Filed as ${data.document.number}. Add the file itself below.`
    form.value.title = ''
    form.value.body = ''
    form.value.tags = ''
    form.value.eventId = ''
    form.value.financeRef = ''
    await Promise.all([load(), loadTypes()])
    await open(data.document.id)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not file the document'
  } finally {
    busy.value = false
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
  oldVersion.value = null
  detailLoading.value = true
  try {
    const data = await api.get<{ document: DocumentDetail }>(`/documents/${id}`)
    detail.value = data.document
    newVersion.value = {
      title: data.document.title,
      body: data.document.body,
      tags: data.document.tags.join(', '),
      visibility: data.document.visibility,
      changeNote: ''
    }
    links.value = { eventId: data.document.eventId ?? '', financeRef: data.document.financeRef ?? '' }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not open the document'
    openId.value = ''
  } finally {
    detailLoading.value = false
  }
}

async function saveVersion() {
  if (!detail.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await api.post<{ version: { version: number }, document: { currentVersion: number } }>(
      `/documents/${detail.value.id}/versions`,
      {
        title: newVersion.value.title,
        body: newVersion.value.body,
        tags: newVersion.value.tags,
        visibility: newVersion.value.visibility,
        changeNote: newVersion.value.changeNote || undefined
      }
    )
    notice.value = `Version ${data.version.version} filed. Older versions stay readable.`
    const id = detail.value.id
    openId.value = ''
    await Promise.all([load(), open(id)])
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not file the new version'
  } finally {
    busy.value = false
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.readAsDataURL(file)
  })
}

async function uploadAttachment() {
  const file = fileInput.value?.files?.[0]
  if (!file || !detail.value) return
  if (file.size > 4 * 1024 * 1024) {
    error.value = 'Files up to 4 MB can be uploaded from here for now — split larger scans.'
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await api.post<{ attachment: { fileName: string, hasText: boolean } }>(
      `/documents/${detail.value.id}/attachments`,
      { fileName: file.name, mime: file.type || 'text/plain', dataBase64: await fileToBase64(file) }
    )
    notice.value = data.attachment.hasText
      ? `${data.attachment.fileName} attached — its text is now searchable.`
      : `${data.attachment.fileName} attached. It is a scan, so it is listed but adds no searchable text.`
    if (fileInput.value) fileInput.value.value = ''
    const id = detail.value.id
    openId.value = ''
    await Promise.all([load(), open(id)])
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not upload the file'
  } finally {
    busy.value = false
  }
}

async function saveLinks() {
  if (!detail.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.put(`/documents/${detail.value.id}`, {
      eventId: links.value.eventId || null,
      financeRef: links.value.financeRef || null
    })
    notice.value = 'Links saved.'
    const id = detail.value.id
    openId.value = ''
    await open(id)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not save the links'
  } finally {
    busy.value = false
  }
}

async function toggleArchive() {
  if (!detail.value) return
  busy.value = true
  error.value = ''
  try {
    await api.put(`/documents/${detail.value.id}`, { archived: !detail.value.archived })
    notice.value = detail.value.archived ? 'Restored to the active archive.' : 'Archived — the number is kept, nothing is deleted.'
    const id = detail.value.id
    openId.value = ''
    await Promise.all([load(), open(id)])
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not change the archive state'
  } finally {
    busy.value = false
  }
}

async function showVersion(version: number) {
  if (!detail.value) return
  error.value = ''
  try {
    const data = await api.get<{
      version: {
        version: number
        title: string
        body: string
        tags: string[]
        visibility: string
        changeNote: string | null
        createdAt: string
        creator: { name: string } | null
      }
    }>(`/documents/${detail.value.id}/versions/${version}`)
    oldVersion.value = data.version
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not read that version'
  }
}

onMounted(async () => {
  try {
    await loadTypes()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the filing types'
  }
  await Promise.all([load(), loadEvents()])
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        Documents &amp; resolutions
      </h1>
      <p class="text-sm text-slate mt-1">
        Minutes, resolutions, memos, the constitution and reports. Each one is numbered for its type and year, keeps
        every version it ever had, and can be published to the site.
      </p>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <!-- File a document -->
    <Card>
      <CardContent class="p-6 space-y-4">
        <div class="font-semibold text-navy font-serif">
          File a document
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label>Type</Label>
            <select v-model="form.typeId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option v-for="type in types.filter(t => !t.archived)" :key="type.id" :value="type.id">
                {{ type.name }}
              </option>
            </select>
          </div>
          <div class="space-y-2">
            <Label>Year</Label>
            <input
              v-model="form.year"
              inputmode="numeric"
              class="w-full rounded-lg border border-line px-3 py-2 text-sm font-mono"
            >
          </div>
          <div class="space-y-2">
            <Label>Visibility</Label>
            <select v-model="form.visibility" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="officers">
                Officers only
              </option>
              <option value="public">
                Public — shows on /documents
              </option>
            </select>
          </div>
        </div>

        <p class="text-xs text-slate">
          Next number: <span class="font-mono font-semibold text-navy">{{ nextNumber || '—' }}</span>
          <span v-if="currentSequence !== null"> · {{ currentSequence }} filed for this type this year</span>
        </p>

        <div class="space-y-2">
          <Label>Title</Label>
          <Input v-model="form.title" placeholder="Resolution adopting the coastal cleanup programme" />
        </div>

        <div class="space-y-2">
          <Label>Text (optional — the attached file can carry it instead)</Label>
          <textarea
            v-model="form.body"
            rows="4"
            class="w-full rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="WHEREAS, …"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label>Tags (comma separated)</Label>
            <Input v-model="form.tags" placeholder="environment, senate" />
          </div>
          <div class="space-y-2">
            <Label>Linked event (optional)</Label>
            <select v-model="form.eventId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">
                None
              </option>
              <option v-for="event in events" :key="event.id" :value="event.id">
                {{ event.title }}
              </option>
            </select>
          </div>
          <div class="space-y-2">
            <Label>Finance reference (optional)</Label>
            <Input v-model="form.financeRef" placeholder="Budget line or liquidation code" />
          </div>
        </div>

        <Button :disabled="busy || !form.title.trim() || !form.typeId" @click="fileDocument">
          File it
        </Button>
      </CardContent>
    </Card>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="q"
        type="search"
        placeholder="Search title, text, tags and file contents…"
        class="flex-1 min-w-[16rem] rounded-lg border border-line px-3 py-2 text-sm"
        @keyup.enter="load"
      >
      <select v-model="typeId" class="rounded-lg border border-line px-3 py-2 text-sm" @change="load">
        <option value="">
          Every type
        </option>
        <option v-for="type in types" :key="type.id" :value="type.id">
          {{ type.name }}
        </option>
      </select>
      <select v-model="scope" class="rounded-lg border border-line px-3 py-2 text-sm" @change="load">
        <option value="all">
          Every visibility
        </option>
        <option value="public">
          Public
        </option>
        <option value="officers">
          Officers only
        </option>
      </select>
      <select v-model="archived" class="rounded-lg border border-line px-3 py-2 text-sm" @change="load">
        <option value="active">
          Active
        </option>
        <option value="archived">
          Archived
        </option>
        <option value="all">
          Both
        </option>
      </select>
      <Button variant="outline" @click="load">
        Search
      </Button>
    </div>

    <p class="text-xs text-slate">
      {{ total }} document{{ total === 1 ? '' : 's' }}<span v-if="ranked"> · best match first</span>
    </p>

    <!-- The archive -->
    <div v-if="loading" class="text-center text-slate py-8">
      Loading…
    </div>
    <div v-else-if="documents.length === 0" class="text-center text-slate py-8">
      Nothing filed yet.
    </div>
    <Card v-for="row in documents" v-else :key="row.id">
      <CardContent class="p-4 space-y-2">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <Badge :variant="row.visibility === 'public' ? 'success' : 'default'">
                {{ row.visibility }}
              </Badge>
              <Badge v-if="row.archived" variant="warning">
                archived
              </Badge>
              <span class="font-mono text-xs text-slate">{{ row.number }}</span>
              <span class="text-xs text-slate">{{ row.type?.name }}</span>
            </div>
            <div class="font-semibold text-navy mt-1">
              {{ row.title }}
            </div>
            <p class="text-sm text-slate line-clamp-2">
              {{ row.summary }}
            </p>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <span v-for="tag in row.tags" :key="tag" class="text-[11px] text-slate">#{{ tag }}</span>
              <span v-if="row.event" class="text-xs text-slate">· {{ row.event.title }}</span>
              <span v-if="row.financeRef" class="text-xs text-slate">· {{ row.financeRef }}</span>
            </div>
          </div>
          <div class="shrink-0 text-right text-xs text-slate">
            <div>{{ formatDateTime(row.createdAt) }}</div>
            <div>v{{ row.currentVersion }} · {{ row._count.attachments }} file{{ row._count.attachments === 1 ? '' : 's' }}</div>
            <div v-if="row.creator">
              by {{ row.creator.name }}
            </div>
            <button class="mt-1 text-xs font-bold text-navy hover:underline" @click="open(row.id)">
              {{ openId === row.id ? 'Close' : 'Open' }}
            </button>
          </div>
        </div>

        <!-- One document, open -->
        <div v-if="openId === row.id" class="border-t border-line pt-3 space-y-4">
          <div v-if="detailLoading" class="text-sm text-slate">
            Loading…
          </div>
          <template v-else-if="detail">
            <div>
              <div class="text-xs uppercase tracking-wide text-slate mb-1">
                Current version (v{{ detail.currentVersion }})
              </div>
              <p class="text-sm text-ink whitespace-pre-wrap leading-relaxed">
                {{ detail.body || 'The text is in the attached file.' }}
              </p>
              <div class="flex flex-wrap items-center gap-2 mt-2">
                <span v-for="tag in detail.tags" :key="tag" class="text-[11px] text-slate">#{{ tag }}</span>
              </div>
            </div>

            <!-- Attachments -->
            <div class="rounded-lg border border-line bg-paper p-3 space-y-2">
              <div class="text-xs font-semibold text-navy uppercase tracking-wide">
                Attached files
              </div>
              <p v-if="detail.attachments.length === 0" class="text-xs text-slate">
                No file yet. Text files, markdown, CSV and PDFs are read at upload so their words are searchable.
              </p>
              <ul v-else class="space-y-1">
                <li v-for="file in detail.attachments" :key="file.id" class="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <a
                    :href="`/api/documents/${detail.id}/attachments/${file.id}`"
                    target="_blank"
                    rel="noopener"
                    class="text-navy hover:underline truncate"
                  >
                    {{ file.fileName }}
                  </a>
                  <span class="text-xs text-slate">
                    {{ formatSize(file.size) }} · {{ file.hasText ? 'text indexed' : 'no text (scan)' }} · v
                    {{ detail.versions.find(v => v.id === file.versionId)?.version ?? detail.currentVersion }}
                  </span>
                </li>
              </ul>
              <div class="flex flex-wrap items-center gap-2">
                <input
                  ref="fileInput"
                  type="file"
                  accept="application/pdf,text/plain,text/markdown,text/csv,image/png,image/jpeg"
                  class="text-xs"
                >
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="busy"
                  @click="uploadAttachment"
                >
                  Upload file
                </Button>
              </div>
            </div>

            <!-- Links -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">Linked event</Label>
                <select v-model="links.eventId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">
                    None
                  </option>
                  <option v-for="event in events" :key="event.id" :value="event.id">
                    {{ event.title }}
                  </option>
                </select>
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Finance reference</Label>
                <Input v-model="links.financeRef" placeholder="Budget line or liquidation code" />
              </div>
              <div class="flex items-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="busy"
                  @click="saveLinks"
                >
                  Save links
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  :disabled="busy"
                  @click="toggleArchive"
                >
                  {{ detail.archived ? 'Restore' : 'Archive' }}
                </Button>
              </div>
            </div>

            <!-- History -->
            <div class="rounded-lg border border-line p-3 space-y-2">
              <div class="text-xs font-semibold text-navy uppercase tracking-wide">
                Version history — older versions are kept exactly as filed
              </div>
              <ul class="divide-y divide-line text-sm">
                <li v-for="version in detail.versions" :key="version.id" class="py-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span class="font-mono text-xs text-slate">v{{ version.version }}</span>
                    <span class="ml-2">{{ version.title }}</span>
                    <Badge v-if="version.version === detail.currentVersion" class="ml-2" variant="success">
                      current
                    </Badge>
                  </span>
                  <span class="text-xs text-slate">
                    {{ version.creator?.name ?? 'Unknown' }} · {{ formatDateTime(version.createdAt) }}
                    <span v-if="version.changeNote"> · {{ version.changeNote }}</span>
                    <button class="ml-2 font-semibold text-navy hover:underline" @click="showVersion(version.version)">
                      read
                    </button>
                  </span>
                </li>
              </ul>

              <div v-if="oldVersion" class="rounded-lg border border-line bg-paper p-3 space-y-1">
                <div class="text-xs font-semibold text-navy">
                  v{{ oldVersion.version }} · {{ oldVersion.title }}
                  <span class="font-normal text-slate">
                    · {{ oldVersion.creator?.name ?? 'Unknown' }} · {{ formatDateTime(oldVersion.createdAt) }}
                  </span>
                </div>
                <p class="text-sm text-ink whitespace-pre-wrap leading-relaxed">
                  {{ oldVersion.body || '(no text in that version)' }}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <span v-for="tag in oldVersion.tags" :key="tag" class="text-[11px] text-slate">#{{ tag }}</span>
                  <span class="text-[11px] text-slate">· was {{ oldVersion.visibility }}</span>
                </div>
                <button class="text-xs font-semibold text-navy hover:underline" @click="oldVersion = null">
                  Close
                </button>
              </div>
            </div>

            <!-- New version -->
            <div class="rounded-lg border border-line p-3 space-y-2">
              <div class="text-xs font-semibold text-navy uppercase tracking-wide">
                File a new version
              </div>
              <Input v-model="newVersion.title" placeholder="Title" />
              <textarea
                v-model="newVersion.body"
                rows="3"
                class="w-full rounded-lg border border-line px-3 py-2 text-sm"
                placeholder="The text as it should now read"
              />
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input v-model="newVersion.tags" placeholder="tags, comma separated" />
                <select v-model="newVersion.visibility" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="officers">
                    Officers only
                  </option>
                  <option value="public">
                    Public
                  </option>
                </select>
                <Input v-model="newVersion.changeNote" placeholder="What changed (optional)" />
              </div>
              <Button size="sm" :disabled="busy" @click="saveVersion">
                Save as the next version
              </Button>
            </div>
          </template>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
