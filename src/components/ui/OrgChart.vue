<script setup lang="ts">
import type { Officer } from '@/data/officers'
import { computed } from 'vue'
import OfficerCard from './OfficerCard.vue'

const props = defineProps<{
  officers: Officer[]
}>()

// ── Lookups by name for precise placement ──
function find(namePart: string) {
  return computed(() => props.officers.find(o => o.name.includes(namePart)))
}

function findAll(tier: string) {
  return computed(() => props.officers.filter(o => o.tier === tier))
}

// Administration
const president = find('Siason')
const vpAcademic = find('Jinon')
const campusAdmin = find('Balbona')
const sscChair = find('Ilisan-Sales')
const adminSupport = find('Baling')

// Coordinators (left column)
const coordSubang = find('Subang')
const coordVerdeflorCoord = find('Verdeflor')
const coordAlada = find('Alada')
const coordEsmeralda = find('Esmeralda')
const coordDeslate = find('Deslate')

// Coordinators (right column)
const coordDaguro = find('Daguro')
const coordBracamonte = find('Bracamonte')
const coordTanquerido = find('Tanquerido')
const coordBatislOng = find('Batisl')

// Federated USC
const fedAdviser = find('Katalbas')
const fedPresident = find('Depositario')

// USC Advisers
const uscAdviser = computed(() => props.officers.find(o => o.name.includes('Verdeflor') && o.tier === 'usc_advisers'))
const uscCoAdviser = find('Borcelo')

// USC Executive
const execPresident = find('Demonteverde')
const execVp = find('Bicodo')
const execSecretary = find('Danugrao')
const execAuditor = find('Parcia')
const execSenatePres = find('Daguro')
const execTreasurer = find('Manderico')
const execSpokesperson = find('Aqui')

// Student Senate
const senators = findAll('student_senate')

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
</script>

