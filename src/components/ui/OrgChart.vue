<script setup lang="ts">
import type { Officer, OversightNode } from '@/data/officers'
import { computed } from 'vue'

const props = defineProps<{
  oversight: OversightNode[]
  officers: Officer[]
}>()

const president = computed(() => props.officers.find(o => o.position === 'President'))
const vicePresident = computed(() => props.officers.find(o => o.position === 'Vice President'))
const senatePresident = computed(() => props.officers.find(o => o.position === 'Senate President'))
const senators = computed(() => props.officers.filter(o => o.role === 'senate'))

const officersUnderVP = computed(() => {
  const order = ['Secretary', 'Auditor', 'Senate President', 'Treasurer', 'Spokesperson']
  return order
    .map(pos => props.officers.find(o => o.position === pos))
    .filter((o): o is Officer => !!o)
})

function getInitials(name?: string) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(p => !p.endsWith('.'))
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getPositionInitials(title: string) {
  if (title === 'Name to confirm') return '?'
  const mappings: Record<string, string> = {
    'SUC President': 'SP',
    'FUSC Adviser': 'FA',
    'FUSC President': 'FP',
    'Campus AD': 'AD',
    'SSC Chair': 'SC',
    'Vice Chair': 'VC',
    'USC Adviser': 'UA',
    'USC Co-Adviser': 'CA',
    'Senate President': 'SP'
  }
  return mappings[title] || title.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="org-chart-wrapper">
    <div class="org-chart-inner">

      <!-- ====== OVERSIGHT SECTION ====== -->

      <!-- Tier 1: SUC President -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('SUC President') }}</div>
          </div>
          <span class="card-name">SUC President</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: branch-down 1→2 -->
      <div class="connector" style="--tl: 50%; --bl: 25%,75%; --bar-l: 25%; --bar-w: 50%">
        <div class="conn-line" style="top:0; left:var(--tl); height:50%"></div>
        <div class="conn-bar" style="top:50%; left:var(--bar-l); width:var(--bar-w)"></div>
        <div class="conn-line" style="top:50%; left:25%; height:50%"></div>
        <div class="conn-line" style="top:50%; left:75%; height:50%"></div>
      </div>

      <!-- Tier 2: FUSC Adviser + Placeholder -->
      <div class="tier-row two-up">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('FUSC Adviser') }}</div>
          </div>
          <span class="card-name">FUSC Adviser</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
        <div class="node-card placeholder-node">
          <div class="card-avatar-wrap">
            <div class="card-avatar">?</div>
          </div>
          <span class="card-name text-danger">Name to confirm</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: branch-merge 2→1 -->
      <div class="connector" style="--tl: 25%,75%; --bl: 50%; --bar-l: 25%; --bar-w: 50%">
        <div class="conn-line" style="top:0; left:25%; height:50%"></div>
        <div class="conn-line" style="top:0; left:75%; height:50%"></div>
        <div class="conn-bar" style="top:50%; left:var(--bar-l); width:var(--bar-w)"></div>
        <div class="conn-line" style="top:50%; left:var(--bl); height:50%"></div>
      </div>

      <!-- Tier 3: FUSC President -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('FUSC President') }}</div>
          </div>
          <span class="card-name">FUSC President</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 4: Campus AD -->
      <div class="tier-row">
        <div class="node-card node-campus-ad">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('Campus AD') }}</div>
          </div>
          <span class="card-name">Campus AD</span>
          <span class="card-badge badge-gold">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 5: SSC Chair -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('SSC Chair') }}</div>
          </div>
          <span class="card-name">SSC Chair</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6: Vice Chair -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('Vice Chair') }}</div>
          </div>
          <span class="card-name">Vice Chair</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6b: USC Adviser -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('USC Adviser') }}</div>
          </div>
          <span class="card-name">USC Adviser</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6c: USC Co-Adviser -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar-wrap">
            <div class="card-avatar">{{ getPositionInitials('USC Co-Adviser') }}</div>
          </div>
          <span class="card-name">USC Co-Adviser</span>
          <span class="card-badge badge-inst">Institutional Oversight</span>
        </div>
      </div>

      <!-- ====== TIER LABEL ====== -->
      <div class="tier-label">
        <span>USC Executive Officers</span>
      </div>

      <!-- ====== EXECUTIVE SECTION ====== -->
      <div class="exec-grid">
        <!-- Row 1: President -->
        <div class="flex justify-center pb-2" style="grid-column: 1 / 6">
          <div class="node-card node-gold node-large">
            <div class="card-avatar-wrap">
              <div class="card-avatar">{{ getInitials(president?.name) }}</div>
            </div>
            <span class="card-name">{{ president?.name }}</span>
            <span class="card-badge badge-gold-dark">{{ president?.position }}</span>
            <div class="card-email" v-if="president?.email">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ president?.email }}
            </div>
          </div>
        </div>

        <!-- Row 2: Connector down to VP -->
        <div class="connector" style="grid-column: 1 / 6">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>

        <!-- Row 3: Vice President -->
        <div class="flex justify-center pb-2" style="grid-column: 1 / 6">
          <div class="node-card node-gold node-large">
            <div class="card-avatar-wrap">
              <div class="card-avatar">{{ getInitials(vicePresident?.name) }}</div>
            </div>
            <span class="card-name">{{ vicePresident?.name }}</span>
            <span class="card-badge badge-gold-dark">{{ vicePresident?.position }}</span>
            <div class="card-email" v-if="vicePresident?.email">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ vicePresident?.email }}
            </div>
          </div>
        </div>

        <!-- Row 4: 1-to-5 Branch-down Connector -->
        <div class="connector" style="grid-column: 1 / 6; --tl: 50%; --bar-l: 10%; --bar-w: 80%">
          <div class="conn-line" style="top:0; left:var(--tl); height:50%"></div>
          <div class="conn-bar" style="top:50%; left:var(--bar-l); width:var(--bar-w)"></div>
          <div class="conn-line" style="top:50%; left:10%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:30%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:50%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:70%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:90%; height:50%"></div>
        </div>

        <!-- Row 5: 5 Officers under VP -->
        <div v-for="officer in officersUnderVP" :key="officer.position" class="flex justify-center">
          <div
            :class="[
              'node-card',
              officer.position === 'Senate President' ? 'node-senate-pres' : 'node-committee'
            ]"
          >
            <div class="card-avatar-wrap">
              <div class="card-avatar">{{ getInitials(officer.name) }}</div>
            </div>
            <span class="card-name">{{ officer.name }}</span>
            <span
              :class="[
                'card-badge',
                officer.position === 'Senate President' ? 'badge-teal' : 'badge-navy'
              ]"
            >
              {{ officer.position }}
            </span>
            <div class="card-email" v-if="officer.email">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ officer.email }}
            </div>
          </div>
        </div>

        <!-- Row 6: Connector below Senate President (col 3) -->
        <div class="connector" style="grid-column: 3 / 4">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>
      </div>

      <!-- Connector line from Senate President down to Senate Label -->
      <div class="connector-to-senate">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- ====== TIER LABEL WITH PASS-THROUGH CONNECTOR ====== -->
      <div class="tier-label senate-tier-label">
        <div class="conn-line" style="top:-30px; bottom:0; left:50%; height:calc(100% + 30px); z-index: 1;"></div>
        <span>Legislative Body &mdash; Student Senate</span>
      </div>

      <!-- ====== SENATORS SECTION ====== -->
      <div class="senators-row-container">
        <div class="senators-row">
          <div
            v-for="senator in senators"
            :key="senator.email ?? senator.position"
            class="senator-node-container"
          >
            <div class="senator-card">
              <div class="senator-avatar-wrap">
                <div class="card-avatar senator-avatar">{{ getInitials(senator.name) }}</div>
              </div>
              <span class="card-name senator-name">{{ senator.name }}</span>
              <span class="card-badge badge-teal-soft">{{ senator.position }}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   WRAPPER & CANVAS
