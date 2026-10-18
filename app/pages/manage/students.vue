<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { useDataTable, type DataTableColumn } from '@/composables/useDataTable'
import DataTable from '@/components/DataTable.vue'
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

const columns: DataTableColumn[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'studentNo', label: 'Student ID' },
  { key: 'college', label: 'College' },
  { key: 'program', label: 'Program' },
  { key: 'yearLevel', label: 'Year', sortable: true },
  { key: 'section', label: 'Section' },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'active', label: 'Status' },
  { key: 'actions', label: '', hideable: false }
]

async function fetchStudents(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  const res = await api.get<{ total: number, page: number, pageSize: number, students: Student[] }>(
    `/students?${params.toString()}`
  )
  return { rows: res.students, total: res.total, page: res.page, pageSize: res.pageSize }
}

const table = useDataTable<Student>({
  resource: 'students',
  columns,
  filters: ['collegeId', 'programId', 'yearLevel', 'sectionId', 'active'],
  fetcher: fetchStudents
})

const editing = ref<Student | null>(null)
const form = ref({ name: '', studentNo: '', program: '', yearLevel: '', sectionId: '', contactNumber: '' })
const saving = ref(false)
const error = ref('')

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

onMounted(async () => {
  try {
    const res = await api.get<{ colleges: AcademicCollege[] }>('/reference/academic')
    colleges.value = res.colleges
  } catch {
    // The placement picker degrades gracefully; the table still works.
  }
})

function edit(s: Student) {
  editing.value = s
  const p = s.studentProfile
  collegeId.value = p?.college?.id ?? ''
  programId.value = p?.programRef?.id ?? ''
  error.value = ''
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
    await api.patch<Student>(`/students/${s.id}`, body)
    editing.value = null
    await table.refresh()
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
    body.yearLevel = null
    body.sectionId = null
  }
  patch(editing.value, body)
}

function toggleActive(s: Student) {
  const verb = s.active ? 'Deactivate' : 'Reactivate'
  if (confirm(`${verb} ${s.name}?`)) patch(s, { active: !s.active })
}

function rowValue(row: unknown, key: string): string {
  const student = row as Student
  const p = student.studentProfile
  switch (key) {
    case 'studentNo': return p?.studentNo ?? '—'
    case 'college': return p?.college?.code ?? '—'
    case 'program': return p?.programRef?.name ?? p?.program ?? '—'
    case 'yearLevel': return p?.yearLevel ? `Year ${p.yearLevel}` : '—'
    case 'section': return p?.section?.name ?? '—'
    default: return String((row as Record<string, unknown>)[key] ?? '—')
  }
}

/** Slot helper: templates get `unknown` rows, this narrows them once. */
function studentOf(row: unknown): Student {
  return row as Student
}

function isActive(row: unknown): boolean {
  return (row as Student).active === true
}

async function exportCsv() {
  const count = await table.exportCsv('students', (student) => {
    return {
      name: student.name,
      studentNo: student.studentProfile?.studentNo ?? '',
      college: student.studentProfile?.college?.code ?? '',
      program: student.studentProfile?.programRef?.name ?? student.studentProfile?.program ?? '',
      yearLevel: student.studentProfile?.yearLevel ?? '',
      section: student.studentProfile?.section?.name ?? '',
      email: student.email,
      active: student.active ? 'Active' : 'Deactivated'
    }
  })
  if (count === 0) error.value = 'Nothing to export with the current filters'
}

function saveView(name: string) {
  table.saveView(name).catch((err: unknown) => {
    error.value = err instanceof Error ? err.message : 'Could not save the view'
  })
}

