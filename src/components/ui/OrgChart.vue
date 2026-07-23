<script setup lang="ts">
import type { Officer } from '@/data/officers'
import { computed } from 'vue'
import OfficerCard from './OfficerCard.vue'

const props = defineProps<{
  officers: Officer[]
}>()

// ── Lookups by name ──
function find(namePart: string) {
  return computed(() => props.officers.find(o => o.name.includes(namePart)))
}

const president = find('Siason')
const vpAcademic = find('Jinon')
const campusAdmin = find('Balbona')
const sscChair = find('Ilisan-Sales')
const adminSupport = find('Baling')

// Coordinators — left column
const coordSubang = find('Subang')
const coordVerdeflorCoord = find('Verdeflor')
const coordAlada = find('Alada')
const coordEsmeralda = find('Esmeralda')
const coordDeslate = find('Deslate')

// Coordinators — right column
const coordDaguro = find('Daguro')
const coordBracamonte = find('Bracamonte')
const coordTanquerido = find('Tanquerido')
const coordBatislOng = find('Batisl')

// Federated USC
const fedAdviser = find('Katalbas')
const fedPresident = find('Depositario')

// USC Advisers
const uscAdviser = computed(() =>
  props.officers.find(o => o.name.includes('Verdeflor') && o.tier === 'usc_advisers')
)
const uscCoAdviser = find('Borcelo')

// USC Executive
const execPresident = find('Demonteverde')
const execVp = find('Bicodo')
const execSecretary = find('Danugrao')
const execAuditor = find('Parcia')
const execSenatePres = computed(() =>
  props.officers.find(o => o.name.includes('Daguro') && o.tier === 'usc_executive')
)
const execTreasurer = find('Manderico')
const execSpokesperson = find('Aqui')