══════════════════════════════════════════ */
.org-chart-wrapper {
  overflow-x: hidden;
  padding-bottom: 3rem;
  width: 100%;
  background: linear-gradient(160deg, #0a1628 0%, #0d1b2a 60%, #0e1f30 100%);
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 2.5rem 1.5rem;
  box-shadow:
    0 0 0 1px rgba(201, 162, 75, 0.08),
    0 32px 80px -16px rgba(0, 0, 0, 0.6);
  position: relative;
}

@media (max-width: 640px) {
  .org-chart-wrapper {
    padding: 1.25rem 0.75rem;
    border-radius: 0.75rem;
  }
}

/* Subtle ambient glow blobs */
.org-chart-wrapper::before {
  content: '';
  position: absolute;
  top: -80px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, rgba(201, 162, 75, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.org-chart-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

/* ══════════════════════════════════════════
   TIER ROWS
══════════════════════════════════════════ */
.tier-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16rem;
  padding: 0.75rem 0;
}

.tier-row.two-up {
  gap: 16rem;
}

/* ══════════════════════════════════════════
   EXECUTIVE GRID
══════════════════════════════════════════ */
.exec-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  width: 100%;
  gap: 0;
}

/* ══════════════════════════════════════════
   CONNECTORS — gold glow style
══════════════════════════════════════════ */
.connector {
  position: relative;
  height: 40px;
  width: 100%;
  flex-shrink: 0;
}

.connector-to-senate {
  position: relative;
  height: 30px;
  width: 100%;
  flex-shrink: 0;
}

.conn-line {
  position: absolute;
  width: 1px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.2);
}

