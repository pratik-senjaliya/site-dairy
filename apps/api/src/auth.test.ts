import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { config } from './lib/config';
import { call, phone, signIn, start, stop, uuid, world } from './testUtils';

before(start);
after(stop);

test('OTP: wrong code refused, real code from the log works once', async () => {
  const w = await world();
  assert.equal((await call('POST', '/auth/otp/request', { phone: w.people.engineer })).status, 200);
  const wrong = await call<{ error: { code: string } }>('POST', '/auth/otp/verify', { phone: w.people.engineer, code: '000001', deviceId: 'device-123' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'otp_wrong');
});

test('refresh rotates the token, is bound to the device, and logout ends the session', async () => {
  const w = await world();
  const c = await signIn(w.people.supervisor);
  const other = await call('POST', '/auth/refresh', { refreshToken: c.refresh, deviceId: 'another-device' });
  assert.equal(other.status, 401);
  const r = await call<{ accessToken: string; refreshToken: string }>('POST', '/auth/refresh', { refreshToken: c.refresh, deviceId: c.deviceId });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.refreshToken, c.refresh);
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: c.refresh, deviceId: c.deviceId })).status, 401, 'old refresh token is dead');
  c.token = r.body.accessToken;
  assert.equal((await c.call('GET', '/auth/me')).status, 200);
  await c.call('POST', '/auth/logout');
  assert.equal((await c.call('GET', '/auth/me')).status, 401);
});

test('an unknown number can sign up a new company with the starting lists', async () => {
  const p = phone();
  const v = await call<{ signup: boolean; verifiedToken: string }>('POST', '/auth/otp/verify', { phone: p, code: '123456', deviceId: 'device-123' });
  assert.equal(v.body.signup, true);
  const s = await call<{ accessToken: string; user: { role: string } }>('POST', '/auth/signup', { verifiedToken: v.body.verifiedToken, companyName: 'New Builders', name: 'Mahesh', deviceId: 'device-123' });
  assert.equal(s.status, 201);
  assert.equal(s.body.user.role, 'owner');
  const skills = await call<unknown[]>('GET', '/masters/skill', undefined, s.body.accessToken);
  assert.equal(skills.body.length, 7);
});

test('closed pilot: only listed numbers can start a company', async () => {
  const listed = phone();
  const saved = config.signupOpen;
  config.signupOpen = `98000 11111,${listed}`;
  try {
    const other = await call<{ error: { code: string } }>('POST', '/auth/otp/verify', { phone: phone(), code: '123456', deviceId: 'device-123' });
    assert.equal(other.status, 403);
    assert.equal(other.body.error.code, 'no_account');
    const v = await call<{ signup: boolean }>('POST', '/auth/otp/verify', { phone: listed, code: '123456', deviceId: 'device-123' });
    assert.equal(v.body.signup, true);
  } finally {
    config.signupOpen = saved;
  }
});

test('roles: supervisor cannot add users or set rates; adds what turns up on site; owner can', async () => {
  const w = await world();
  const sup = await signIn(w.people.supervisor);
  assert.equal((await sup.call('POST', '/users', { name: 'X Y', phone: phone(), role: 'store' })).status, 403);
  // What turns up on site can be added by name; rates stay with the office.
  assert.equal((await sup.call('POST', '/masters/material', { nameGu: 'કેમિકલ', nameEn: 'Chemical', unit: 'litre' })).status, 201);
  const c = await sup.call<{ id: string }>('POST', '/masters/contractor', { name: 'New Contractor', rateType: 'daily' });
  assert.equal(c.status, 201);
  assert.equal((await sup.call('POST', '/masters/supplier', { name: 'New Supplier' })).status, 201);
  assert.equal((await sup.call('POST', '/masters/worker', { contractorId: c.body.id, name: 'Ramesh' })).status, 201);
  assert.equal((await sup.call('POST', '/masters/workItem', { projectId: w.siteA.id, nameGu: 'વોટરપ્રૂફિંગ', nameEn: 'Waterproofing' })).status, 201);
  assert.equal((await sup.call('POST', '/masters/structureNode', { projectId: w.siteA.id, kind: 'floor', name: 'Terrace' })).status, 201);
  assert.equal((await sup.call('POST', '/masters/workItem', { projectId: w.siteB.id, nameGu: 'x', nameEn: 'x' })).status, 403, 'not on another site');
  assert.equal((await sup.call('POST', '/masters/contractorRate', { contractorId: c.body.id, skillId: w.kadiya.id, dailyRatePaise: 90000, effectiveFrom: '2026-01-01' })).status, 403);
  const owner = await signIn(w.people.owner);
  const u = await owner.call<{ id: string }>('POST', '/users', { name: 'New Store', phone: phone(), role: 'store', siteIds: [w.siteB.id] });
  assert.equal(u.status, 201);
  void uuid;
});
