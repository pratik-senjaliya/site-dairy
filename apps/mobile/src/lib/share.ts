import { isoDate } from '@site-diary/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { apiUrl, authHeaders, isDemo } from './api';
import { db } from './db';
import { demoReportText } from '../demo/server';
import { showToast } from '../components/Dialogs';

/**
 * Today's site report as a PDF through the phone's share sheet (WhatsApp, etc.).
 * Syncs first so the report has everything entered on this phone.
 */
export async function shareDailyReport(projectId: string, title: string, date = isoDate()) {
  await db.sync();
  if (isDemo()) {
    // The demo has no server to make the PDF; it shares the same summary as text.
    const text = await demoReportText(projectId);
    if (Platform.OS === 'web') {
      showToast(title, text);
      return;
    }
    await Share.share({ title, message: text });
    return;
  }
  await shareReportFile('daily', projectId, date, date, 'pdf', title);
}

const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;

/** Any office report (daily, monthly…) as a PDF or Excel file through the share sheet (WhatsApp, email to the CA). */
export async function shareReportFile(type: string, projectId: string, from: string, to: string, format: 'pdf' | 'xlsx', title: string) {
  const url = apiUrl(`/reports/${type}?projectId=${projectId}&from=${from}&to=${to}&format=${format}`);
  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Report failed (${res.status})`);
    window.open(URL.createObjectURL(await res.blob()), '_blank');
    return;
  }
  const file = new File(Paths.cache, `${type}-${to}.${format}`);
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file, { headers: authHeaders(), idempotent: true });
  await Sharing.shareAsync(saved.uri, { mimeType: MIME[format], dialogTitle: title, ...(format === 'pdf' && { UTI: 'com.adobe.pdf' }) });
}

/** A public report link (nightly report): open in the browser or share. */
export async function shareLink(link: string) {
  if (Platform.OS === 'web') {
    window.open(link, '_blank');
    return;
  }
  await Share.share({ message: link });
}

/** A text message through WhatsApp (the share sheet on the phone; WhatsApp Web in a browser). */
export async function shareMessage(text: string) {
  if (Platform.OS === 'web') {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    return;
  }
  await Share.share({ message: text });
}
