// Shared by the Expo app and the web panel. Field rules from the scope:
// touch targets ≥ 48 px, body text ≥ 16 px, readable outdoors in sunlight.

export const colors = {
  primary: '#C2410C', // brick orange
  primaryDark: '#9A3412',
  primarySoft: '#FFF1E7',
  primaryText: '#FFFFFF',
  ink: '#1C1917',
  muted: '#57534E',
  faint: '#A8A29E',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F3EF',
  background: '#F7F4EF',
  border: '#E7E2DA',
  success: '#15803D',
  successSoft: '#E8F5EC',
  warning: '#B45309',
  warningSoft: '#FEF3E2',
  danger: '#B91C1C',
  dangerSoft: '#FDECEC',
  info: '#1D4ED8',
  infoSoft: '#EAF0FD',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  body: 16,
  label: 14,
  title: 20,
  heading: 24,
  number: 32, // stepper counts
} as const;

export const touch = { minTarget: 48, stepperButton: 56 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** One soft shadow for raised surfaces (cards, header, footer); Android uses elevation. */
export const shadow = {
  shadowColor: '#3B2A1A',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;
