import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, shadow, spacing, touch, type } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../lib/i18n';

// Field UI: big targets (≥ 48 px), 16 px+ text, steppers and chips instead of typing.
// One look everywhere: soft raised cards on a warm background, icons in tinted circles, brick-orange actions.

/** Android's font-size setting can make text up to 2× bigger; past 1.2× steppers, headers and buttons collide. */
const MAX_FONT_SCALE = 1.2;

/** Use this instead of react-native's Text everywhere, so a phone's large-font setting cannot break a layout. */
export function Text(props: TextProps) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

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

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}

/**
 * Android draws edge to edge: the header's white runs up under the status bar and the footer's down under the
 * navigation bar, so there is no strip of background above or below them.
 * `onTitlePress` makes the title a switch (the site name on the home opens the site list).
 */
export function Screen({ title, subtitle, children, footer, back = true, right, scroll = true, onTitlePress }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; back?: boolean; right?: ReactNode; scroll?: boolean; onTitlePress?: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  const bottom = keyboard ? 0 : insets.bottom;
  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm, paddingLeft: insets.left + (back ? spacing.xs : spacing.lg), paddingRight: insets.right + spacing.sm }]}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={({ pressed }) => [s.headerBtn, pressed && { backgroundColor: colors.surfaceAlt }]} hitSlop={4}>
            <Icon name="arrow-left" size={24} />
          </Pressable>
        ) : null}
        <Pressable disabled={!onTitlePress} onPress={onTitlePress} accessibilityRole={onTitlePress ? 'button' : undefined} style={s.headerTitle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={s.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
            {onTitlePress ? <Icon name="chevron-down" size={22} color={colors.muted} /> : null}
          </View>
          {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </Pressable>
        {right ? <View style={s.headerRight}>{right}</View> : null}
      </View>
      {/* Android draws edge to edge, so the window no longer shrinks for the keyboard: pad on both platforms. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView contentContainerStyle={[s.body, { paddingLeft: spacing.lg + insets.left, paddingRight: spacing.lg + insets.right }, !footer && { paddingBottom: spacing.xxl + bottom }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        ) : <View style={[s.body, { flex: 1, paddingBottom: footer ? spacing.lg : spacing.lg + bottom }]}>{children}</View>}
        {footer ? <View style={[s.footer, { paddingBottom: spacing.md + bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/** A round icon button for the header's right side (bell, profile). */
export function HeaderButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [s.headerBtn, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <Icon name={icon} size={24} />
      {badge ? (
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
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
  const fg = selected ? colors.primaryDark : toneColor ?? colors.ink;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipSelected, toneColor && !selected && { borderColor: toneColor, backgroundColor: colors.surface }, pressed && s.pressed]}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={[s.chipText, { color: fg }, selected && { fontWeight: '700' }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

/** A status word in a small tinted capsule (waiting, approved): read, not pressed. */
export function Pill({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  return (
    <View style={[s.pill, { backgroundColor: TONES[tone].soft }]}>
      <Text style={[s.pillText, { color: TONES[tone].fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T | null | undefined; onChange: (v: T) => void; style?: ViewStyle }) {
  return (
    <View style={[s.chips, style]}>
      {options.map((o) => <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />)}
    </View>
  );
}

/** Two to four views of the same screen (this week / last week, in / out): one row, equal parts, never wraps. */
export function Segmented<T extends string>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; style?: ViewStyle }) {
  return (
    <View style={[s.segTrack, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={[s.seg, on && s.segOn]}>
            <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{o.label}</Text>
          </Pressable>
        );
      })}
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
        // Grows with the number (2500 kg must never show as "500"); long numbers get a smaller size.
        style={[s.stepValue, { width: Math.max(68, String(value).length * 16 + 28) }, String(value).length > 4 && { fontSize: 22 }]}
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
        <Text style={s.diaryText} numberOfLines={3}>{text}</Text>
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
export function ListRow({ icon, tone = 'primary', title, detail, value, valueTone, onPress, last }: { icon?: IconName; tone?: Tone; title: string; detail?: string; value?: string; valueTone?: Tone; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.listRow, !last && s.listRowLine, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {icon ? <IconBadge name={icon} tone={tone} size={38} /> : null}
      {/* Only the title shares its line with the value; the detail runs the full width under both. */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Text style={[s.listTitle, { flex: 1 }]} numberOfLines={3}>{title}</Text>
          {value ? <Text style={[s.listValue, valueTone && { color: TONES[valueTone].fg }]} numberOfLines={1}>{value}</Text> : null}
        </View>
        {detail ? <Text style={s.small} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={24} color={colors.faint} /> : null}
    </Pressable>
  );
}

/** Money totals as rows (label left, amount right): lakhs and crores never get cut off the way three boxes do. */
export function Totals({ rows }: { rows: { label: string; value: string; tone?: Tone; bold?: boolean; onPress?: () => void }[] }) {
  return (
    <Card style={flush}>
      {rows.map((r, i) => (
        <Pressable key={r.label} disabled={!r.onPress} onPress={r.onPress} style={({ pressed }) => [s.totalRow, i > 0 && s.totalLine, pressed && { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[s.text, { flex: 1, color: colors.muted, fontWeight: '600' }]}>{r.label}</Text>
          <Text style={[r.bold ? s.totalBig : s.totalValue, r.tone ? { color: TONES[r.tone].fg } : null]} numberOfLines={1}>{r.value}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

/** A number with what it counts, for the top of a dashboard. */
export function Stat({ value, label, tone, onPress }: { value: string | number; label: string; tone?: Tone; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.stat, pressed && s.pressed]}>
      {/* Long amounts (₹1,25,000) get a smaller size so they never cut off on a small phone. */}
      <Text style={[s.statValue, String(value).length > 6 && { fontSize: String(value).length > 9 ? 17 : 20 }, tone ? { color: TONES[tone].fg } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={3}>{label}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingBottom: spacing.sm, gap: spacing.xs, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, zIndex: 1 },
  headerTitle: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 44, paddingRight: spacing.xs },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  headerBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headerBadge: { position: 'absolute', top: 5, right: 4, minWidth: 18, height: 18, borderRadius: radius.pill, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.surface },
  headerBadgeText: { color: colors.primaryText, fontSize: 10, fontWeight: '800' },
  title: { flexShrink: 1, fontSize: 19, lineHeight: 26, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.muted },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  button: { minHeight: touch.stepperButton, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonSecondary: { borderWidth: 1, borderColor: '#D9D2C7' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, maxWidth: '100%' },
  buttonSmall: { minHeight: touch.minTarget, paddingHorizontal: spacing.md },
  buttonText: { flexShrink: 1, fontSize: 17, fontWeight: '700' },
  tile: { flexBasis: '47%', flexGrow: 1, maxWidth: '50%', minHeight: 124, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, justifyContent: 'flex-start', ...shadow, borderWidth: 1.5 },
  tileLabel: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.ink },
  tileHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileHint: { fontSize: type.label, color: colors.muted, fontWeight: '600' },
  tileCompact: { flexBasis: '47%', flexGrow: 1, maxWidth: '50%', minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...shadow },
  tileCompactLabel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.ink },
  badge: { position: 'absolute', top: spacing.md, right: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, minWidth: 24, height: 24, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeInline: { backgroundColor: colors.primary, borderRadius: radius.pill, minWidth: 24, height: 24, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.primaryText, fontWeight: '800', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { maxWidth: '100%', minHeight: touch.minTarget, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: '#D9D2C7', backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1.5 },
  chipText: { flexShrink: 1, fontSize: type.body, color: colors.ink, fontWeight: '500' },
  pill: { flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 13, fontWeight: '700' },
  segTrack: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.md, backgroundColor: '#EFEAE2' },
  seg: { flex: 1, minHeight: 44, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  segOn: { backgroundColor: colors.surface, shadowColor: '#3B2A1A', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  segTextOn: { color: colors.ink, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: 52, height: touch.stepperButton, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnPlus: { backgroundColor: colors.primarySoft },
  stepSign: { fontSize: 28, fontWeight: '700', color: colors.ink },
  dayBtn: { width: touch.minTarget, height: touch.minTarget, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  callBtn: { minHeight: touch.minTarget, flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  callText: { fontSize: type.body, color: colors.success, fontWeight: '700' },
  stepValue: { width: 68, height: touch.stepperButton, textAlign: 'center', fontSize: type.number - 4, fontWeight: '800', color: colors.ink, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  field: { gap: spacing.sm },
  askBlock: { gap: spacing.sm },
  label: { fontSize: type.label, fontWeight: '700', color: colors.muted },
  ask: { fontSize: 18, lineHeight: 25, fontWeight: '700', color: colors.ink },
  optional: { fontSize: type.label, fontWeight: '600', color: colors.faint },
  diary: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  diaryLabel: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  diaryText: { fontSize: type.body, lineHeight: 22, fontWeight: '600', color: colors.ink },
  hint: { fontSize: type.label, color: colors.muted },
  input: { minHeight: touch.stepperButton, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: type.body, color: colors.ink, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -spacing.xs, marginTop: spacing.xs },
  sectionTitle: { fontSize: type.label, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  sectionAction: { fontSize: type.label, fontWeight: '700', color: colors.primary },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  listRowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  listTitle: { fontSize: type.body, lineHeight: 22, fontWeight: '600', color: colors.ink },
  listValue: { flexShrink: 0, maxWidth: '55%', textAlign: 'right', fontSize: type.body, lineHeight: 22, fontWeight: '700', color: colors.ink },
  stat: { flex: 1, minHeight: 92, justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: spacing.xs, ...shadow },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 13, lineHeight: 18, color: colors.muted, fontWeight: '500' },
  h1: { fontSize: 22, lineHeight: 30, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.ink },
  text: { fontSize: type.body, color: colors.ink, lineHeight: 23 },
  small: { fontSize: type.label, color: colors.muted, lineHeight: 20 },
  big: { fontSize: 28, lineHeight: 36, fontWeight: '800', color: colors.ink },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  totalValue: { fontSize: 17, fontWeight: '700', color: colors.ink },
  totalBig: { fontSize: 24, fontWeight: '800', color: colors.ink },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  bannerText: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 21 },
});

/** Cards that hold ListRows edge to edge. */
export const flush: ViewStyle = { padding: 0, gap: 0, overflow: 'hidden' };
