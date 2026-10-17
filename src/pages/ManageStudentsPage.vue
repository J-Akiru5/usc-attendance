<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'

interface Student {
  id: string
  name: string
  email: string
  active: boolean
  createdAt: string
  studentProfile: { studentNo: string; program: string | null } | null
}

const students = ref<Student[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const q = ref('')
const loading = ref(true)
const error = ref('')
const editing = ref<Student | null>(null)
const form = ref({ name: '', studentNo: '', program: '' })
const saving = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get<{ total: number; page: number; pageSize: number; students: Student[] }>(
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

onMounted(load)

function onSearch() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
}

function edit(s: Student) {
  editing.value = s
  form.value = { name: s.name, studentNo: s.studentProfile?.studentNo ?? '', program: s.studentProfile?.program ?? '' }
}

async function patch(s: Student, body: Record<string, unknown>) {
  saving.value = true
  error.value = ''
  try {
    const updated = await api.patch<Student>(`/students/${s.id}`, body)
    const i = students.value.findIndex((x) => x.id === s.id)
    if (i !== -1) students.value[i] = updated
    editing.value = null
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Update failed'
  } finally {
    saving.value = false
  }
}

function save() {
  if (editing.value) patch(editing.value, { ...form.value })
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
      <h1 class="text-2xl font-bold text-navy font-serif">Students</h1>
      <p class="text-sm text-slate">Correct a name or student ID, or deactivate an account. Students cannot edit these themselves.</p>
    </div>

    <input v-model="q" :class="input" placeholder="Search name, email or student ID…" @input="onSearch" />

    <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</div>
    <div v-if="loading" class="text-center text-slate py-10">Loading…</div>
    <div v-else-if="students.length === 0" class="text-center text-slate py-10">No students found.</div>

    <div v-else class="space-y-2">
      <Card v-for="s in students" :key="s.id">
        <CardContent class="p-4 flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-navy truncate">{{ s.name }}</span>
              <Badge :variant="s.active ? 'success' : 'warning'">{{ s.active ? 'Active' : 'Deactivated' }}</Badge>
            </div>
            <div class="text-xs text-slate mt-0.5">
              {{ s.studentProfile?.studentNo }}<span v-if="s.studentProfile?.program"> · {{ s.studentProfile.program }}</span>
            </div>
            <div class="text-xs text-slate/60 truncate">{{ s.email }}</div>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" @click="edit(s)">Edit</Button>
            <Button variant="outline" @click="toggleActive(s)">{{ s.active ? 'Deactivate' : 'Reactivate' }}</Button>
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

    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <form class="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3 shadow-xl" @submit.prevent="save">
        <h2 class="text-lg font-bold text-navy font-serif">Edit student</h2>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Full name
          <input v-model="form.name" :class="input" class="mt-1 font-normal normal-case tracking-normal" />
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Student ID
          <input v-model="form.studentNo" :class="input" class="mt-1 font-normal normal-case tracking-normal" />
        </label>
        <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Program
          <input v-model="form.program" :class="input" class="mt-1 font-normal normal-case tracking-normal" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" @click="editing = null">Cancel</Button>
          <Button type="submit" variant="gold" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</Button>
        </div>
      </form>
    </div>
  </div>
</template>