// Student Senate
const senators = computed(() => props.officers.filter(o => o.tier === 'student_senate'))

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
  <div class="chart-wrapper">
    <div class="chart-canvas">

      <!-- ═══════════════════════════════════════════════════════
           SECTION 1: TOP VERTICAL CHAIN (Main Admin)
           ═══════════════════════════════════════════════════════ -->
      <div class="admin-chain">

        <!-- Row 1: University President -->
        <div class="chain-row">
          <div class="chain-card" v-if="president">
            <OfficerCard
              :name="president.name"
              designation="University President"
              :initials="getInitials(president.name)"
              variant="institutional"
            />
          </div>
        </div>

        <!-- Vertical line -->
        <div class="v-line-segment"></div>

        <!-- Row 2: VP Academic Affairs -->
        <div class="chain-row">
          <div class="chain-card" v-if="vpAcademic">
            <OfficerCard
              :name="vpAcademic.name"
              designation="Vice President for Academic Affairs"
              :initials="getInitials(vpAcademic.name)"
              variant="institutional"
            />
          </div>
        </div>

        <!-- Vertical line -->
        <div class="v-line-segment"></div>

        <!-- Row 3: Campus Administrator -->
        <div class="chain-row">
          <div class="chain-card" v-if="campusAdmin">
            <OfficerCard
              :name="campusAdmin.name"
              designation="Campus Administrator"
              :initials="getInitials(campusAdmin.name)"
              variant="pivot"
            />
          </div>
        </div>

        <!-- Vertical line -->
        <div class="v-line-segment"></div>

        <!-- Row 4: OIC Chairperson + Side Branch -->
        <div class="chain-row row-with-branch">
          <!-- Main card -->
          <div class="chain-card" v-if="sscChair">
            <OfficerCard
              :name="sscChair.name"
              designation="OIC Chairperson, Student Support Center"
              :initials="getInitials(sscChair.name)"
              variant="institutional"
            />
          </div>

          <!-- Side branch to the right -->
          <div class="side-branch" v-if="adminSupport">
            <div class="h-line-connector"></div>
            <div class="branch-card">
              <OfficerCard
                :name="adminSupport.name"
                designation="Administrative Support Staff, SSC"
                :initials="getInitials(adminSupport.name)"
                variant="institutional"
              />
            </div>
          </div>
        </div>

      </div>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2: VERTICAL LINE DOWN TO COORDINATORS
           ═══════════════════════════════════════════════════════ -->
      <div class="v-line-segment line-to-coords"></div>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3: SSC COORDINATORS (2-column grid)
           ═══════════════════════════════════════════════════════ -->
      <div class="section-label">
        <span class="label-badge label-gold">SSC Coordinators</span>
      </div>

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

      <!-- ═══════════════════════════════════════════════════════
           SECTION 4: MIDDLE LAYER (3 sections side-by-side)
           ═══════════════════════════════════════════════════════ -->
      <div class="v-line-segment"></div>

      <div class="middle-layer">
        <!-- Section A: Federated USC -->
        <div class="layer-section">
          <div class="section-label">
            <span class="label-badge label-gold">Federated University Student Council</span>
          </div>
          <div class="stacked-cards">
            <div class="stack-card" v-if="fedAdviser">
              <OfficerCard
                :name="fedAdviser.name"
                designation="Adviser"
                :initials="getInitials(fedAdviser.name)"
                variant="institutional"
              />
            </div>
            <div class="v-line-short"></div>
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
          <div class="section-label">
            <span class="label-badge label-blue">USC Advisers</span>
          </div>
          <div class="stacked-cards">
            <div class="stack-card" v-if="uscAdviser">
              <OfficerCard
                :name="uscAdviser.name"
                designation="Adviser"
                :initials="getInitials(uscAdviser.name)"
                variant="institutional"
              />
            </div>
            <div class="v-line-short"></div>
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
          <div class="section-label">
            <span class="label-badge label-gold">USC Executive Officers</span>
          </div>
          <div class="exec-tree">
            <!-- President -->
            <div class="exec-row" v-if="execPresident">
              <OfficerCard
                :name="execPresident.name"
                designation="President"
                :email="execPresident.email"
                :initials="getInitials(execPresident.name)"
                variant="executive"
              />
            </div>
            <div class="v-line-short"></div>
            <!-- VP -->
            <div class="exec-row" v-if="execVp">
              <OfficerCard
                :name="execVp.name"
                designation="Vice President"
                :email="execVp.email"
                :initials="getInitials(execVp.name)"
                variant="executive"
              />
            </div>
            <!-- Branch to 3 officers -->
            <div class="branch-split">
              <div class="branch-horizontal"></div>
              <div class="branch-stems">
                <div class="branch-stem"></div>
                <div class="branch-stem"></div>
                <div class="branch-stem"></div>
              </div>
            </div>
            <div class="exec-row-three">
              <div class="exec-cell" v-if="execSenatePres">
                <OfficerCard
                  :name="execSenatePres.name"
                  designation="Senate President"
                  :email="execSenatePres.email"
                  :initials="getInitials(execSenatePres.name)"
                  variant="committee"
                />
              </div>
              <div class="exec-cell" v-if="execSecretary">
                <OfficerCard
                  :name="execSecretary.name"
                  designation="Secretary"
                  :email="execSecretary.email"
                  :initials="getInitials(execSecretary.name)"
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
            <!-- Branch to 2 officers (centered) -->
            <div class="branch-split branch-split-small">
              <div class="branch-horizontal branch-horizontal-short"></div>
              <div class="branch-stems">
                <div class="branch-stem"></div>
                <div class="branch-stem"></div>
              </div>
            </div>
            <div class="exec-row-two">
              <div class="exec-cell" v-if="execAuditor">
                <OfficerCard
                  :name="execAuditor.name"
                  designation="Auditor"
                  :email="execAuditor.email"
                  :initials="getInitials(execAuditor.name)"
                  variant="committee"
                />
              </div>
              <div class="exec-cell" v-if="execSpokesperson">
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
      </div>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 5: STUDENT SENATE
           ═══════════════════════════════════════════════════════ -->
      <div class="v-line-segment line-teal"></div>

      <div class="section-label">
        <span class="label-badge label-teal">Student Senate</span>
      </div>

      <div class="senate-row">
        <div
          v-for="senator in senators"
          :key="senator.name"
          class="senate-cell"
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
</template>

<style scoped>
/* ══════════════════════════════════════════
   WRAPPER
   ══════════════════════════════════════════ */
.chart-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.chart-canvas {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: max-content;
  padding: 2rem 0 3rem;
}

/* ══════════════════════════════════════════
   ADMIN CHAIN (Vertical Flex)
   ══════════════════════════════════════════ */
