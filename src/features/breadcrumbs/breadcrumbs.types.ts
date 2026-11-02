export interface BreadcrumbLinkInput {
  label: string;
  href: string;
}

export interface BreadcrumbsInput {
  ancestors: BreadcrumbLinkInput[];
  currentPage: string;
}

export type BreadcrumbItemData =
  | { label: string; href: string; current: false }
  | { label: string; current: true };

export interface BreadcrumbsData {
  items: BreadcrumbItemData[];
}

export interface BreadcrumbsProps {
  breadcrumbs: BreadcrumbsData;
  label?: string;
}
