import express, { Router } from 'express';
import { assertSite, me } from '../../lib/auth';
import { write } from '../../lib/db';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { putFile, readLocal, signedUrl } from '../../lib/storage';
import { param } from '../../lib/validate';

export const photos = Router();

async function photoFor(req: express.Request) {
  const m = me(req);
  const photo = await prisma.photo.findUnique({ where: { id: param(req) } });
  if (!photo || photo.companyId !== m.companyId) throw new HttpError(404, 'Photo not found', 'not_found');
  assertSite(m, photo.projectId);
  return photo;
}

// The photo row arrives by sync first; the phone's background queue then uploads the file here.
// Phones compress to ≤ 300 KB; 2 MB is the hard limit.
photos.put('/:id/file', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), async (req, res) => {
  const photo = await photoFor(req);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Send the image as the request body', 'no_file');
  await putFile(photo.storageKey, req.body, req.get('content-type') ?? 'image/jpeg');
  await write(photo.companyId, (tx) => tx.photo.update({ where: { id: photo.id }, data: { uploaded: true } }));
  res.json({ ok: true });
});

photos.get('/:id/file', async (req, res) => {
  const photo = await photoFor(req);
  if (!photo.uploaded) throw new HttpError(404, 'Photo is still uploading from the phone', 'pending');
  const url = await signedUrl(photo.storageKey);
  if (url) {
    res.redirect(url);
    return;
  }
  res.set('cache-control', 'private, max-age=86400').type('image/jpeg').send(await readLocal(photo.storageKey));
});
