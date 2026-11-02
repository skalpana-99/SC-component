// Supplied plain-text editorial content; this is not a CMS API response schema.
export interface FaqContentItem {
  question: string;
  answer: string;
}

export interface FaqContent {
  items: FaqContentItem[];
}

export interface AccordionItemData {
  title: string;
  paragraphs: string[];
}

export interface AccordionData {
  items: AccordionItemData[];
}

export interface AccordionProps {
  data: AccordionData;
}
