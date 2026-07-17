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
const committeeHeads = computed(() =>
  props.officers.filter(
    o => o.role === 'executive' && !['President', 'Vice President', 'Senate President'].includes(o.position)
  )
)
const senators = computed(() => props.officers.filter(o => o.role === 'senate'))

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
    <p class="scroll-hint">&larr; Scroll to view full chart &rarr;</p>
    <div class="org-chart-inner">
      <!-- ====== OVERSIGHT SECTION ====== -->

      <!-- Tier 1: SUC President -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar">{{ getPositionInitials('SUC President') }}</div>
          <span class="card-name">SUC President</span>
          <span class="card-position">Institutional Oversight</span>
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
          <div class="card-avatar">{{ getPositionInitials('FUSC Adviser') }}</div>
          <span class="card-name">FUSC Adviser</span>
          <span class="card-position">Institutional Oversight</span>
        </div>
        <div class="node-card placeholder-node">
          <div class="card-avatar">?</div>
          <span class="card-name text-danger">Name to confirm</span>
          <span class="card-position">Institutional Oversight</span>
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
          <div class="card-avatar">{{ getPositionInitials('FUSC President') }}</div>
          <span class="card-name">FUSC President</span>
          <span class="card-position">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 4: Campus AD -->
      <div class="tier-row">
        <div class="node-card node-campus-ad">
          <div class="card-avatar">{{ getPositionInitials('Campus AD') }}</div>
          <span class="card-name" style="color: white">Campus AD</span>
          <span class="card-position" style="color: #E4CD8E">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 5: SSC Chair -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar">{{ getPositionInitials('SSC Chair') }}</div>
          <span class="card-name">SSC Chair</span>
          <span class="card-position">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6: Vice Chair -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar">{{ getPositionInitials('Vice Chair') }}</div>
          <span class="card-name">Vice Chair</span>
          <span class="card-position">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6b: USC Adviser -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar">{{ getPositionInitials('USC Adviser') }}</div>
          <span class="card-name">USC Adviser</span>
          <span class="card-position">Institutional Oversight</span>
        </div>
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6c: USC Co-Adviser -->
      <div class="tier-row">
        <div class="node-card node-inst">
          <div class="card-avatar">{{ getPositionInitials('USC Co-Adviser') }}</div>
          <span class="card-name">USC Co-Adviser</span>
          <span class="card-position">Institutional Oversight</span>
        </div>
      </div>

      <!-- ====== TIER LABEL ====== -->
      <div class="tier-label">
        <span>USC Executive Officers</span>
      </div>

      <!-- ====== EXECUTIVE SECTION ====== -->
      <div class="exec-grid">
        <!-- Row 1: President (centered, spans cols 1-4) -->
        <div class="flex justify-center pb-2" style="grid-column: 1 / 5">
          <div class="node-card node-gold node-large">
            <div class="card-avatar">{{ getInitials(president?.name) }}</div>
            <span class="card-name">{{ president?.name }}</span>
            <span class="card-position">{{ president?.position }}</span>
            <div class="card-email" v-if="president?.email">
              <svg class="w-3 h-3 text-navy/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ president?.email }}
            </div>
          </div>
        </div>

        <!-- Row 2: Connector (single line down to VP) -->
        <div class="connector" style="grid-column: 1 / 5">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>

        <!-- Row 3: Vice President (centered, spans cols 1-4) -->
        <div class="flex justify-center pb-2" style="grid-column: 1 / 5">
          <div class="node-card node-gold node-large">
            <div class="card-avatar">{{ getInitials(vicePresident?.name) }}</div>
            <span class="card-name">{{ vicePresident?.name }}</span>
            <span class="card-position">{{ vicePresident?.position }}</span>
            <div class="card-email" v-if="vicePresident?.email">
              <svg class="w-3 h-3 text-navy/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ vicePresident?.email }}
            </div>
          </div>
        </div>

        <!-- Row 4: 1-to-4 Branch-down Connector -->
        <div class="connector" style="grid-column: 1 / 5; --tl: 50%; --bar-l: 12.5%; --bar-w: 75%">
          <div class="conn-line" style="top:0; left:var(--tl); height:50%"></div>
          <div class="conn-bar" style="top:50%; left:var(--bar-l); width:var(--bar-w)"></div>
          <div class="conn-line" style="top:50%; left:12.5%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:37.5%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:62.5%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:87.5%; height:50%"></div>
        </div>

        <!-- Row 5: 3 Committee Heads + Senate President (Dein Daguro) -->
        <div v-for="ch in committeeHeads" :key="ch.position" class="flex justify-center">
          <div class="node-card node-committee">
            <div class="card-avatar">{{ getInitials(ch.name) }}</div>
            <span class="card-name">{{ ch.name }}</span>
            <span class="card-position">{{ ch.position }}</span>
            <div class="card-email" v-if="ch.email">
              <svg class="w-3 h-3 text-slate/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ ch.email }}
            </div>
          </div>
        </div>
        <div class="flex justify-center">
          <div class="node-card node-senate-pres">
            <div class="card-avatar">{{ getInitials(senatePresident?.name) }}</div>
            <span class="card-name">{{ senatePresident?.name }}</span>
            <span class="card-position">{{ senatePresident?.position }}</span>
            <div class="card-email" v-if="senatePresident?.email">
              <svg class="w-3 h-3 text-slate/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ senatePresident?.email }}
            </div>
          </div>
        </div>

        <!-- Row 6: Connector below Senate President (col 4) -->
        <div class="connector" style="grid-column: 4 / 5">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>
      </div>

      <!-- Connector line from Senate President (col 4 / 87.5% point of grid width) down to Senate Label -->
      <div class="connector-to-senate">
        <div class="conn-line" style="top:0; left:87.5%; height:100%"></div>
      </div>

      <!-- ====== TIER LABEL WITH PASS-THROUGH CONNECTOR ====== -->
      <div class="tier-label senate-tier-label">
        <div class="conn-line" style="top:-30px; bottom:0; left:87.5%; height:calc(100% + 30px); z-index: 1;"></div>
        <span>Legislative Body &mdash; Student Senate</span>
      </div>

      <!-- ====== SENATORS SECTION WITH INTEGRATED CONNECTORS ====== -->
      <div class="senators-row-container">
        <div class="senators-row">
          <div
            v-for="senator in senators"
            :key="senator.email ?? senator.position"
            class="senator-node-container"
          >
            <div class="senator-card">
              <div class="card-avatar">{{ getInitials(senator.name) }}</div>
              <span class="card-name">{{ senator.name }}</span>
              <span class="card-position">{{ senator.position }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.org-chart-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2.5rem;
  width: 100%;
}

