<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

interface CollegeOption {
  id: string
  code: string
  name: string
  programs?: Array<{ id: string, sections?: SectionOption[] }>
}
interface SectionOption { id: string, name: string, yearLevel: number }
interface Announcement {
  id: string
  title: string
  body: string
  preview: string
  pinned: boolean
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled'
  scheduledFor: string | null
  sentAt: string | null
  reached: number
  audienceType: 'all' | 'college' | 'yearLevel' | 'section'
  audienceCollegeId: string | null
  audienceYearLevel: number | null
  audienceSectionId: string | null
  audienceCollege: { code: string, name: string } | null
  audienceSection: { name: string } | null
  creator: { id: string, name: string } | null
  createdAt: string
}

const items = ref<Announcement[]>([])
const colleges = ref<CollegeOption[]>([])
const sections = ref<SectionOption[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref(false)

interface AudiencePreview {
  eligible: number
  quota: {
    known: boolean
    used: number | null
    limit: number | null
    remaining: number | null
    exceeded: boolean | null
  }
  budget: {
    state: 'fits' | 'over_budget' | 'unknown'
    allowed: boolean
    message: string | null
  }
}

const form = ref({
  title: '',
  body: '',
  pinned: false,
  sendEmail: false,
  audienceType: 'all' as 'all' | 'college' | 'yearLevel' | 'section',
  audienceCollegeId: '',
  audienceYearLevel: '',
  audienceSectionId: '',
  scheduledFor: ''
})

const statusVariants: Record<string, 'default' | 'success' | 'warning'> = {
  draft: 'default',
  scheduled: 'warning',
  sent: 'success',
  cancelled: 'default'
}

const audienceText = (item: Announcement) => {
  if (item.audienceType === 'college') return item.audienceCollege ? `For ${item.audienceCollege.code || item.audienceCollege.name}` : 'For one college'
  if (item.audienceType === 'yearLevel') return `For year ${item.audienceYearLevel ?? '?'}`
  if (item.audienceType === 'section') return item.audienceSection ? `For ${item.audienceSection.name}` : 'For one section'
  return 'Everyone'
}

const preview = computed(() => form.value.body.trim())

const audiencePreview = ref<AudiencePreview | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
let previewRequest = 0

const audienceReady = computed(() => {
  if (form.value.audienceType === 'college') return form.value.audienceCollegeId !== ''
  if (form.value.audienceType === 'yearLevel') return form.value.audienceYearLevel !== ''
  if (form.value.audienceType === 'section') return form.value.audienceSectionId !== ''
  return true
})

/**
 * BC-12: when email is chosen, ask the server who this reaches and what today
 * has left. The reply is a count — never a recipient — and an unreadable quota
 * arrives as `known: false`, which is shown as unknown rather than as zero.
 */
async function loadAudiencePreview() {
  const request = ++previewRequest
  audiencePreview.value = null
  previewError.value = ''
  if (!form.value.sendEmail || !audienceReady.value) {
    previewLoading.value = false
    return
  }

  previewLoading.value = true
  try {
    const params = new URLSearchParams({ audienceType: form.value.audienceType })
    if (form.value.audienceType === 'college') params.set('audienceCollegeId', form.value.audienceCollegeId)
    if (form.value.audienceType === 'yearLevel') params.set('audienceYearLevel', form.value.audienceYearLevel)
    if (form.value.audienceType === 'section') params.set('audienceSectionId', form.value.audienceSectionId)

    const data = await api.get<AudiencePreview>(`/announcements/preview?${params.toString()}`)
    if (request === previewRequest) audiencePreview.value = data
  } catch {
    if (request === previewRequest) previewError.value = 'The audience could not be checked right now, so an email send will be refused.'
  } finally {
    if (request === previewRequest) previewLoading.value = false
  }
}

const audiencePreviewSummary = computed(() => {
  const data = audiencePreview.value
  if (!data) return ''
  const people = `${data.eligible} ${data.eligible === 1 ? 'person' : 'people'}`
  if (!data.quota.known || data.budget.state === 'unknown') {
    return `This reaches ${people} by email, but today's remaining email budget could not be checked. An email send will be refused; you can still send it in the app only.`
  }
  const left = data.quota.remaining ?? 0
  const total = data.quota.limit ?? 0
  if (data.budget.allowed) {
    return `This reaches ${people} by email. ${left} of today's ${total} emails are left.`
  }
  return `This reaches ${people} by email, but only ${left} of today's ${total} emails are left, so an email send will be refused. Send it in the app only, or wait until tomorrow.`
})

watch(
  () => [
    form.value.sendEmail,
    form.value.audienceType,
    form.value.audienceCollegeId,
    form.value.audienceYearLevel,
    form.value.audienceSectionId
  ],
  () => { void loadAudiencePreview() }
)

async function load() {
  loading.value = true
  try {
    const data = await api.get<{ items: Announcement[] }>('/announcements')
    items.value = data.items ?? []
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load announcements'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    title: '',
    body: '',
    pinned: false,
    sendEmail: false,
    audienceType: 'all',
    audienceCollegeId: '',
    audienceYearLevel: '',
    audienceSectionId: '',
    scheduledFor: ''
  }
  audiencePreview.value = null
  previewError.value = ''
}

async function submit(sendNow: boolean) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const body: Record<string, unknown> = {
      title: form.value.title,
      body: form.value.body,
      pinned: form.value.pinned,
      audienceType: form.value.audienceType,
      sendNow
    }
    // D-08: inbox unless the officer opts into email for this send. Scheduled
    // announcements stay in the inbox; email is a "send now" choice (BC-12).
    if (sendNow && form.value.sendEmail) body.sendEmail = true
    if (form.value.audienceType === 'college') body.audienceCollegeId = form.value.audienceCollegeId
    if (form.value.audienceType === 'yearLevel') body.audienceYearLevel = Number(form.value.audienceYearLevel)
    if (form.value.audienceType === 'section') body.audienceSectionId = form.value.audienceSectionId
    if (form.value.scheduledFor) body.scheduledFor = form.value.scheduledFor

    const result = await api.post<{ announcement: Announcement, dispatch?: { sent: number, emails: number, recipients: number } }>('/announcements', body)
    notice.value = result.dispatch
      ? `Sent to ${result.dispatch.recipients} people (${result.dispatch.sent} inbox, ${result.dispatch.emails} by email).`
      : result.announcement.status === 'scheduled' ? 'Scheduled.' : 'Saved as a draft.'
    resetForm()
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not save the announcement'
  } finally {
    busy.value = false
  }
}