<template>
  <div class="org-chart-wrapper">
    <div class="org-chart-inner">

      <!-- ════════════════════════════════════════════════════════════
           SECTION 1: TOP VERTICAL CHAIN (Main Admin)
           ════════════════════════════════════════════════════════════ -->

      <!-- University President -->
      <div class="chain-card" v-if="president">
        <OfficerCard
          :name="president.name"
          designation="University President"
          :initials="getInitials(president.name)"
          variant="institutional"
        />
      </div>

      <!-- Connector -->
      <div class="v-connector"><div class="v-line"></div></div>

      <!-- VP Academic Affairs -->
      <div class="chain-card" v-if="vpAcademic">
        <OfficerCard
          :name="vpAcademic.name"
          designation="Vice President for Academic Affairs"
          :initials="getInitials(vpAcademic.name)"
          variant="institutional"
        />
      </div>

      <!-- Connector -->
      <div class="v-connector"><div class="v-line"></div></div>

      <!-- Campus Administrator -->
      <div class="chain-card" v-if="campusAdmin">
        <OfficerCard
          :name="campusAdmin.name"
          designation="Campus Administrator"
          :initials="getInitials(campusAdmin.name)"
          variant="pivot"
        />
      </div>

      <!-- Connector -->
      <div class="v-connector"><div class="v-line"></div></div>

      <!-- OIC Chairperson -->
      <div class="chain-card" v-if="sscChair">
        <OfficerCard
          :name="sscChair.name"
          designation="OIC Chairperson, Student Support Center"
          :initials="getInitials(sscChair.name)"
          variant="institutional"
        />
      </div>

      <!-- ════════════════════════════════════════════════════════════
           SECTION 2: SIDE BRANCH + COORDINATORS
           ════════════════════════════════════════════════════════════ -->

      <!-- Connector with side branch -->
      <div class="side-branch-area">
        <!-- Main vertical line -->
        <div class="v-connector side-main-line"><div class="v-line"></div></div>

        <!-- Side branch to the right -->
        <div class="side-branch" v-if="adminSupport">
          <div class="h-connector"><div class="h-line"></div></div>
          <div class="side-card">
            <OfficerCard
              :name="adminSupport.name"
              designation="Administrative Support Staff"
              :initials="getInitials(adminSupport.name)"
              variant="institutional"
            />
          </div>
        </div>
      </div>

      <!-- SSC Coordinators Block (2 columns) -->
      <div class="coordinators-grid">
        <!-- Left Column -->
        <div class="coord-col">
          <div class="coord-card" v-if="coordSubang">
            <OfficerCard
              :name="coordSubang.name"
              designation="Coordinator, Recreation & Sports"
              :initials="getInitials(coordSubang.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordVerdeflorCoord">
            <OfficerCard
              :name="coordVerdeflorCoord.name"
              designation="Coordinator, Guidance and Testing"
              :initials="getInitials(coordVerdeflorCoord.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordAlada">
            <OfficerCard
              :name="coordAlada.name"
              designation="Coordinator, Student Publication"
              :initials="getInitials(coordAlada.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordEsmeralda">
            <OfficerCard
              :name="coordEsmeralda.name"
              designation="Coordinator, Student Organization"
              :initials="getInitials(coordEsmeralda.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordDeslate">
            <OfficerCard
              :name="coordDeslate.name"
              designation="University Psychometrician"
              :initials="getInitials(coordDeslate.name)"
              variant="institutional"
            />
          </div>
        </div>

        <!-- Right Column -->
        <div class="coord-col">
          <div class="coord-card" v-if="coordDaguro">
            <OfficerCard
              :name="coordDaguro.name"
              designation="Coordinator, Cultural Affairs"
              :initials="getInitials(coordDaguro.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordBracamonte">
            <OfficerCard
              :name="coordBracamonte.name"
              designation="Coordinator, Health Services"
              :initials="getInitials(coordBracamonte.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordTanquerido">
            <OfficerCard
              :name="coordTanquerido.name"
              designation="Coordinator, Dormitory & Housing"
              :initials="getInitials(coordTanquerido.name)"
              variant="institutional"
            />
          </div>
          <div class="coord-card" v-if="coordBatislOng">
            <OfficerCard
              :name="coordBatislOng.name"
              designation="Coordinator, Scholarship"
              :initials="getInitials(coordBatislOng.name)"
              variant="institutional"
            />
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════
           SECTION 3: MIDDLE HORIZONTAL LAYER (3 Sections)
           ════════════════════════════════════════════════════════════ -->

      <div class="middle-layer">
        <!-- Section A: Federated USC -->
        <div class="layer-section">
          <div class="section-header">
            <span class="section-badge badge-gold">Federated University Student Council</span>
          </div>
          <div class="section-stack">
            <div class="stack-card" v-if="fedAdviser">
              <OfficerCard
                :name="fedAdviser.name"
                designation="Adviser"
                :initials="getInitials(fedAdviser.name)"
                variant="institutional"
              />
            </div>
            <div class="v-connector-sm"><div class="v-line"></div></div>
            <div class="stack-card" v-if="fedPresident">
              <OfficerCard
                :name="fedPresident.name"
                designation="President"
                :initials="getInitials(fedPresident.name)"
                variant="pivot"
              />
            </div>
          </div>
        </div>

        <!-- Section B: USC Advisers -->
        <div class="layer-section">
          <div class="section-header">
            <span class="section-badge badge-blue">University Student Council Advisers</span>
          </div>
          <div class="section-stack">
            <div class="stack-card" v-if="uscAdviser">
              <OfficerCard
                :name="uscAdviser.name"
                designation="Adviser"
                :initials="getInitials(uscAdviser.name)"
                variant="institutional"
              />
            </div>
            <div class="v-connector-sm"><div class="v-line"></div></div>
            <div class="stack-card" v-if="uscCoAdviser">
              <OfficerCard
                :name="uscCoAdviser.name"
                designation="Co-Adviser"
                :initials="getInitials(uscCoAdviser.name)"
                variant="institutional"
              />
            </div>
          </div>
        </div>

        <!-- Section C: USC Executive Officers -->
        <div class="layer-section section-wide">
          <div class="section-header">
            <span class="section-badge badge-gold">University Student Council - Executive Officers</span>
          </div>
          <div class="exec-tree">
            <!-- President -->
            <div class="exec-pres" v-if="execPresident">
              <OfficerCard
                :name="execPresident.name"
                designation="President"
                :email="execPresident.email"
                :initials="getInitials(execPresident.name)"
                variant="executive"
              />
            </div>

            <!-- Connector to VP -->
            <div class="v-connector-sm"><div class="v-line"></div></div>

            <!-- Vice President -->
            <div class="exec-pres" v-if="execVp">
              <OfficerCard
                :name="execVp.name"
                designation="Vice President"
                :email="execVp.email"
                :initials="getInitials(execVp.name)"
                variant="executive"
              />
            </div>

            <!-- Branch connector (1 → 4) -->
            <div class="branch-connector">
              <div class="branch-line"></div>
              <div class="branch-drops">
                <div class="branch-drop"></div>
                <div class="branch-drop"></div>
                <div class="branch-drop"></div>
                <div class="branch-drop"></div>
              </div>
            </div>

            <!-- 4 Officers row -->
            <div class="exec-row">
              <div class="exec-cell" v-if="execSecretary">
                <OfficerCard
                  :name="execSecretary.name"
                  designation="Secretary"
                  :email="execSecretary.email"
                  :initials="getInitials(execSecretary.name)"
                  variant="committee"
                />
              </div>
              <div class="exec-cell" v-if="execSenatePres">
                <OfficerCard
                  :name="execSenatePres.name"
                  designation="Senate President"
                  :email="execSenatePres.email"
                  :initials="getInitials(execSenatePres.name)"
                  variant="committee"
                />
              </div>
              <div class="exec-cell" v-if="execAuditor">
                <OfficerCard
                  :name="execAuditor.name"
                  designation="Auditor"
                  :email="execAuditor.email"
                  :initials="getInitials(execAuditor.name)"
                  variant="committee"
                />
              </div>
              <div class="exec-cell" v-if="execTreasurer">
                <OfficerCard
                  :name="execTreasurer.name"
                  designation="Treasurer"
                  :email="execTreasurer.email"
                  :initials="getInitials(execTreasurer.name)"
                  variant="committee"
                />
              </div>
            </div>

            <!-- Connector to Spokesperson -->
            <div class="branch-connector branch-small">
              <div class="branch-line"></div>
              <div class="branch-drops">
                <div class="branch-drop"></div>
              </div>
            </div>

            <!-- Spokesperson -->
            <div class="exec-pres" v-if="execSpokesperson">
              <OfficerCard
                :name="execSpokesperson.name"
                designation="Spokesperson"
                :email="execSpokesperson.email"
                :initials="getInitials(execSpokesperson.name)"
                variant="committee"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════
           SECTION 4: STUDENT SENATE (below Section C)
           ════════════════════════════════════════════════════════════ -->

      <!-- Connector from exec tree down to senate -->
      <div class="senate-connector">
        <div class="v-connector-sm"><div class="v-line line-teal"></div></div>
      </div>

      <div class="senate-banner">
        <div class="banner-header">
          <span class="section-badge badge-teal">Student Senate</span>
        </div>
        <div class="senators-row">
          <div
            v-for="senator in senators"
            :key="senator.name"
            class="senator-node"
          >
            <OfficerCard
              :name="senator.name"
              designation="Senator"
              :initials="getInitials(senator.name)"
              variant="senate"
            />
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   WRAPPER
   ══════════════════════════════════════════ */