.org-chart-inner {
  width: 100%;
  min-width: 1200px; /* Ensures chart maintains structured spacing on desktop & scrollability on mobile */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.scroll-hint {
  display: none;
  text-align: center;
  font-size: 0.75rem;
  color: var(--color-slate, #5C6773);
  margin-bottom: 1.5rem;
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

@media (max-width: 1024px) {
  .scroll-hint {
    display: block;
  }
}

/* ---- Tiers ---- */
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

/* ---- Executive grid ---- */
.exec-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  width: 100%;
  gap: 0;
}

/* ---- Connectors ---- */
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
  width: 2px;
  background: #D8CFAF;
  transform: translateX(-50%);
}

.conn-bar {
  position: absolute;
  height: 2px;
  background: #D8CFAF;
  transform: translateY(-50%);
}

/* ---- Portrait Node Cards ---- */
.node-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  border-radius: 1rem;
  padding: 1.5rem 1rem;
  border: 2px solid #142850;
  background: #fff;
  text-align: center;
  white-space: nowrap;
  width: 180px;
  height: 240px;
  box-shadow: 0 4px 6px -1px rgba(20, 40, 80, 0.04), 0 2px 4px -1px rgba(20, 40, 80, 0.02);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  box-sizing: border-box;
}

.node-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px -5px rgba(20, 40, 80, 0.1), 0 8px 8px -5px rgba(20, 40, 80, 0.04);
}

/* Avatar bubble design */
.card-avatar {
  width: 4rem;
  height: 4rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif, serif);
  font-weight: 700;
  font-size: 1.25rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
  transition: transform 0.25s ease;
}

.node-card:hover .card-avatar {
  transform: scale(1.05);
}

