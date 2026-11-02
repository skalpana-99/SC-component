import type { AccordionData, FaqContent } from './accordion.types';

// Validate supplied content at this boundary, including future CMS-adapter output.
export function prepareAccordion(content: FaqContent): AccordionData {
  if (typeof content !== 'object' || content === null || !Array.isArray(content.items)) {
    throw new TypeError('FAQ content must contain an items array.');
  }
  return {
    items: content.items.map(item => {
      if (typeof item !== 'object' || item === null
        || typeof item.question !== 'string' || !item.question.trim()
        || typeof item.answer !== 'string' || !item.answer.trim()) {
        throw new TypeError('Each FAQ item needs a question and a plain-text answer.');
      }
      return {
        title: item.question.trim(),
        paragraphs: item.answer.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).map(paragraph => paragraph.trim()),
      };
    }),
  };
}
