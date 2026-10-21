import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messages, noticeText, t, type Notice } from './index';

test('every locale has exactly the English keys and the same placeholders', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const [locale, table] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(table).sort(), Object.keys(messages.en).sort(), locale);
    for (const [key, text] of Object.entries(table)) {
      assert.ok(text.trim(), `${locale} ${key} is empty`);
      assert.equal(placeholders(text), placeholders(messages.en[key as keyof typeof messages.en]), `${locale} ${key}`);
    }
  }
});

test('t fills placeholders', () => {
  assert.equal(t('gu', 'attendance.workers', { count: 12 }), '12 માણસ');
});

test('server notices read in each language, with Gujarati names for Gujarati and Hindi', () => {
  const n: Notice = { key: 'alert.lowStock', vars: { material: 'Cement', qty: 32, unit: 'bag', min: 100 }, gu: { material: 'સિમેન્ટ' } };
  assert.equal(noticeText('en', n), 'Low stock: Cement 32 bag (min 100)');
  assert.equal(noticeText('gu', n), 'સ્ટોક ઓછો: સિમેન્ટ 32 bag (ઓછામાં ઓછું 100)');
  assert.match(noticeText('hi', n), /^स्टॉक कम: સિમેન્ટ/);
});
