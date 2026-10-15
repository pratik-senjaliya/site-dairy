import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messages, t } from './index';

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
