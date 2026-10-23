import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, shadow, spacing, touch, type } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../lib/i18n';

// Field UI: big targets (≥ 48 px), 16 px+ text, steppers and chips instead of typing.
// One look everywhere: soft raised cards on a warm background, icons in tinted circles, brick-orange actions.

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  // Decoration only: the text beside it says what it is, so screen readers skip the glyph.
  return <MaterialCommunityIcons name={name} size={size} color={color} aria-hidden accessibilityElementsHidden importantForAccessibility="no" />;
}

/** An icon in a tinted circle: the mark of a section, tile or list row. */
export function IconBadge({ name, tone = 'primary', size = 40 }: { name: IconName; tone?: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.55)} color={t.fg} />
    </View>
  );
}

export type Tone = 'primary' | 'ok' | 'warn' | 'danger' | 'info' | 'muted';
const TONES: Record<Tone, { fg: string; soft: string }> = {
  primary: { fg: colors.primary, soft: colors.primarySoft },
  ok: { fg: colors.success, soft: colors.successSoft },
  warn: { fg: colors.warning, soft: colors.warningSoft },
  danger: { fg: colors.danger, soft: colors.dangerSoft },
  info: { fg: colors.info, soft: colors.infoSoft },
  muted: { fg: colors.muted, soft: colors.surfaceAlt },
};

export function Screen({ title, subtitle, children, footer, back = true, right, scroll = true }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; back?: boolean; right?: ReactNode; scroll?: boolean }) {
  const t = useT();
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.header}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={s.back} hitSlop={8}>
            <Icon name="arrow-left" size={26} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {scroll ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[s.body, { flex: 1 }]}>{children}</View>}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled, busy, style, small, icon }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'; disabled?: boolean; busy?: boolean; style?: ViewStyle; small?: boolean; icon?: IconName }) {
  const bg = { primary: colors.primary, secondary: colors.surface, danger: colors.danger, ghost: 'transparent', success: colors.success }[kind];
  const fg = kind === 'secondary' ? colors.ink : kind === 'ghost' ? colors.primary : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [s.button, small && s.buttonSmall, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }, kind === 'secondary' && s.buttonSecondary, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <View style={s.buttonInner}>
          {icon ? <Icon name={icon} size={small ? 18 : 22} color={fg} /> : null}
          <Text style={[s.buttonText, small && { fontSize: type.body }, { color: fg }]} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A home action. Big: icon above a two-line label (main daily jobs). Compact: one row (everything else). */
export function Tile({ label, hint, onPress, badge, tone, compact, icon }: { label: string; hint?: string; onPress: () => void; badge?: string | number; tone?: 'warn' | 'ok'; compact?: boolean; icon?: IconName }) {
  const iconTone: Tone = tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'primary';
  const showBadge = badge !== undefined && badge !== 0 && badge !== '';
  if (compact) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.tileCompact, pressed && s.pressed]}>
        {icon ? <IconBadge name={icon} tone={iconTone} size={36} /> : null}
        <Text style={s.tileCompactLabel} numberOfLines={2}>{label}</Text>
        {showBadge ? <View style={s.badgeInline}><Text style={s.badgeText}>{badge}</Text></View> : null}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.tile, tone === 'warn' && { borderColor: colors.warning }, tone === 'ok' && { borderColor: colors.success }, pressed && s.pressed]}>
      {icon ? <IconBadge name={icon} tone={iconTone} size={44} /> : null}
      <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
      {hint ? (
        <View style={s.tileHintRow}>
          {tone ? <Icon name={tone === 'ok' ? 'check-circle' : 'clock-outline'} size={15} color={tone === 'ok' ? colors.success : colors.warning} /> : null}
          <Text style={[s.tileHint, tone === 'ok' && { color: colors.success }, tone === 'warn' && { color: colors.warning }]} numberOfLines={1}>{hint}</Text>
        </View>
      ) : null}
      {showBadge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, tone, icon }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'warn' | 'ok' | 'muted'; icon?: IconName }) {
  const toneColor = tone === 'warn' ? colors.warning : tone === 'ok' ? colors.success : tone === 'muted' ? colors.faint : null;
  const fg = selected ? colors.primaryText : toneColor ?? colors.ink;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipSelected, toneColor && !selected && { borderColor: toneColor, backgroundColor: colors.surface }, pressed && s.pressed]}
    >
      {selected ? <Icon name="check" size={16} color={fg} /> : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
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
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? ''} minus`} onPress={() => set(value - step)} style={({ pressed }) => [s.stepBtn, pressed && s.pressed]}><Icon name="minus" size={26} /></Pressable>
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
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? ''} plus`} onPress={() => set(value + step)} style={({ pressed }) => [s.stepBtn, s.stepBtnPlus, pressed && s.pressed]}><Icon name="plus" size={26} color={colors.primary} /></Pressable>
    </View>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      {children}
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** One question of an entry screen, asked the way the diary would ("કયો માલ વપરાયો?"). */
export function Ask({ q, hint, optional, children }: { q: string; hint?: string; optional?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <View style={s.askBlock}>
      <Text style={s.ask} accessibilityRole="header">{q}{optional ? <Text style={s.optional}>  {t('common.optional')}</Text> : null}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

/** Above the save button: the entry as one diary sentence, so the person sees exactly what is being noted. */
export function DiaryLine({ text }: { text: string }) {
  const t = useT();
  return (
    <View style={s.diary}>
      <Icon name="notebook-edit-outline" size={22} color={colors.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.diaryLabel}>{t('common.willSave')}</Text>
        <Text style={s.diaryText}>{text}</Text>
      </View>
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[s.input, props.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.md }, props.style]} />;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && s.pressed]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

/** A small heading over a group of cards or tiles, with an optional action on the right. */
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
      {action && onAction ? <Pressable onPress={onAction} hitSlop={10}><Text style={s.sectionAction}>{action}</Text></Pressable> : null}
    </View>
  );
}

