<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin'] })

interface Placement {
  yearLevel: number | null
  contactNumber: string | null
  college: { id: string, code: string, name: string } | null
  programRef: { id: string, code: string, name: string } | null
  section: { id: string, name: string, yearLevel: number } | null
}

interface Student {
  id: string
  name: string
  email: string
  active: boolean
  createdAt: string
  studentProfile: ({ studentNo: string, program: string | null } & Placement) | null
}

interface AcademicSection { id: string, yearLevel: number, name: string }
interface AcademicProgram { id: string, code: string, name: string, yearLevels: number, sections: AcademicSection[] }
interface AcademicCollege { id: string, code: string, name: string, programs: AcademicProgram[] }

const students = ref<Student[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const q = ref('')
const loading = ref(true)
const error = ref('')
const editing = ref<Student | null>(null)
const form = ref({ name: '', studentNo: '', program: '', yearLevel: '', sectionId: '', contactNumber: '' })
const saving = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

// Reference data for the placement picker in the edit dialog.
const colleges = ref<AcademicCollege[]>([])
const collegeId = ref('')
const programId = ref('')

const currentCollege = computed(() => colleges.value.find(c => c.id === collegeId.value) ?? null)
const currentProgram = computed(() => currentCollege.value?.programs.find(p => p.id === programId.value) ?? null)
const yearLevelOptions = computed(() => Array.from({ length: currentProgram.value?.yearLevels ?? 0 }, (_, i) => i + 1))
const sectionsForYear = computed(() =>
  (currentProgram.value?.sections ?? []).filter(s => String(s.yearLevel) === String(form.value.yearLevel))
)

function placementLabel(s: Student): string {
  const p = s.studentProfile
  if (!p) return ''
  const parts = [p.college?.code, p.programRef?.name ?? p.program, p.yearLevel ? `Year ${p.yearLevel}` : null, p.section?.name]
  return parts.filter(Boolean).join(' · ')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get<{ total: number, page: number, pageSize: number, students: Student[] }>(
      `/students?q=${encodeURIComponent(q.value)}&page=${page.value}`
    )
    students.value = res.students
    total.value = res.total
    pageSize.value = res.pageSize
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load students'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const res = await api.get<{ colleges: AcademicCollege[] }>('/reference/academic')
    colleges.value = res.colleges
  } catch {
    // The placement picker degrades gracefully; the rest of the page still works.
  }
})

function onSearch() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
}

function edit(s: Student) {
  editing.value = s
  const p = s.studentProfile
  collegeId.value = p?.college?.id ?? ''
  programId.value = p?.programRef?.id ?? ''
  form.value = {
    name: s.name,
    studentNo: p?.studentNo ?? '',
    program: p?.program ?? '',
    yearLevel: p?.yearLevel ? String(p.yearLevel) : '',
    sectionId: p?.section?.id ?? '',
    contactNumber: p?.contactNumber ?? ''
  }
}

function onCollegeChange() {
  programId.value = ''
  form.value.yearLevel = ''
  form.value.sectionId = ''
}

function onProgramChange() {
  form.value.yearLevel = ''
  form.value.sectionId = ''
}

function onYearChange() {
  form.value.sectionId = ''
}

async function patch(s: Student, body: Record<string, unknown>) {
  saving.value = true
  error.value = ''
  try {
    const updated = await api.patch<Student>(`/students/${s.id}`, body)
    const i = students.value.findIndex(x => x.id === s.id)
    if (i !== -1) students.value[i] = updated
    editing.value = null
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Update failed'
  } finally {
    saving.value = false
  }
}

function save() {
  if (!editing.value) return
  const body: Record<string, unknown> = {
    name: form.value.name,
    studentNo: form.value.studentNo,
    program: form.value.program,
    contactNumber: form.value.contactNumber
  }
  const placementTouched = collegeId.value || programId.value || form.value.yearLevel
  if (placementTouched) {
    if (!(collegeId.value && programId.value && form.value.yearLevel)) {
      error.value = 'Choose the college, program and year level together'
      return
    }
    body.yearLevel = Number(form.value.yearLevel)
    body.sectionId = form.value.sectionId || null
  } else if (editing.value.studentProfile?.college) {
    // Clearing the picker removes the placement but keeps the free-text program.
    body.yearLevel = null
    body.sectionId = null
  }
  patch(editing.value, body)
}

function toggleActive(s: Student) {
  const verb = s.active ? 'Deactivate' : 'Reactivate'
  if (confirm(`${verb} ${s.name}?`)) patch(s, { active: !s.active })
}

