import { isoDate } from '@site-diary/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { apiUrl, authHeaders } from './api';
import { db } from './db';

/**
 * Today's site report as a PDF through the phone's share sheet (WhatsApp, etc.).
 * Syncs first so the report has everything entered on this phone.
 */
export async function shareDailyReport(projectId: string, date = isoDate()) {
  await db.sync();
  const url = apiUrl(`/reports/daily?projectId=${projectId}&to=${date}&from=${date}&format=pdf`);
  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Report failed (${res.status})`);
    window.open(URL.createObjectURL(await res.blob()), '_blank');
    return;
  }
  const file = new File(Paths.cache, `site-report-${date}.pdf`);
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file, { headers: authHeaders(), idempotent: true });
  await Sharing.shareAsync(saved.uri, { mimeType: 'application/pdf', dialogTitle: 'Site report', UTI: 'com.adobe.pdf' });
}

/** A public report link (nightly report): open in the browser or share. */
export async function shareLink(link: string) {
  if (Platform.OS === 'web') {
    window.open(link, '_blank');
    return;
  }
  const { Share } = await import('react-native');
  await Share.share({ message: link });
}