const filterInput = 'rounded-lg border border-line px-2 py-2 text-sm'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        Students
      </h1>
      <p class="text-sm text-slate">
        Search, filter and export the roster; correct a placement or deactivate an account. Students cannot edit these
        themselves.
      </p>
    </div>

    <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>

    <DataTable
      :columns="columns"
      :rows="table.rows.value"
      :total="table.total.value"
      :loading="table.loading.value"
      :error="table.error.value"
      :page="table.page.value"
      :page-count="table.pageCount.value"
      :page-size="table.pageSize.value"
      :sort="String(table.sort.value)"
      :dir="table.dir.value === 'desc' ? 'desc' : 'asc'"
      :q="String(table.q.value)"
      :visible-columns="table.visibleColumns.value"
      :views="table.views.value"
      :has-filters="table.hasFilters.value"
      @update:q="table.q.value = $event"
      @sort="table.toggleSort"
      @page="table.setPage"
      @toggle-column="table.toggleColumn"
      @clear-filters="table.clearFilters"
      @save-view="saveView"
      @apply-view="table.applyView"
      @update-view="table.updateView"
      @delete-view="table.deleteView"
      @export="exportCsv"
    >
      <template #filters>
        <select
          :value="table.filterValues.collegeId"
          :class="filterInput"
          @change="table.setFilter('collegeId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            All colleges
          </option>
          <option v-for="c in colleges" :key="c.id" :value="c.id">
            {{ c.code }}
          </option>
        </select>
        <select
          :value="table.filterValues.yearLevel"
          :class="filterInput"
          @change="table.setFilter('yearLevel', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            All years
          </option>
          <option v-for="y in [1, 2, 3, 4, 5, 6]" :key="y" :value="String(y)">
            Year {{ y }}
          </option>
        </select>
        <select
          :value="table.filterValues.active"
          :class="filterInput"
          @change="table.setFilter('active', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            All statuses
          </option>
          <option value="true">
            Active
          </option>
          <option value="false">
            Deactivated
          </option>
        </select>
      </template>

      <template #cell-name="{ row }">
        <span class="font-medium text-navy">{{ rowValue(row, 'name') }}</span>
      </template>
      <template #cell-college="{ row }">
        <span class="text-slate">{{ rowValue(row, 'college') }}</span>
      </template>
      <template #cell-program="{ row }">
        <span class="text-slate">{{ rowValue(row, 'program') }}</span>
      </template>
      <template #cell-yearLevel="{ row }">
        <span class="text-slate">{{ rowValue(row, 'yearLevel') }}</span>
      </template>
      <template #cell-section="{ row }">
        <span class="text-slate">{{ rowValue(row, 'section') }}</span>
      </template>
      <template #cell-studentNo="{ row }">
        <span class="font-mono text-xs text-slate">{{ rowValue(row, 'studentNo') }}</span>
      </template>
      <template #cell-email="{ row }">
        <span class="text-slate">{{ rowValue(row, 'email') }}</span>
      </template>
      <template #cell-active="{ row }">
        <Badge :variant="isActive(row) ? 'success' : 'warning'">
          {{ isActive(row) ? 'Active' : 'Deactivated' }}
        </Badge>
      </template>
      <template #cell-actions="{ row }">
        <span class="flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="edit(studentOf(row))">
            Edit
          </Button>
          <Button variant="outline" size="sm" @click="toggleActive(studentOf(row))">
            {{ isActive(row) ? 'Deactivate' : 'Reactivate' }}
          </Button>
        </span>
      </template>
    </DataTable>

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
          <input v-model="form.name" class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal">
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Student ID
          <input v-model="form.studentNo" class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal">
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Program
          <input v-model="form.program" class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal">
        </label>

        <div class="grid grid-cols-2 gap-2">
          <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">College
            <select
              v-model="collegeId"
              class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal"
              @change="onCollegeChange"
            >
              <option value="">Not set</option>
              <option v-for="c in colleges" :key="c.id" :value="c.id">{{ c.code }}</option>
            </select>
          </label>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Program (list)
            <select
              v-model="programId"
              class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal"
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
              class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal"
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
              class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal"
              :disabled="!form.yearLevel || sectionsForYear.length === 0"
            >
              <option value="">{{ sectionsForYear.length ? 'Not set' : 'None listed' }}</option>
              <option v-for="sec in sectionsForYear" :key="sec.id" :value="sec.id">{{ sec.name }}</option>
            </select>
          </label>
        </div>

        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Contact number
          <input v-model="form.contactNumber" class="w-full rounded-lg border border-line px-3 py-2 text-sm mt-1 font-normal normal-case tracking-normal" placeholder="0917 …">
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