.conn-bar {
  position: absolute;
  height: 1px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.25), rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  transform: translateY(-50%);
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

/* ══════════════════════════════════════════
   BASE NODE CARD
══════════════════════════════════════════ */
.node-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  border-radius: 1rem;
  padding: 1.5rem 1rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  text-align: center;
  white-space: nowrap;
  width: 180px;
  min-height: 220px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s ease;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
}

.node-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(to right, transparent, rgba(201, 162, 75, 0.3), transparent);
  border-radius: 1rem 1rem 0 0;
}

.node-card:hover {
  transform: translateY(-5px) scale(1.01);
  border-color: rgba(201, 162, 75, 0.3);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(201, 162, 75, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* ── Avatar wrapper with glow ring ── */
.card-avatar-wrap {
  position: relative;
  margin-bottom: 0.875rem;
  flex-shrink: 0;
}

.card-avatar-wrap::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid rgba(201, 162, 75, 0.2);
  pointer-events: none;
}

.card-avatar {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: -0.02em;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(201, 162, 75, 0.8);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.node-card:hover .card-avatar {
  transform: scale(1.08);
  box-shadow: 0 0 12px rgba(201, 162, 75, 0.25);
}

/* ── Typography ── */
.card-name {
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.3;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  letter-spacing: -0.01em;
}

/* ── Badge pills ── */
.card-badge {
  display: inline-block;
  margin-top: 0.4rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.badge-inst {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
}

.badge-gold {
  background: rgba(201, 162, 75, 0.12);
  border: 1px solid rgba(201, 162, 75, 0.3);
  color: rgba(228, 205, 142, 0.9);
}

.badge-gold-dark {
  background: rgba(20, 40, 80, 0.35);
  border: 1px solid rgba(20, 40, 80, 0.2);
  color: rgba(20, 40, 80, 0.8);
}

.badge-navy {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.45);
}

.badge-teal {
  background: rgba(45, 188, 168, 0.1);
  border: 1px solid rgba(45, 188, 168, 0.3);
  color: rgba(80, 220, 200, 0.9);
}

.badge-teal-soft {
  background: rgba(45, 188, 168, 0.08);
  border: 1px solid rgba(45, 188, 168, 0.2);
  color: rgba(80, 220, 200, 0.7);
}

/* ── Email chip ── */
.card-email {
  display: none;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.3);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 768px) {
  .card-email { display: inline-flex; }
}

/* ══════════════════════════════════════════
   CARD VARIANTS
══════════════════════════════════════════ */

/* Institutional nodes */
.node-inst {
  border-color: rgba(255, 255, 255, 0.07);
}

.node-inst .card-avatar {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(200, 210, 230, 0.7);
}

/* Campus AD — deep navy highlight */
.node-campus-ad {
  background: linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(14, 28, 60, 0.9));
  border-color: rgba(201, 162, 75, 0.35);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(201, 162, 75, 0.12),
    inset 0 1px 0 rgba(201, 162, 75, 0.1);
}

.node-campus-ad::before {
  background: linear-gradient(to right, transparent, rgba(201, 162, 75, 0.6), transparent);
}

.node-campus-ad .card-avatar {
  background: rgba(201, 162, 75, 0.15);
  border-color: rgba(201, 162, 75, 0.4);
  color: #e4cd8e;
}

