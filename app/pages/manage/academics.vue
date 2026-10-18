<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Badge from '@/components/ui/Badge.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff', 'client'] })

interface Section { id: string, yearLevel: number, name: string }
interface Program { id: string, code: string, name: string, yearLevels: number, sections: Section[] }
interface College { id: string, code: string, name: string, programs: Program[] }

const colleges = ref<College[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref(false)

const selectedCollegeId = ref('')
const selectedProgramId = ref('')

const selectedCollege = computed(() => colleges.value.find(c => c.id === selectedCollegeId.value) ?? null)
const selectedProgram = computed(() => selectedCollege.value?.programs.find(p => p.id === selectedProgramId.value) ?? null)

const collegeForm = ref({ code: '', name: '' })
const programForm = ref({ code: '', name: '', yearLevels: '4' })
const sectionForm = ref({ yearLevel: '1', name: '' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get<{ colleges: College[] }>('/reference/academic')
    colleges.value = res.colleges
    if (!colleges.value.some(c => c.id === selectedCollegeId.value)) {
      selectedCollegeId.value = colleges.value[0]?.id ?? ''
      selectedProgramId.value = ''
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the academic reference data'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function run(action: () => Promise<string>) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    notice.value = await action()
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

const addCollege = () => run(async () => {
  await api.post('/reference/colleges', { code: collegeForm.value.code, name: collegeForm.value.name })
  collegeForm.value = { code: '', name: '' }
  return 'College added'
})

const renameCollege = (college: College) => run(async () => {
  const name = window.prompt('New college name', college.name)
  if (!name) return 'No change'
  await api.patch('/reference/colleges', { id: college.id, name })
  return 'College updated'
})

const archiveCollege = (college: College) => run(async () => {
  await api.patch('/reference/colleges', { id: college.id, archived: true })
  return 'College archived'
})

const deleteCollege = (college: College) => run(async () => {
  if (!window.confirm(`Delete ${college.name}? This only works when nothing references it.`)) return 'No change'
  await api.delete('/reference/colleges', { id: college.id })
  return 'College deleted'
})

const addProgram = () => run(async () => {
  if (!selectedCollege.value) return 'Choose a college first'
  await api.post('/reference/programs', {
    collegeId: selectedCollege.value.id,
    code: programForm.value.code,
    name: programForm.value.name,
    yearLevels: Number(programForm.value.yearLevels) || 4
  })
  programForm.value = { code: '', name: '', yearLevels: '4' }
  return 'Program added'
})

const editProgram = (program: Program) => run(async () => {
  const name = window.prompt('New program name', program.name)
  if (!name) return 'No change'
  const levels = window.prompt('Year levels (1-6)', String(program.yearLevels))
  if (!levels) return 'No change'
  await api.patch('/reference/programs', { id: program.id, name, yearLevels: Number(levels) })
  return 'Program updated'
})

const archiveProgram = (program: Program) => run(async () => {
  await api.patch('/reference/programs', { id: program.id, archived: true })
  return 'Program archived'
})

const deleteProgram = (program: Program) => run(async () => {
  if (!window.confirm(`Delete ${program.name}? This only works when no students or sections reference it.`)) return 'No change'
  await api.delete('/reference/programs', { id: program.id })
  return 'Program deleted'
})

const addSection = () => run(async () => {
  if (!selectedProgram.value) return 'Choose a program first'
  await api.post('/reference/sections', {
    programId: selectedProgram.value.id,
    yearLevel: Number(sectionForm.value.yearLevel) || 1,
    name: sectionForm.value.name
  })
  sectionForm.value = { yearLevel: sectionForm.value.yearLevel, name: '' }
  return 'Section added'
})

const archiveSection = (section: Section) => run(async () => {
  await api.patch('/reference/sections', { id: section.id, archived: true })
  return 'Section archived'
})

const deleteSection = (section: Section) => run(async () => {
  if (!window.confirm(`Delete section ${section.name}? This only works when no students reference it.`)) return 'No change'
  await api.delete('/reference/sections', { id: section.id })
  return 'Section deleted'
})

const field = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold font-serif text-navy">
        Academic Reference Data
      </h1>
      <p class="text-sm text-slate mt-1">
        Colleges, programs and sections used by registration and every filter. Renaming updates everywhere; rows that
        are still referenced can only be archived.
      </p>
    </div>

    <div v-if="error" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" class="rounded-lg border border-success bg-success/10 px-4 py-3 text-sm text-success">
      {{ notice }}
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Colleges</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <form class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end" @submit.prevent="addCollege">
          <div>
            <Label for="c-code">Code</Label>
            <Input
              id="c-code"
              v-model="collegeForm.code"
              :disabled="busy"
              placeholder="CICI"
            />
          </div>
          <div>
            <Label for="c-name">Name</Label>
            <Input
              id="c-name"
              v-model="collegeForm.name"
              :disabled="busy"
              placeholder="College of …"
            />
          </div>
          <Button type="submit" variant="gold" :disabled="busy">
            Add college
          </Button>
        </form>

        <div v-if="loading" class="text-sm text-slate">
          Loading…
        </div>
        <ul v-else class="divide-y divide-line">
          <li v-for="college in colleges" :key="college.id" class="py-3 flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-navy">
                {{ college.code }} — {{ college.name }}
              </div>
              <div class="text-xs text-slate">
                {{ college.programs.length }} program{{ college.programs.length === 1 ? '' : 's' }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="renameCollege(college)"
              >
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="archiveCollege(college)"
              >
                Archive
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="deleteCollege(college)"
              >
                Delete
              </Button>
            </div>
          </li>
          <li v-if="colleges.length === 0" class="py-3 text-sm text-slate">
            No colleges yet.
          </li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Programs &amp; sections</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label for="college-pick">College</Label>
            <select
              id="college-pick"
              v-model="selectedCollegeId"
              :class="field"
              :disabled="busy"
              @change="selectedProgramId = ''"
            >
              <option value="">
                Choose a college
              </option>
              <option v-for="c in colleges" :key="c.id" :value="c.id">
                {{ c.code }} — {{ c.name }}
              </option>
            </select>
          </div>
          <div>
            <Label for="program-pick">Program</Label>
            <select
              id="program-pick"
              v-model="selectedProgramId"
              :class="field"
              :disabled="busy || !selectedCollege"
            >
              <option value="">
                Choose a program
              </option>
              <option v-for="p in selectedCollege?.programs ?? []" :key="p.id" :value="p.id">
                {{ p.code }} — {{ p.name }}
              </option>
            </select>
          </div>
        </div>

        <form
          v-if="selectedCollege"
          class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          @submit.prevent="addProgram"
        >
          <div>
            <Label for="p-code">Program code</Label>
            <Input
              id="p-code"
              v-model="programForm.code"
              :disabled="busy"
              placeholder="BSIT"
            />
          </div>
          <div class="sm:col-span-2">
            <Label for="p-name">Program name</Label>
            <Input
              id="p-name"
              v-model="programForm.name"
              :disabled="busy"
              placeholder="BS Information Technology"
            />
          </div>
          <div class="flex gap-3 items-end">
            <div class="w-20">
              <Label for="p-years">Years</Label>
              <Input
                id="p-years"
                v-model="programForm.yearLevels"
                :disabled="busy"
                placeholder="4"
              />
            </div>
            <Button type="submit" variant="gold" :disabled="busy">
              Add
            </Button>
          </div>
        </form>

        <ul v-if="selectedCollege" class="divide-y divide-line">
          <li v-for="program in selectedCollege.programs" :key="program.id" class="py-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-navy">
                  {{ program.code }} — {{ program.name }}
                </div>
                <div class="text-xs text-slate">
                  {{ program.yearLevels }} year levels · {{ program.sections.length }} sections
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  @click="editProgram(program)"
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  @click="archiveProgram(program)"
                >
                  Archive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  @click="deleteProgram(program)"
                >
                  Delete
                </Button>
              </div>
            </div>

            <div v-if="selectedProgramId === program.id" class="mt-3 pl-4 border-l border-line space-y-3">
              <form class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end" @submit.prevent="addSection">
                <div class="w-24">
                  <Label for="s-year">Year</Label>
                  <Input
                    id="s-year"
                    v-model="sectionForm.yearLevel"
                    :disabled="busy"
                    placeholder="1"
                  />
                </div>
                <div class="sm:col-span-2">
                  <Label for="s-name">Section name</Label>
                  <Input
                    id="s-name"
                    v-model="sectionForm.name"
                    :disabled="busy"
                    placeholder="A"
                  />
                </div>
                <Button type="submit" variant="gold" :disabled="busy">
                  Add section
                </Button>
              </form>

              <ul class="space-y-1">
                <li
                  v-for="section in program.sections.filter(s => s.yearLevel).slice().sort((a, b) => a.yearLevel - b.yearLevel || a.name.localeCompare(b.name))"
                  :key="section.id"
                  class="flex items-center justify-between gap-3 text-sm"
                >
                  <span class="text-navy">
                    <Badge variant="default">Year {{ section.yearLevel }}</Badge>
                    <span class="ml-2">{{ section.name }}</span>
                  </span>
                  <span class="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      :disabled="busy"
                      @click="archiveSection(section)"
                    >Archive</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      :disabled="busy"
                      @click="deleteSection(section)"
                    >Delete</Button>
                  </span>
                </li>
                <li v-if="program.sections.length === 0" class="text-xs text-slate">
                  No sections yet.
                </li>
              </ul>
            </div>
          </li>
          <li v-if="selectedCollege.programs.length === 0" class="py-3 text-sm text-slate">
            No programs yet.
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
