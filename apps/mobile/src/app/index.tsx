import { DEFAULT_LOCALE, t } from '@site-diary/i18n';
import { colors, spacing, touch, type } from '@site-diary/ui-tokens';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Scaffold screen. Login, site picker and the supervisor home (M1–M3) replace it in task 5.
const TILES = ['home.attendance', 'home.materialIn', 'home.materialUsed', 'home.progress'] as const;

export default function Home() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>{t(DEFAULT_LOCALE, 'app.name')}</Text>
      <View style={styles.grid}>
        {TILES.map((key) => (
          <View key={key} style={styles.tile}>
            <Text style={styles.tileText}>{t(DEFAULT_LOCALE, key)}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: type.heading, fontWeight: '700', color: colors.ink, marginBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: '47%',
    minHeight: touch.minTarget * 2,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { fontSize: type.title, color: colors.ink, fontWeight: '600' },
});
