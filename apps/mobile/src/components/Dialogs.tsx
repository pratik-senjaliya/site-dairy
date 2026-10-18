import { colors, radius, spacing } from '@site-diary/ui-tokens';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from './ui';

// On the web (and inside sandboxed pages) alert() and confirm() may do nothing, so the app draws its own:
// a toast that fades for "Saved", and a dialog with two buttons for questions.

type Toast = { id: number; title: string; message?: string };
type Ask = { title: string; message: string; ok: string; cancel: string; resolve: (v: boolean) => void };
let pushToast: (t: Omit<Toast, 'id'>) => void = () => {};
let pushAsk: (a: Ask) => void = () => {};

export const showToast = (title: string, message?: string) => pushToast({ title, message });
export const askConfirm = (title: string, message: string, ok: string, cancel: string) =>
  new Promise<boolean>((resolve) => pushAsk({ title, message, ok, cancel, resolve }));

export function DialogHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    let n = 0;
    pushToast = (t) => {
      const id = ++n;
      setToasts((x) => [...x, { ...t, id }]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.message && t.message.length > 80 ? 8000 : 2600);
    };
    pushAsk = setAsk;
  }, []);
  const answer = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 96, gap: spacing.sm }}>
        {toasts.map((t) => (
          <Pressable key={t.id} onPress={() => setToasts((x) => x.filter((y) => y.id !== t.id))} accessibilityRole="alert"
            style={{ backgroundColor: colors.ink, borderRadius: radius.md, padding: spacing.md, maxHeight: 360 }}>
            <Text style={{ color: colors.surface, fontSize: 16, fontWeight: '700' }}>{t.title}</Text>
            {t.message ? <ScrollView><Text style={{ color: colors.surface, fontSize: 14, marginTop: 4 }}>{t.message}</Text></ScrollView> : null}
          </Pressable>
        ))}
      </View>
      <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => answer(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(28,25,23,0.5)', justifyContent: 'center', padding: spacing.xl }}>
          <View accessibilityRole="alert" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{ask?.title}</Text>
            <Text style={{ fontSize: 16, color: colors.muted }}>{ask?.message}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button style={{ flex: 1 }} kind="secondary" label={ask?.cancel ?? ''} onPress={() => answer(false)} />
              <Button style={{ flex: 1 }} kind="danger" label={ask?.ok ?? ''} onPress={() => answer(true)} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