const pages = () => Math.max(1, Math.ceil(total.value / pageSize.value))
const input = 'w-full rounded-lg border border-line px-3 py-2 text-sm'
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        Students
      </h1>
      <p class="text-sm text-slate">
        Correct a name or student ID, or deactivate an account. Students cannot edit these themselves.
      </p>
    </div>

    <input
      v-model="q"
      :class="input"
      placeholder="Search name, email or student ID…"
      @input="onSearch"
    >

    <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="loading" class="text-center text-slate py-10">
      Loading…
    </div>
    <div v-else-if="students.length === 0" class="text-center text-slate py-10">
      No students found.
    </div>

    <div v-else class="space-y-2">
      <Card v-for="s in students" :key="s.id">
        <CardContent class="p-4 flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-navy truncate">{{ s.name }}</span>
              <Badge :variant="s.active ? 'success' : 'warning'">
                {{ s.active ? 'Active' : 'Deactivated' }}
              </Badge>
            </div>
            <div class="text-xs text-slate mt-0.5">
              {{ s.studentProfile?.studentNo }}<span v-if="s.studentProfile?.program"> · {{ s.studentProfile.program }}</span>
            </div>
            <div v-if="placementLabel(s)" class="text-xs text-slate/80 mt-0.5">
              {{ placementLabel(s) }}
            </div>
            <div class="text-xs text-slate/60 truncate">
              {{ s.email }}
            </div>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" @click="edit(s)">
              Edit
            </Button>
            <Button variant="outline" @click="toggleActive(s)">
              {{ s.active ? 'Deactivate' : 'Reactivate' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div class="flex items-center justify-between text-xs text-slate pt-2">
        <span>{{ total }} student(s)</span>
        <span class="flex items-center gap-2">
          <Button variant="outline" :disabled="page <= 1" @click="page--; load()">Prev</Button>
          Page {{ page }} / {{ pages() }}
          <Button variant="outline" :disabled="page >= pages()" @click="page++; load()">Next</Button>
        </span>
      </div>
    </div>

    <div
      v-if="editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form class="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3 shadow-xl" @submit.prevent="save">
        <h2 class="text-lg font-bold text-navy font-serif">
          Edit student
        </h2>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Full name
          <input v-model="form.name" :class="input" class="mt-1 font-normal normal-case tracking-normal">
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Student ID
          <input v-model="form.studentNo" :class="input" class="mt-1 font-normal normal-case tracking-normal">
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Program
          <input v-model="form.program" :class="input" class="mt-1 font-normal normal-case tracking-normal">
        </label>

        <div class="grid grid-cols-2 gap-2">
          <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">College
            <select
              v-model="collegeId"
              :class="input"
              class="mt-1 font-normal normal-case tracking-normal"
              @change="onCollegeChange"
            >
              <option value="">Not set</option>
              <option v-for="c in colleges" :key="c.id" :value="c.id">{{ c.code }}</option>
            </select>
          </label>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Program (list)
            <select
              v-model="programId"
              :class="input"
              class="mt-1 font-normal normal-case tracking-normal"
              :disabled="!currentCollege"
              @change="onProgramChange"
            >
              <option value="">Not set</option>
              <option v-for="p in currentCollege?.programs ?? []" :key="p.id" :value="p.id">{{ p.code }}</option>
            </select>
          </label>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Year level
            <select
              v-model="form.yearLevel"
              :class="input"
              class="mt-1 font-normal normal-case tracking-normal"
              :disabled="!currentProgram"
              @change="onYearChange"
            >
              <option value="">Not set</option>
              <option v-for="y in yearLevelOptions" :key="y" :value="String(y)">{{ y }}</option>
            </select>
          </label>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Section
            <select
              v-model="form.sectionId"
              :class="input"
              class="mt-1 font-normal normal-case tracking-normal"
              :disabled="!form.yearLevel || sectionsForYear.length === 0"
            >
              <option value="">{{ sectionsForYear.length ? 'Not set' : 'None listed' }}</option>
              <option v-for="sec in sectionsForYear" :key="sec.id" :value="sec.id">{{ sec.name }}</option>
            </select>
          </label>
        </div>

        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Contact number
          <input
            v-model="form.contactNumber"
            :class="input"
            class="mt-1 font-normal normal-case tracking-normal"
            placeholder="0917 …"
          >
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" @click="editing = null">
            Cancel
          </Button>
          <Button type="submit" variant="gold" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>