.node-campus-ad .card-name {
  color: #ffffff;
}

/* Placeholder */
.placeholder-node {
  border: 1px dashed rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.04);
}

.placeholder-node::before {
  background: linear-gradient(to right, transparent, rgba(239, 68, 68, 0.3), transparent);
}

.placeholder-node .card-avatar {
  background: rgba(239, 68, 68, 0.08);
  border: 1px dashed rgba(239, 68, 68, 0.3);
  color: rgba(239, 68, 68, 0.8);
}

.placeholder-node .card-name {
  color: rgba(239, 68, 68, 0.85);
  font-style: italic;
}

.text-danger { color: rgba(239, 68, 68, 0.85); }

/* Gold executive cards (President / VP) */
.node-gold {
  background: linear-gradient(140deg, #b8882d 0%, #d4a840 30%, #e8c96a 60%, #c9a24b 100%);
  border-color: rgba(201, 162, 75, 0.6);
  box-shadow:
    0 8px 32px rgba(201, 162, 75, 0.2),
    0 0 0 1px rgba(201, 162, 75, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.node-gold::before {
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent);
}

.node-gold:hover {
  box-shadow:
    0 16px 48px rgba(201, 162, 75, 0.35),
    0 0 0 1px rgba(201, 162, 75, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.node-gold .card-avatar-wrap::after {
  border-color: rgba(20, 40, 80, 0.25);
}

.node-gold .card-avatar {
  background: rgba(14, 28, 60, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f0d880;
}

.node-gold .card-name {
  color: #142850;
  font-size: 0.875rem;
}

.node-gold.node-large {
  padding: 1.75rem 1.25rem 1.5rem;
  min-height: 230px;
}

/* Committee head cards */
.node-committee {
  border-color: rgba(100, 140, 210, 0.2);
  background: rgba(20, 40, 80, 0.2);
}

.node-committee::before {
  background: linear-gradient(to right, transparent, rgba(100, 140, 210, 0.3), transparent);
}

.node-committee:hover {
  border-color: rgba(100, 140, 210, 0.4);
}

.node-committee .card-avatar {
  background: rgba(40, 70, 140, 0.25);
  border-color: rgba(100, 140, 210, 0.25);
  color: rgba(160, 190, 240, 0.9);
}

/* Senate President */
.node-senate-pres {
  background: rgba(20, 60, 55, 0.35);
  border-color: rgba(45, 188, 168, 0.3);
  box-shadow:
    0 4px 16px rgba(45, 188, 168, 0.08),
    inset 0 1px 0 rgba(45, 188, 168, 0.1);
}

.node-senate-pres::before {
  background: linear-gradient(to right, transparent, rgba(45, 188, 168, 0.5), transparent);
}

.node-senate-pres:hover {
  border-color: rgba(45, 188, 168, 0.5);
  box-shadow:
    0 12px 32px rgba(45, 188, 168, 0.15),
    0 0 0 1px rgba(45, 188, 168, 0.2);
}

.node-senate-pres .card-avatar {
  background: rgba(45, 188, 168, 0.12);
  border-color: rgba(45, 188, 168, 0.3);
  color: rgba(80, 220, 200, 0.9);
}

/* ══════════════════════════════════════════
   TIER LABELS
══════════════════════════════════════════ */
.tier-label {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2.25rem 0 1.5rem;
  position: relative;
  white-space: nowrap;
}

.tier-label::before,
.tier-label::after {
  content: '';
  flex: 1;
  height: 1px;
  max-width: 200px;
  background: linear-gradient(to right, transparent, rgba(201, 162, 75, 0.3));
}

.tier-label::after {
  background: linear-gradient(to left, transparent, rgba(201, 162, 75, 0.3));
}

.tier-label span {
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(201, 162, 75, 0.55);
  font-weight: 700;
  padding: 0.3rem 0.8rem;
  border: 1px solid rgba(201, 162, 75, 0.2);
  border-radius: 999px;
  background: rgba(201, 162, 75, 0.06);
}

.senate-tier-label {
  position: relative;
  width: 100%;
  overflow: visible;
}

.senate-tier-label span {
  position: relative;
  z-index: 10;
  background: rgba(20, 60, 55, 0.25);
  border-color: rgba(45, 188, 168, 0.25);
  color: rgba(80, 220, 200, 0.7);
}

/* ══════════════════════════════════════════
   SENATORS ROW
══════════════════════════════════════════ */
.senators-row-container {
  width: 100%;
  display: flex;
  justify-content: center;
}

.senators-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  width: 100%;
  gap: 0;
}

.senator-node-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 5px 10px;
  flex: 1;
  min-width: 130px;
}

/* Horizontal bus line */
.senator-node-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, rgba(45, 188, 168, 0.15), rgba(45, 188, 168, 0.5), rgba(45, 188, 168, 0.15));
}

.senator-node-container:first-child::before { left: 50%; }
.senator-node-container:last-child::before  { right: 50%; }

/* Vertical drop line */
.senator-node-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 24px;
  width: 1px;
  background: rgba(45, 188, 168, 0.4);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(45, 188, 168, 0.2);
}