.card-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: #142850;
  line-height: 1.25;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-position {
  font-size: 0.75rem;
  font-weight: 600;
  color: #8A6D2F;
  margin-top: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.card-email {
  display: none;
  align-items: center;
  gap: 0.375rem;
  margin-top: 1rem;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  background: rgba(20, 40, 80, 0.04);
  border: 1px solid #DCD6C8;
  font-size: 0.6875rem;
  font-family: var(--font-mono, monospace);
  color: #5C6773;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 768px) {
  .card-email {
    display: inline-flex;
  }
}

/* Node card visual variants */
.node-inst {
  border-color: rgba(20, 40, 80, 0.2);
  background: #ffffff;
}

.node-inst .card-avatar {
  background: rgba(20, 40, 80, 0.05);
  border: 2px solid rgba(20, 40, 80, 0.15);
  color: #142850;
}

.node-inst .card-position {
  color: #5C6773;
  font-size: 0.6875rem;
}

.node-campus-ad {
  background: #142850;
  border-color: #142850;
}

.node-campus-ad .card-avatar {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  color: #E4CD8E;
}

.node-campus-ad .card-name {
  color: #ffffff;
}

.node-campus-ad .card-position {
  color: #E4CD8E;
}

.placeholder-node {
  border: 2px dashed #dc2626;
  background: #ffffff;
}

.placeholder-node .card-avatar {
  background: rgba(220, 38, 38, 0.05);
  border: 2px dashed rgba(220, 38, 38, 0.3);
  color: #dc2626;
}

.placeholder-node .card-name {
  color: #dc2626;
  font-style: italic;
}

.placeholder-node .card-position {
  color: #5C6773;
  font-size: 0.6875rem;
}

.node-gold {
  background: linear-gradient(135deg, #C9A24B, #E4CD8E);
  border-color: #C9A24B;
}

.node-gold.node-large {
  padding: 1.75rem 1rem 1.25rem;
}

.node-gold .card-avatar {
  background: #142850;
  border: 2px solid rgba(255, 255, 255, 0.15);
  color: #E4CD8E;
}

.node-gold .card-name {
  color: #142850;
}

.node-gold .card-position {
  color: #142850;
  opacity: 0.85;
}

.node-committee {
  border-color: rgba(20, 40, 80, 0.25);
  background: #ffffff;
}

.node-committee .card-avatar {
  background: rgba(20, 40, 80, 0.04);
  border: 2px solid rgba(20, 40, 80, 0.1);
  color: #142850;
}

.node-senate-pres {
  border-color: #C9A24B;
  background: linear-gradient(135deg, #fdfbfa, #fdf6e3);
}

.node-senate-pres .card-avatar {
  background: rgba(201, 162, 75, 0.1);
  border: 2px solid rgba(201, 162, 75, 0.3);
  color: #8A6D2F;
}

.node-senate-pres .card-name {
  color: #142850;
}

.node-senate-pres .card-position {
  color: #8A6D2F;
}

/* ---- Tier label ---- */
.tier-label {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2.5rem 0 1.75rem;
  position: relative;
  white-space: nowrap;
}

.tier-label::before,
.tier-label::after {
  content: '';
  flex: 1;
  height: 1px;
  max-width: 200px;
  background: #D8CFAF;
}

.tier-label span {
  font-size: 0.75rem;
  font-family: var(--font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8A6D2F;
  font-weight: 600;
}

.senate-tier-label {
  position: relative;
  width: 100%;
  overflow: visible;
}

.senate-tier-label span {
  position: relative;
  z-index: 10;
  background: #F7F5F0;
  padding: 0 1rem;
}

/* ---- Senators ---- */
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
  padding: 24px 6px 10px;
  flex: 1;
  min-width: 130px;
}

.senator-node-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #D8CFAF;
}

.senator-node-container:first-child::before {
  left: 50%;
}

.senator-node-container:last-child::before {
  right: 50%;
}

.senator-node-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 24px;
  width: 2px;
  background: #D8CFAF;
  transform: translateX(-50%);
}

.senator-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 1.25rem 0.75rem;
  border: 1px solid #DCD6C8;
  border-radius: 0.75rem;
  background: #fff;
  text-align: center;
  width: 100%;
  max-width: 130px;
  height: 190px;
  transition: all 0.25s ease-in-out;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  box-sizing: border-box;
}

.senator-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 12px rgba(20, 40, 80, 0.06);
}

.senator-card .card-avatar {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 9999px;
  background: rgba(20, 40, 80, 0.06);
  border: 1px solid #DCD6C8;
  color: #142850;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}

.senator-card .card-name {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #142850;
}

.senator-card .card-position {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #8A6D2F;
  margin-top: 0.25rem;
}

/* ====== MOBILE SCALING ====== */
@media (max-width: 768px) {
  .org-chart-inner {
    min-width: 900px; /* Make it more compact on mobile to limit horizontal scroll scope */
  }

  .tier-row {
    gap: 8rem;
    padding: 0.5rem 0;
  }

  .tier-row.two-up {
    gap: 8rem;
  }

  .connector {
    height: 30px;
  }

  .connector-to-senate {
    height: 20px;
  }

  /* Compact portrait cards on mobile */
  .node-card {
    width: 120px;
    height: 165px;
    padding: 1rem 0.5rem;
    border-radius: 0.75rem;
  }

  .card-avatar {
    width: 3rem;
    height: 3rem;
    font-size: 0.95rem;
    margin-bottom: 0.5rem;
  }

  .card-name {
    font-size: 0.75rem;
  }

  .card-position {
    font-size: 0.625rem;
    margin-top: 0.25rem;
  }

  .node-gold.node-large {
    padding: 1.25rem 0.5rem 1rem;
  }

  /* Compact senator cards on mobile */
  .senator-node-container {
    padding: 16px 4px 6px;
    min-width: 90px;
  }

  .senator-node-container::after {
    height: 16px;
  }

  .senator-card {
    padding: 0.875rem 0.375rem;
    max-width: 90px;
    height: 140px;
  }

  .senator-card .card-avatar {
    width: 2.5rem;
    height: 2.5rem;
    font-size: 0.8125rem;
    margin-bottom: 0.5rem;
  }

  .senator-card .card-name {
    font-size: 0.6875rem;
  }

  .senator-card .card-position {
    font-size: 0.5625rem;
  }
}
</style>