.org-chart-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2rem;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  min-width: max-content;
}

/* ══════════════════════════════════════════
   VERTICAL CHAIN CARDS
   ══════════════════════════════════════════ */
.chain-card {
  display: flex;
  justify-content: center;
  padding: 0.25rem 0;
}

/* ══════════════════════════════════════════
   VERTICAL CONNECTOR
   ══════════════════════════════════════════ */
.v-connector {
  position: relative;
  height: 32px;
  width: 1px;
  display: flex;
  justify-content: center;
}

.v-line {
  width: 1px;
  height: 100%;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.2);
}

.v-connector-sm {
  position: relative;
  height: 20px;
  width: 1px;
  display: flex;
  justify-content: center;
}

.v-connector-sm .v-line {
  width: 1px;
  height: 100%;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.2);
}

.line-teal {
  background: linear-gradient(to bottom, rgba(45, 188, 168, 0.6), rgba(45, 188, 168, 0.25)) !important;
  box-shadow: 0 0 4px rgba(45, 188, 168, 0.2) !important;
}

/* ══════════════════════════════════════════
   SIDE BRANCH AREA
   ══════════════════════════════════════════ */
.side-branch-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding: 0.25rem 0;
}

.side-main-line {
  position: relative;
}

.side-branch {
  display: flex;
  align-items: center;
  gap: 0;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(0%, -50%);
  margin-left: 140px;
}

