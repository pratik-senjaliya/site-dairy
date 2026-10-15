import { colors, radius, spacing, touch, type } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Field UI: big targets (≥ 48 px), 16 px+ text, steppers and chips instead of typing.

export function Screen({ title, children, footer, back = true, right, scroll = true }: { title: string; children: ReactNode; footer?: ReactNode; back?: boolean; right?: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.header}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={s.back} hitSlop={8}>
            <Text style={s.backText}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={s.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {right}
      </View>
      {scroll ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[s.body, { flex: 1 }]}>{children}</View>}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled, busy, style, small }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; busy?: boolean; style?: ViewStyle; small?: boolean }) {
  const bg = { primary: colors.primary, secondary: colors.surface, danger: colors.danger, ghost: 'transparent' }[kind];
  const fg = kind === 'primary' || kind === 'danger' ? colors.primaryText : kind === 'ghost' ? colors.primary : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [s.button, small && s.buttonSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, borderWidth: kind === 'secondary' ? 1 : 0 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, small && { fontSize: type.label }, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Tile({ label, hint, onPress, badge, tone }: { label: string; hint?: string; onPress: () => void; badge?: string | number; tone?: 'warn' | 'ok' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.tile, tone === 'warn' && { borderColor: colors.warning, borderWidth: 2 }, tone === 'ok' && { borderColor: colors.success }, pressed && { opacity: 0.85 }]}>
      <Text style={s.tileLabel}>{label}</Text>
      {hint ? <Text style={s.tileHint} numberOfLines={2}>{hint}</Text> : null}
      {badge !== undefined && badge !== 0 && badge !== '' ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'warn' | 'ok' | 'muted' }) {
  const toneColor = tone === 'warn' ? colors.warning : tone === 'ok' ? colors.success : tone === 'muted' ? colors.muted : null;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={[s.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }, toneColor && !selected && { borderColor: toneColor }]}
    >
      <Text style={[s.chipText, selected && { color: colors.primaryText }, toneColor && !selected && { color: toneColor }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null | undefined; onChange: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {options.map((o) => <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />)}
    </View>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, label, decimals = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label?: string; decimals?: number }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 10 ** decimals) / 10 ** decimals)));
  return (
    <View style={s.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? ''} minus`} onPress={() => set(value - step)} style={s.stepBtn}><Text style={s.stepSign}>−</Text></Pressable>
      <TextInput
        accessibilityLabel={label}
        style={s.stepValue}
        keyboardType="decimal-pad"
        value={String(value)}
        onChangeText={(txt) => {
          const n = Number(txt.replace(/[^\d.]/g, ''));
          if (!Number.isNaN(n)) set(n);
        }}
        selectTextOnFocus
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? ''} plus`} onPress={() => set(value + step)} style={s.stepBtn}><Text style={s.stepSign}>+</Text></Pressable>
    </View>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[s.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, props.style]} />;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

export const T = {
  h2: (props: { children: ReactNode }) => <Text style={s.h2} accessibilityRole="header">{props.children}</Text>,
  body: (props: { children: ReactNode; muted?: boolean; bold?: boolean; color?: string }) => <Text style={[s.text, props.muted && { color: colors.muted }, props.bold && { fontWeight: '700' }, props.color ? { color: props.color } : null]}>{props.children}</Text>,
  small: (props: { children: ReactNode; color?: string }) => <Text style={[s.small, props.color ? { color: props.color } : null]}>{props.children}</Text>,
  big: (props: { children: ReactNode; color?: string }) => <Text style={[s.big, props.color ? { color: props.color } : null]}>{props.children}</Text>,
};

export function Empty({ text }: { text: string }) {
  return <View style={s.empty}><Text style={[s.text, { color: colors.muted, textAlign: 'center' }]}>{text}</Text></View>;
}

export function Banner({ text, tone = 'warn', onPress }: { text: string; tone?: 'warn' | 'error' | 'ok' | 'info'; onPress?: () => void }) {
  const c = { warn: colors.warning, error: colors.danger, ok: colors.success, info: colors.info }[tone];
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[s.banner, { borderLeftColor: c }]}>
      <Text style={[s.text, { color: c, fontWeight: '600' }]}>{text}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  back: { width: touch.minTarget, height: touch.minTarget, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.md },
  backText: { fontSize: 36, color: colors.ink, lineHeight: 40 },
  title: { flex: 1, fontSize: type.title, fontWeight: '700', color: colors.ink },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm },
  button: { minHeight: touch.stepperButton, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderColor: colors.border },
  buttonSmall: { minHeight: touch.minTarget, paddingHorizontal: spacing.md },
  buttonText: { fontSize: 18, fontWeight: '700' },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 104, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, justifyContent: 'center' },
  tileLabel: { fontSize: type.title, fontWeight: '700', color: colors.ink },
  tileHint: { fontSize: type.label, color: colors.muted, marginTop: spacing.xs },
  badge: { position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: colors.primary, borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: touch.minTarget, paddingHorizontal: spacing.lg, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: type.body, color: colors.ink, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: touch.stepperButton, height: touch.stepperButton, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepSign: { fontSize: 28, fontWeight: '700', color: colors.ink },
  stepValue: { width: 76, height: touch.stepperButton, textAlign: 'center', fontSize: type.number, fontWeight: '700', color: colors.ink, borderRadius: radius.md, backgroundColor: colors.surface },
  field: { gap: spacing.sm },
  label: { fontSize: type.label, fontWeight: '700', color: colors.muted },
  hint: { fontSize: type.label, color: colors.muted },
  input: { minHeight: touch.stepperButton, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: type.body, color: colors.ink, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  h2: { fontSize: type.title, fontWeight: '700', color: colors.ink },
  text: { fontSize: type.body, color: colors.ink },
  small: { fontSize: type.label, color: colors.muted },
  big: { fontSize: type.heading + 4, fontWeight: '800', color: colors.ink },
  empty: { padding: spacing.xl },
  banner: { backgroundColor: colors.surface, borderLeftWidth: 4, borderRadius: radius.sm, padding: spacing.md },
});
