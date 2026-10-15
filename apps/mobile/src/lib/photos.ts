import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { db, type Row } from './db';

export type PhotoSource = 'attendance' | 'grn' | 'progress' | 'issue' | 'site_day';

const MAX_BYTES = 300 * 1024;

/** Compress on the phone to ≤ 300 KB (1280 px, JPEG) before it is queued for upload. */
async function compress(uri: string): Promise<string> {
  let quality = 0.6;
  let width = 1280;
  for (let i = 0; i < 4; i++) {
    const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const out = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    if (Platform.OS === 'web') return out.uri;
    try {
      if (new File(out.uri).size <= MAX_BYTES) return out.uri;
    } catch {
      return out.uri;
    }
    quality -= 0.15;
    width = Math.round(width * 0.85);
  }
  return uri;
}

/** Location if the phone allows it quickly; never blocks the entry. */
async function where(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]);
    return pos ? { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 } : null;
  } catch {
    return null;
  }
}

/** Camera (gallery on a computer) → compressed photo row on this phone, uploaded in the background. */
export async function takePhoto(projectId: string, sourceType: PhotoSource, sourceId: string, fromGallery = false): Promise<Row | null> {
  if (Platform.OS !== 'web' && !fromGallery) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) fromGallery = true;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
  const result = Platform.OS === 'web' || fromGallery ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
  if (result.canceled || !result.assets[0]) return null;
  const [uri, loc] = await Promise.all([compress(result.assets[0].uri), where()]);
  const id = randomUUID();
  const row = db.save('photo', { id, projectId, takenAt: new Date().toISOString(), lat: loc?.lat ?? null, lng: loc?.lng ?? null, sourceType, sourceId, _uri: uri });
  db.queuePhoto(id, uri);
  return row;
}
