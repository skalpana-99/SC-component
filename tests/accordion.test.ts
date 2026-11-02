import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareAccordion } from '../src/features/accordion/accordion.service';
import type { FaqContent } from '../src/features/accordion/accordion.types';

test('prepares supplied content in editorial order without mutation or interpreting markup', () => {
  const content = { items: [
    { question: '  First question?  ', answer: '  First paragraph.\r\n\r\nSecond paragraph.\nA line within the paragraph.  ' },
    { question: 'ප්‍රශ්නය?', answer: '<img src=x onerror=alert(1)> & plain text' },
  ] };
  const original = structuredClone(content);
  assert.deepEqual(prepareAccordion(content), { items: [
    { title: 'First question?', paragraphs: ['First paragraph.', 'Second paragraph.\nA line within the paragraph.'] },
    { title: 'ප්‍රශ්නය?', paragraphs: ['<img src=x onerror=alert(1)> & plain text'] },
  ] });
  assert.deepEqual(content, original);
});

test('empty editorial content remains empty without fabricated questions or answers', () => {
  assert.deepEqual(prepareAccordion({ items: [] }), { items: [] });
});

test('missing or malformed content fails visibly instead of silently omitting entries', () => {
  for (const content of [null, undefined, {}, { items: null }, { items: [null] },
    { items: [{ question: '', answer: 'Answer' }] }, { items: [{ question: 'Question', answer: '  \n ' }] },
    { items: [{ question: 12, answer: 'Answer' }] }, { items: [{ question: 'Question', answer: ['Answer'] }] },
    { items: [{ question: 'Question' }] }, { items: [{ question: 'Question', answerHtml: '<p>Answer</p>' }] }]) {
    assert.throws(() => prepareAccordion(content as FaqContent), TypeError);
  }
});