async function sendNow(item: Announcement) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await api.post<{ dispatch: { recipients: number, sent: number, emails: number } }>(`/announcements/${item.id}/send`, {})
    notice.value = `Sent "${item.title}" to ${result.dispatch.recipients} people.`
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not send it'
  } finally {
    busy.value = false
  }
}

async function togglePin(item: Announcement) {
  try {
    await api.put(`/announcements/${item.id}`, { pinned: !item.pinned })
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not change the pin'
  }
}

async function remove(item: Announcement) {
  busy.value = true
  try {
    await api.delete(`/announcements/${item.id}`)
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not delete it'
  } finally {
    busy.value = false
  }
}

function formatWhen(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(async () => {
  await load()
  try {
    const academic = await api.get<{ colleges: CollegeOption[] }>('/reference/academic')
    colleges.value = academic.colleges ?? []
    // The reference tree nests sections under each program; flatten them for
    // the audience picker.
    sections.value = (academic.colleges ?? []).flatMap(college =>
      (college.programs ?? []).flatMap(program => program.sections ?? [])
    )
  } catch {
    // The audience pickers stay empty without the reference data.
  }
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        Announcements
      </h1>
      <p class="text-sm text-slate mt-1">
        Write once, choose who hears it, and send now or leave it for its time. It lands in their inbox and, if they
        allow it, their email.
      </p>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <!-- Composer -->
    <Card>
      <CardContent class="p-6 space-y-4">
        <div class="space-y-2">
          <Label>Title</Label>
          <Input v-model="form.title" placeholder="Flag ceremony moved to 7:00 AM" />
        </div>

        <div class="space-y-2">
          <Label>Message</Label>
          <textarea
            v-model="form.body"
            rows="5"
            class="w-full rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="Plain text with **bold**, *italics*, [links](https://…) and - bullet lists."
          />
          <p class="text-xs text-slate">
            Formatting: <span class="font-mono">**bold**</span>, <span class="font-mono">*italic*</span>,
            <span class="font-mono">[text](https://link)</span>, lines beginning with
            <span class="font-mono">-</span> become a list.
          </p>
        </div>

        <div v-if="preview" class="rounded-lg border border-line bg-paper p-3">
          <div class="text-xs uppercase tracking-wide text-slate mb-1">
            Preview
          </div>
          <!-- Rendered server-side with every character escaped: safe to inject. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="text-sm text-navy space-y-2" v-html="preview" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label>Who hears it</Label>
            <select v-model="form.audienceType" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="all">
                All students
              </option>
              <option value="college">
                One college
              </option>
              <option value="yearLevel">
                One year level
              </option>
              <option value="section">
                One section
              </option>
            </select>
          </div>
          <div v-if="form.audienceType === 'college'" class="space-y-2">
            <Label>College</Label>
            <select v-model="form.audienceCollegeId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">
                Pick a college…
              </option>
              <option v-for="c in colleges" :key="c.id" :value="c.id">
                {{ c.code ? `${c.code} · ${c.name}` : c.name }}
              </option>
            </select>
          </div>
          <div v-if="form.audienceType === 'yearLevel'" class="space-y-2">
            <Label>Year level</Label>
            <select v-model="form.audienceYearLevel" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">
                Pick a year…
              </option>
              <option v-for="year in [1, 2, 3, 4, 5, 6]" :key="year" :value="String(year)">
                Year {{ year }}
              </option>
            </select>
          </div>
          <div v-if="form.audienceType === 'section'" class="space-y-2">
            <Label>Section</Label>
            <select v-model="form.audienceSectionId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">
                Pick a section…
              </option>
              <option v-for="s in sections" :key="s.id" :value="s.id">
                {{ s.name }} (Year {{ s.yearLevel }})
              </option>
            </select>
          </div>
          <div class="space-y-2">
            <Label>Send at (optional)</Label>
            <Input v-model="form.scheduledFor" type="datetime-local" />
          </div>
          <label class="flex items-end gap-2 pb-2 text-sm text-slate">
            <input v-model="form.pinned" type="checkbox">
            Pin to the dashboard
          </label>
          <label class="flex items-end gap-2 pb-2 text-sm text-slate">
            <input v-model="form.sendEmail" type="checkbox">
            Also send by email
          </label>
        </div>

        <div
          v-if="form.sendEmail"
          class="rounded-lg border border-line bg-paper p-3 text-sm"
          aria-live="polite"
        >
          <div class="text-xs uppercase tracking-wide text-slate mb-1">
            Email reach
          </div>
          <p v-if="previewLoading" class="text-slate">
            Checking who this reaches…
          </p>
          <p v-else-if="previewError" class="text-danger">
            {{ previewError }}
          </p>
          <p v-else-if="!audienceReady" class="text-slate">
            Pick the college, year or section this goes to.
          </p>
          <template v-else-if="audiencePreview">
            <p :class="audiencePreview.budget.allowed ? 'text-navy' : 'text-danger'">
              {{ audiencePreviewSummary }}
            </p>
            <p v-if="form.scheduledFor" class="text-xs text-slate mt-1">
              A scheduled announcement goes to the inbox only. Email is sent when you choose Send now.
            </p>
          </template>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="default" :disabled="busy" @click="submit(true)">
            Send now
          </Button>
          <Button variant="outline" :disabled="busy" @click="submit(false)">
            {{ form.scheduledFor ? 'Schedule it' : 'Save draft' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- The list -->
    <div v-if="loading" class="text-center text-slate py-8">
      Loading…
    </div>
    <div v-else-if="items.length === 0" class="text-center text-slate py-8">
      Nothing written yet.
    </div>
    <Card v-for="item in items" v-else :key="item.id">
      <CardContent class="p-4 space-y-2">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <Badge :variant="statusVariants[item.status]">
                {{ item.status }}
              </Badge>
              <Badge v-if="item.pinned" variant="warning">
                pinned
              </Badge>
              <span class="text-xs text-slate">{{ audienceText(item) }}</span>
            </div>
            <div class="font-semibold text-navy mt-1">
              {{ item.title }}
            </div>
            <p class="text-sm text-slate line-clamp-2">
              {{ item.body }}
            </p>
          </div>
          <div class="shrink-0 text-right text-xs text-slate">
            <div v-if="item.status === 'sent'">
              Reached <span class="font-mono">{{ item.reached }}</span>
            </div>
            <div v-if="item.sentAt">
              Sent {{ formatWhen(item.sentAt) }}
            </div>
            <div v-else-if="item.scheduledFor">
              Due {{ formatWhen(item.scheduledFor) }}
            </div>
            <div v-else>
              Written {{ formatWhen(item.createdAt) }}
            </div>
            <div v-if="item.creator">
              by {{ item.creator.name }}
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 pt-1">
          <button
            v-if="item.status !== 'sent'"
            class="text-xs font-semibold text-navy hover:underline disabled:opacity-50"
            :disabled="busy"
            @click="sendNow(item)"
          >
            Send now
          </button>
          <button
            v-if="item.status === 'sent'"
            class="text-xs text-navy hover:underline"
            @click="togglePin(item)"
          >
            {{ item.pinned ? 'Unpin' : 'Pin' }}
          </button>
          <button
            v-if="item.status !== 'sent'"
            class="text-xs text-danger hover:underline"
            :disabled="busy"
            @click="remove(item)"
          >
            Delete
          </button>
          <span v-if="item.status === 'sent'" class="text-xs text-slate">
            A sent announcement is a record — it cannot be edited or deleted.
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
