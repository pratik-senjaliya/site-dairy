// Shared by the Expo app and the web panel. Field rules from the scope:
// touch targets ≥ 48 px, body text ≥ 16 px, readable outdoors in sunlight.

export const colors = {
  primary: '#C2410C', // brick orange
  primaryText: '#FFFFFF',
  ink: '#1C1917',
  muted: '#57534E',
  surface: '#FFFFFF',
  background: '#FAF7F2',
  border: '#E7E5E4',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#1D4ED8',
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

export const radius = { sm: 6, md: 10, lg: 16 } as const;