.h-connector {
  position: relative;
  width: 60px;
  height: 1px;
  display: flex;
  align-items: center;
}

.h-line {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.3));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

.side-card {
  flex-shrink: 0;
}

/* ══════════════════════════════════════════
   COORDINATORS GRID (2 columns)
   ══════════════════════════════════════════ */
.coordinators-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 2rem;
  padding: 0.5rem 0 1.5rem;
  max-width: 600px;
  width: 100%;
}

.coord-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.coord-card {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   MIDDLE HORIZONTAL LAYER (3 sections)
   ══════════════════════════════════════════ */
.middle-layer {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  padding: 1rem 0 1.5rem;
  width: 100%;
  justify-content: center;
}

.layer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  min-width: 240px;
}

.section-wide {
  min-width: 340px;
}

.section-header {
  text-align: center;
  margin-bottom: 0.25rem;
}

.section-badge {
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  display: inline-block;
  white-space: nowrap;
}

.badge-gold {
  color: rgba(201, 162, 75, 0.7);
  border: 1px solid rgba(201, 162, 75, 0.25);
  background: rgba(201, 162, 75, 0.08);
}

.badge-blue {
  color: rgba(130, 180, 255, 0.8);
  border: 1px solid rgba(100, 140, 220, 0.25);
  background: rgba(100, 140, 220, 0.08);
}

.badge-teal {
  color: rgba(80, 220, 200, 0.7);
  border: 1px solid rgba(45, 188, 168, 0.25);
  background: rgba(45, 188, 168, 0.08);
}

.section-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.stack-card {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   EXECUTIVE TREE (inside Section C)
   ══════════════════════════════════════════ */
.exec-tree {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.exec-pres {
  display: flex;
  justify-content: center;
  padding: 0.25rem 0;
}

.branch-connector {
  position: relative;
  height: 30px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.branch-small {
  height: 20px;
}

.branch-line {
  width: 1px;
  height: 50%;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.4));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.2);
}

.branch-drops {
  display: flex;
  gap: 2rem;
  width: 100%;
  justify-content: center;
  position: relative;
}

.branch-drops::before {
  content: '';
  position: absolute;
  top: 0;
  left: calc(50% - 3rem);
  width: 6rem;
  height: 1px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.25), rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

.branch-drop {
  width: 1px;
  height: 12px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 3px rgba(201, 162, 75, 0.15);
}

.branch-small .branch-drops {
  gap: 0;
}

.branch-small .branch-drops::before {
  display: none;
}

.exec-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  width: 100%;
}

.exec-cell {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   STUDENT SENATE
   ══════════════════════════════════════════ */
.senate-connector {
  display: flex;
  justify-content: center;
  padding: 0.25rem 0;
}

.senate-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.banner-header {
  text-align: center;
}

.senators-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
}

.senator-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 5px 8px;
  flex: 1;
  min-width: 160px;
  max-width: 200px;
}

/* Horizontal bus line */
.senator-node::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, rgba(45, 188, 168, 0.15), rgba(45, 188, 168, 0.5), rgba(45, 188, 168, 0.15));
}

.senator-node:first-child::before { left: 50%; }
.senator-node:last-child::before  { right: 50%; }

/* Vertical drop line */
.senator-node::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 20px;
  width: 1px;
  background: rgba(45, 188, 168, 0.4);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(45, 188, 168, 0.2);
}

/* ══════════════════════════════════════════
   MOBILE
   ══════════════════════════════════════════ */
@media (max-width: 900px) {
  .org-chart-wrapper {
    padding: 1.5rem 1rem;
  }

  .org-chart-inner {
    min-width: 1100px;
  }

  .middle-layer {
    flex-wrap: wrap;
    gap: 1.5rem;
  }
}

@media (max-width: 600px) {
  .org-chart-wrapper {
    padding: 1rem 0.5rem;
  }

  .org-chart-inner {
    min-width: 900px;
  }

  .coordinators-grid {
    grid-template-columns: 1fr;
    max-width: 300px;
  }

  .exec-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .senators-row {
    flex-wrap: wrap;
    justify-content: center;
  }

  .senator-node {
    flex: 0 1 auto;
    width: calc(33.33% - 0.5rem);
    min-width: 100px;
  }

  .side-branch {
    margin-left: 100px;
  }

  .h-connector {
    width: 40px;
  }
}
</style>