.admin-chain {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chain-row {
  display: flex;
  justify-content: center;
  padding: 0.25rem 0;
}

.chain-card {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   VERTICAL LINE SEGMENTS
   ══════════════════════════════════════════ */
.v-line-segment {
  width: 1px;
  height: 36px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.65), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 6px rgba(201, 162, 75, 0.2);
  flex-shrink: 0;
}

.v-line-short {
  width: 1px;
  height: 22px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
  margin: 0 auto;
  flex-shrink: 0;
}

.line-teal {
  background: linear-gradient(to bottom, rgba(45, 188, 168, 0.6), rgba(45, 188, 168, 0.25));
  box-shadow: 0 0 6px rgba(45, 188, 168, 0.2);
}

.line-to-coords {
  height: 28px;
}

/* ══════════════════════════════════════════
   SIDE BRANCH (Row 4)
   ══════════════════════════════════════════ */
.row-with-branch {
  display: flex;
  align-items: center;
  gap: 0;
  position: relative;
}

.side-branch {
  display: flex;
  align-items: center;
  margin-left: 24px;
}

.h-line-connector {
  width: 48px;
  height: 1px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.65), rgba(201, 162, 75, 0.35));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
  flex-shrink: 0;
}

.branch-card {
  flex-shrink: 0;
}

/* ══════════════════════════════════════════
   SECTION LABELS
   ══════════════════════════════════════════ */
.section-label {
  text-align: center;
  margin-bottom: 0.75rem;
}

.label-badge {
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  display: inline-block;
  white-space: nowrap;
}

.label-gold {
  color: rgba(201, 162, 75, 0.7);
  border: 1px solid rgba(201, 162, 75, 0.25);
  background: rgba(201, 162, 75, 0.08);
}

.label-blue {
  color: rgba(130, 180, 255, 0.8);
  border: 1px solid rgba(100, 140, 220, 0.25);
  background: rgba(100, 140, 220, 0.08);
}

.label-teal {
  color: rgba(80, 220, 200, 0.7);
  border: 1px solid rgba(45, 188, 168, 0.25);
  background: rgba(45, 188, 168, 0.08);
}

/* ══════════════════════════════════════════
   COORDINATORS GRID (2 columns)
   ══════════════════════════════════════════ */
.coordinators-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 2.5rem;
  max-width: 620px;
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
   MIDDLE LAYER (3 sections)
   ══════════════════════════════════════════ */
.middle-layer {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  justify-content: center;
  padding: 0.5rem 0;
}

.layer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  min-width: 240px;
}

.section-wide {
  min-width: 360px;
}

.stacked-cards {
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
   EXECUTIVE TREE
   ══════════════════════════════════════════ */
.exec-tree {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.exec-row {
  display: flex;
  justify-content: center;
  padding: 0.2rem 0;
}

/* Branch split connector */
.branch-split {
  position: relative;
  width: 100%;
  height: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.branch-split-small {
  height: 20px;
}

.branch-horizontal {
  position: absolute;
  top: 0;
  left: 15%;
  right: 15%;
  height: 1px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.25), rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

.branch-horizontal-short {
  left: 40%;
  right: 40%;
}

.branch-stems {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  padding: 0 15%;
}

.branch-split-small .branch-stems {
  padding: 0 40%;
  justify-content: center;
}

.branch-stem {
  width: 1px;
  height: 100%;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  box-shadow: 0 0 3px rgba(201, 162, 75, 0.15);
}

.exec-row-four {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  width: 100%;
}

.exec-row-three {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  width: 100%;
}

.exec-row-two {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.exec-cell {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   SENATE ROW
   ══════════════════════════════════════════ */
.senate-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
  width: 100%;
  max-width: 1200px;
}

.senate-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 5px 8px;
}

/* Horizontal bus line */
.senate-cell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, rgba(45, 188, 168, 0.15), rgba(45, 188, 168, 0.5), rgba(45, 188, 168, 0.15));
}

.senate-cell:first-child::before { left: 50%; }
.senate-cell:last-child::before  { right: 50%; }

/* Vertical drop */
.senate-cell::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 18px;
  width: 1px;
  background: rgba(45, 188, 168, 0.4);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(45, 188, 168, 0.2);
}

/* ══════════════════════════════════════════
   MOBILE
   ══════════════════════════════════════════ */
@media (max-width: 768px) {
  .chart-canvas {
    min-width: 1100px;
  }

  .exec-row-three {
    grid-template-columns: repeat(3, 1fr);
  }

  .exec-row-two {
    grid-template-columns: repeat(2, 1fr);
  }

  .senate-row {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