/** A settings-style row: icon, title and detail, a value or a chevron. Stack them inside a Card with `flush`. */
export function ListRow({ icon, tone = 'primary', title, detail, value, onPress, last }: { icon?: IconName; tone?: Tone; title: string; detail?: string; value?: string; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.listRow, !last && s.listRowLine, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {icon ? <IconBadge name={icon} tone={tone} size={38} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.listTitle} numberOfLines={4}>{title}</Text>
        {detail ? <Text style={s.small} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {value ? <Text style={s.listValue}>{value}</Text> : null}
      {onPress ? <Icon name="chevron-right" size={24} color={colors.faint} /> : null}
    </Pressable>
  );
}

/** A number with what it counts, for the top of a dashboard. */
export function Stat({ value, label, tone, onPress }: { value: string | number; label: string; tone?: Tone; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.stat, pressed && s.pressed]}>
      {/* Long amounts (₹1,25,000) get a smaller size so they never cut off on a small phone. */}
      <Text style={[s.statValue, String(value).length > 6 && { fontSize: String(value).length > 9 ? 17 : 20 }, tone ? { color: TONES[tone].fg } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export const T = {
  h1: (props: { children: ReactNode; color?: string }) => <Text style={[s.h1, props.color ? { color: props.color } : null]} accessibilityRole="header">{props.children}</Text>,
  h2: (props: { children: ReactNode; color?: string }) => <Text style={[s.h2, props.color ? { color: props.color } : null]} accessibilityRole="header">{props.children}</Text>,
  body: (props: { children: ReactNode; muted?: boolean; bold?: boolean; color?: string }) => <Text style={[s.text, props.muted && { color: colors.muted }, props.bold && { fontWeight: '700' }, props.color ? { color: props.color } : null]}>{props.children}</Text>,
  small: (props: { children: ReactNode; color?: string; bold?: boolean }) => <Text style={[s.small, props.bold && { fontWeight: '700' }, props.color ? { color: props.color } : null]}>{props.children}</Text>,
  big: (props: { children: ReactNode; color?: string }) => <Text style={[s.big, props.color ? { color: props.color } : null]}>{props.children}</Text>,
};

export function Empty({ text, icon = 'notebook-outline', action, onAction }: { text: string; icon?: IconName; action?: string; onAction?: () => void }) {
  return (
    <View style={s.empty}>
      <IconBadge name={icon} tone="muted" size={56} />
      <Text style={[s.text, { color: colors.muted, textAlign: 'center' }]}>{text}</Text>
      {action && onAction ? <Button small kind="secondary" label={action} onPress={onAction} /> : null}
    </View>
  );
}

export function Banner({ text, tone = 'warn', onPress }: { text: string; tone?: 'warn' | 'error' | 'ok' | 'info'; onPress?: () => void }) {
  const tn: Tone = tone === 'error' ? 'danger' : tone;
  const icon: IconName = { warn: 'alert-circle-outline', error: 'alert-octagon-outline', ok: 'check-circle-outline', info: 'information-outline' }[tone] as IconName;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[s.banner, { backgroundColor: TONES[tn].soft }]}>
      <Icon name={icon} size={22} color={TONES[tn].fg} />
      <Text style={[s.bannerText, { color: TONES[tn].fg }]}>{text}</Text>
      {onPress ? <Icon name="chevron-right" size={20} color={TONES[tn].fg} /> : null}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 60, gap: spacing.sm, backgroundColor: colors.surface, ...shadow, zIndex: 1 },
  back: { width: touch.minTarget, height: touch.minTarget, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.md, borderRadius: radius.pill },
  title: { fontSize: type.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: type.label, color: colors.muted, marginTop: 1 },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface, gap: spacing.sm, ...shadow, shadowOffset: { width: 0, height: -3 } },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  button: { minHeight: touch.stepperButton, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonSecondary: { borderWidth: 1.5, borderColor: colors.border },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonSmall: { minHeight: touch.minTarget, paddingHorizontal: spacing.md },
  buttonText: { fontSize: 18, fontWeight: '700' },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 132, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: 'transparent', padding: spacing.lg, gap: spacing.sm, justifyContent: 'flex-start', ...shadow },
  tileLabel: { fontSize: 18, fontWeight: '800', color: colors.ink },
  tileHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileHint: { fontSize: type.label, color: colors.muted, fontWeight: '600' },
  tileCompact: { flexBasis: '47%', flexGrow: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...shadow },
  tileCompactLabel: { flex: 1, fontSize: type.body, fontWeight: '700', color: colors.ink },
  badge: { position: 'absolute', top: spacing.md, right: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, minWidth: 24, height: 24, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeInline: { backgroundColor: colors.primary, borderRadius: radius.pill, minWidth: 24, height: 24, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.primaryText, fontWeight: '800', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: touch.minTarget, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: type.body, color: colors.ink, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: touch.stepperButton, height: touch.stepperButton, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnPlus: { backgroundColor: colors.primarySoft },
  stepSign: { fontSize: 28, fontWeight: '700', color: colors.ink },
  dayBtn: { width: touch.minTarget, height: touch.minTarget, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  callBtn: { minHeight: touch.minTarget, flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  callText: { fontSize: type.body, color: colors.primaryText, fontWeight: '700' },
  stepValue: { width: 76, height: touch.stepperButton, textAlign: 'center', fontSize: type.number - 4, fontWeight: '800', color: colors.ink, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  field: { gap: spacing.sm },
  askBlock: { gap: spacing.sm },
  label: { fontSize: type.label, fontWeight: '700', color: colors.muted },
  ask: { fontSize: 18, fontWeight: '800', color: colors.ink },
  optional: { fontSize: type.label, fontWeight: '600', color: colors.faint },
  diary: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md },
  diaryLabel: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  diaryText: { fontSize: type.body + 1, fontWeight: '700', color: colors.ink },
  hint: { fontSize: type.label, color: colors.muted },
  input: { minHeight: touch.stepperButton, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: type.body, color: colors.ink, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -spacing.xs, marginTop: spacing.xs },
  sectionTitle: { fontSize: type.label, fontWeight: '800', color: colors.muted, letterSpacing: 0.3 },
  sectionAction: { fontSize: type.label, fontWeight: '800', color: colors.primary },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  listRowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  listTitle: { fontSize: type.body, fontWeight: '700', color: colors.ink },
  listValue: { fontSize: type.body, fontWeight: '700', color: colors.ink },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: 2, ...shadow },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  h1: { fontSize: type.heading, fontWeight: '800', color: colors.ink },
  h2: { fontSize: 18, fontWeight: '800', color: colors.ink },
  text: { fontSize: type.body, color: colors.ink, lineHeight: 23 },
  small: { fontSize: type.label, color: colors.muted, lineHeight: 20 },
  big: { fontSize: 30, fontWeight: '800', color: colors.ink },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  bannerText: { flex: 1, fontSize: type.body, fontWeight: '600', lineHeight: 22 },
});

/** Cards that hold ListRows edge to edge. */
export const flush: ViewStyle = { padding: 0, gap: 0, overflow: 'hidden' };
