<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name?: string
  designation: string
  email?: string
  photo?: string
  initials: string
  variant: 'institutional' | 'pivot' | 'executive' | 'committee' | 'senate'
  showEmail?: boolean
  flagged?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showEmail: undefined,
  flagged: false
})

// Determine whether email should be shown based on variant and prop override
const shouldShowEmail = computed(() => {
  if (props.showEmail !== undefined) {
    return props.showEmail
  }
  // Default tier visibility rules:
  // - executive (USC President/VP) and committee (Treasurer, etc.) show email
  // - institutional, pivot, and senate do NOT show email
  return props.variant === 'executive' || props.variant === 'committee'
})

const variantClass = computed(() => {
  return `card-${props.variant}`
})
</script>

<template>
  <div class="officer-card" :class="[variantClass, { 'card-flagged': flagged }]">
    <!-- Avatar Section -->
    <div class="avatar-wrap">
      <img
        v-if="photo"
        :src="photo"
        :alt="name || designation"
        class="avatar-img"
      />
      <div v-else class="avatar-fallback">
        {{ initials }}
      </div>
    </div>

    <!-- Info Section -->
    <div class="info-wrap">
      <span v-if="flagged" class="info-name name-flagged">Name to confirm</span>
      <span v-else-if="name" class="info-name">{{ name }}</span>
      
      <span class="info-designation">{{ designation }}</span>
      
      <div v-if="shouldShowEmail && email" class="info-email">
        <svg class="email-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
        <span class="email-text">{{ email }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE CARD STYLES (Desktop - Horizontal Layout)
   ══════════════════════════════════════════ */
.officer-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.875rem;
  border-radius: 0.75rem;
  padding: 0.875rem 1rem;
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.2s ease,
              background 0.2s ease;
  box-sizing: border-box;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.officer-card:hover {
  transform: translateY(-3px);
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Avatar base styles (Square with rounded corners) */
.avatar-wrap {
  width: var(--avatar-size, 48px);
  height: var(--avatar-size, 48px);
  border-radius: 0.5rem;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 800;
  font-size: var(--avatar-font-size, 1rem);
  text-transform: uppercase;
  color: var(--avatar-color, rgba(255, 255, 255, 0.8));
  background: var(--avatar-bg, rgba(255, 255, 255, 0.08));
}

/* Info wrap layout */
.info-wrap {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0; /* allows text truncation/wrap inside flex items */
  flex-grow: 1;
}

.info-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-designation {
  font-size: 0.725rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 0.15rem;
  line-height: 1.2;
}

/* Email styles */
.info-email {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.375rem;
  font-size: 0.625rem;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.4);
  min-width: 0;
}

.email-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.email-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ══════════════════════════════════════════
   VARIANT STYLES
   ══════════════════════════════════════════ */

/* Tier 1: Institutional Oversight */
.card-institutional {
  width: 100%;
  max-width: 230px;
  background: rgba(12, 27, 54, 0.4);
  border-color: rgba(30, 74, 158, 0.3);
  --avatar-size: 44px;
  --avatar-font-size: 0.95rem;
  --avatar-bg: rgba(255, 255, 255, 0.05);
  --avatar-color: rgba(200, 210, 230, 0.75);
}

.card-institutional .info-name {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.8125rem;
}

.card-institutional .info-designation {
  color: rgba(201, 162, 75, 0.75);
  font-size: 0.7rem;
}

.card-institutional:hover {
  border-color: rgba(30, 74, 158, 0.6);
}

/* Tier 2: Pivot Points (Solid Navy Fill) */
.card-pivot {
  width: 100%;
  max-width: 230px;
  background: #142850;
  border-color: rgba(201, 162, 75, 0.35);
  --avatar-size: 44px;
  --avatar-font-size: 0.95rem;
  --avatar-bg: rgba(201, 162, 75, 0.15);
  --avatar-color: #e4cd8e;
}

.card-pivot .info-name {
  color: #ffffff;
  font-size: 0.8125rem;
}

.card-pivot .info-designation {
  color: #e4cd8e;
  font-size: 0.7rem;
}

.card-pivot:hover {
  border-color: rgba(201, 162, 75, 0.6);
  background: #193163;
}

/* Tier 3: USC President & Vice President (Gold Gradient) */
.card-executive {
  width: 100%;
  max-width: 290px;
  background: linear-gradient(135deg, #c9a24b 0%, #e4cd8e 50%, #8a6d2f 100%);
  border-color: rgba(255, 255, 255, 0.25);
  --avatar-size: 56px;
  --avatar-font-size: 1.15rem;
  --avatar-bg: rgba(12, 27, 54, 0.5);
  --avatar-color: #f0d880;
}

.card-executive .info-name {
  color: #0c1b36;
  font-size: 0.95rem;
  font-weight: 800;
}

.card-executive .info-designation {
  color: rgba(12, 27, 54, 0.85);
  font-size: 0.75rem;
  font-weight: 700;
}

.card-executive .info-email {
  color: rgba(12, 27, 54, 0.65);
}

.card-executive:hover {
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow: 
    0 12px 32px rgba(201, 162, 75, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

/* Tier 4: Committee Heads (White background, navy border) */
.card-committee {
  width: 100%;
  max-width: 250px;
  background: #ffffff;
  border-color: #142850;
  --avatar-size: 48px;
  --avatar-font-size: 1.05rem;
  --avatar-bg: rgba(20, 40, 80, 0.1);
  --avatar-color: #142850;
}

.card-committee .info-name {
  color: #1b1b1d;
  font-size: 0.875rem;
}

.card-committee .info-designation {
  color: #1e4a9e;
  font-size: 0.725rem;
  font-weight: 700;
}

.card-committee .info-email {
  color: #5c6773;
}

.card-committee:hover {
  background: #f7f5f0;
  border-color: #1e4a9e;
}

/* Tier 5: Student Senate (Smallest variant) */
.card-senate {
  width: 100%;
  max-width: 155px;
  background: rgba(20, 60, 55, 0.2);
  border-color: rgba(45, 188, 168, 0.2);
  padding: 0.625rem 0.75rem;
  --avatar-size: 36px;
  --avatar-font-size: 0.8rem;
  --avatar-bg: rgba(45, 188, 168, 0.1);
  --avatar-color: rgba(80, 220, 200, 0.85);
}

.card-senate .info-name {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.75rem;
}

.card-senate .info-designation {
  color: rgba(80, 220, 200, 0.7);
  font-size: 0.65rem;
}

.card-senate:hover {
  border-color: rgba(45, 188, 168, 0.45);
  background: rgba(20, 60, 55, 0.35);
}

/* ══════════════════════════════════════════
   FLAGGED STYLING (Unconfirmed Names)
   ══════════════════════════════════════════ */
.card-flagged {
  border: 1px dashed rgba(239, 68, 68, 0.4) !important;
  background: rgba(239, 68, 68, 0.04) !important;
  --avatar-bg: rgba(239, 68, 68, 0.08) !important;
  --avatar-color: rgba(239, 68, 68, 0.85) !important;
}

.card-flagged:hover {
  border-color: rgba(239, 68, 68, 0.7) !important;
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.1) !important;
}

.name-flagged {
  color: rgba(239, 68, 68, 0.85) !important;
  font-style: italic;
}

/* ══════════════════════════════════════════
   MOBILE LAYOUT (Keep Existing Style/Layout)
   ══════════════════════════════════════════ */
@media (max-width: 768px) {
  .officer-card {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 0.75rem 0.5rem !important;
    width: auto !important;
    max-width: 100% !important;
    min-width: 0 !important;
    border-radius: 0.625rem;
  }

  .avatar-wrap {
    width: 2rem !important;
    height: 2rem !important;
    --avatar-size: 2rem !important;
  }
  
  .avatar-fallback {
    font-size: 0.7rem !important;
  }

  .info-wrap {
    align-items: center;
    width: 100%;
  }

  .info-name {
    font-size: 0.6rem !important;
    text-align: center;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .info-designation {
    font-size: 0.5rem !important;
    margin-top: 0.2rem;
  }

  .info-email {
    display: none !important; /* Never show email on mobile cards per specs */
  }

  /* Reset hover translation slightly to scale properly on mobile */
  .officer-card:hover {
    transform: none;
  }
}
</style>