/* Senator card */
.senator-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 1.1rem 0.6rem 0.9rem;
  border: 1px solid rgba(45, 188, 168, 0.18);
  border-radius: 0.875rem;
  background: rgba(20, 60, 55, 0.2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  text-align: center;
  width: 100%;
  max-width: 130px;
  min-height: 180px;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(45, 188, 168, 0.05);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.senator-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(45, 188, 168, 0.4), transparent);
}

.senator-card:hover {
  transform: translateY(-4px);
  border-color: rgba(45, 188, 168, 0.4);
  box-shadow:
    0 8px 20px rgba(45, 188, 168, 0.1),
    0 0 0 1px rgba(45, 188, 168, 0.15),
    inset 0 1px 0 rgba(45, 188, 168, 0.08);
}

/* Senator avatar */
.senator-avatar-wrap {
  position: relative;
  margin-bottom: 0.7rem;
  flex-shrink: 0;
}

.senator-avatar-wrap::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid rgba(45, 188, 168, 0.18);
  pointer-events: none;
}

.senator-avatar {
  width: 3rem;
  height: 3rem;
  font-size: 0.9rem;
  background: rgba(45, 188, 168, 0.1);
  border: 1px solid rgba(45, 188, 168, 0.2);
  color: rgba(80, 220, 200, 0.85);
}

.senator-name {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.senator-card:hover .senator-avatar {
  box-shadow: 0 0 10px rgba(45, 188, 168, 0.2);
}

/* ══════════════════════════════════════════
   MOBILE — fits everything into viewport
══════════════════════════════════════════ */
@media (max-width: 768px) {

  .tier-row {
    gap: 1rem;
    padding: 0.375rem 0;
  }
  .tier-row.two-up { gap: 0.75rem; }

  .connector { height: 20px; }
  .connector-to-senate { height: 12px; }

  .node-card {
    width: auto;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0.75rem 0.5rem;
    border-radius: 0.625rem;
    border-width: 1px;
    white-space: normal;
  }

  .card-avatar-wrap { margin-bottom: 0.5rem; }
  .card-avatar-wrap::after { display: none; }

  .card-avatar {
    width: 2rem;
    height: 2rem;
    font-size: 0.7rem;
  }

  .card-name {
    font-size: 0.6rem;
    -webkit-line-clamp: 2;
  }

  .card-badge {
    font-size: 0.45rem;
    padding: 0.1rem 0.35rem;
    margin-top: 0.25rem;
  }

  .card-email { display: none !important; }

  .node-gold.node-large { padding: 0.75rem 0.5rem; min-height: 0; }

  /* Senator row: wrap */
  .senators-row {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .senator-node-container {
    padding: 14px 4px 6px;
    min-width: 0;
    flex: 0 1 auto;
    width: calc(33.33% - 0.5rem);
    max-width: 110px;
  }

  .senator-node-container::after { height: 14px; }

  .senator-card {
    padding: 0.65rem 0.3rem;
    max-width: 100%;
    min-height: 0;
    border-radius: 0.5rem;
  }

  .senator-avatar-wrap { margin-bottom: 0.4rem; }
  .senator-avatar-wrap::after { display: none; }

  .senator-avatar {
    width: 1.75rem;
    height: 1.75rem;
    font-size: 0.6rem;
  }

  .senator-name { font-size: 0.55rem; }
  .badge-teal-soft { font-size: 0.4rem; padding: 0.08rem 0.25rem; }
}
</style>
