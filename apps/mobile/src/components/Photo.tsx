import { colors, radius } from '@site-diary/ui-tokens';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, authHeaders } from '../lib/api';
import type { Row } from '../lib/db';

/** A photo from this phone (not yet uploaded) or from the server (with the sign-in header). */
export function PhotoThumb({ photo, size = 96, onPress }: { photo: Row; size?: number; onPress?: () => void }) {
  const local = typeof photo._uri === 'string' ? photo._uri : null;
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const remote = !local && photo.uploaded ? apiUrl(`/photos/${photo.id}/file`) : null;

  useEffect(() => {
    if (Platform.OS !== 'web' || !remote) return;
    let url: string | null = null;
    void fetch(remote, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) setWebUrl((url = URL.createObjectURL(b)));
      })
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [remote]);

  const source = local ? { uri: local } : remote ? (Platform.OS === 'web' ? (webUrl ? { uri: webUrl } : null) : { uri: remote, headers: authHeaders() }) : null;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[st.box, { width: size, height: size }]}>
      {source ? <Image source={source} style={{ width: size, height: size, borderRadius: radius.md }} resizeMode="cover" /> : <Text style={st.pending}>⏳</Text>}
      {local && !photo.uploaded ? <View style={st.dot} /> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  box: { borderRadius: radius.md, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pending: { fontSize: 24 },
  dot: { position: 'absolute', right: 6, top: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning },
});
