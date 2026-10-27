import { seesAllSites } from '@site-diary/shared';
import { colors } from '@site-diary/ui-tokens';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../lib/session';

export default function Gate() {
  const { status, siteId, me } = useSession();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (status === 'out') return <Redirect href="/login" />;
  const office = me ? seesAllSites(me.user.role) : false;
  if (!siteId && !office) return <Redirect href="/sites" />;
  return <Redirect href="/home" />;
}
