export const MAIN_NAV_ITEMS = [
  { id: 'home', labelZh: '首页' },
  { id: 'projects', labelZh: '研究' },
  { id: 'knowledge', labelZh: '知识' },
  { id: 'archive', labelZh: 'TOY' },
] as const;

export type MainNavTab = (typeof MAIN_NAV_ITEMS)[number]['id'];

export function mainNavHref(tab: MainNavTab, baseURL: string): string {
  if (tab === 'home') return baseURL;
  if (tab === 'projects') return `${baseURL}research/`;
  if (tab === 'knowledge') return `${baseURL}knowledge/`;
  if (tab === 'archive') return `${baseURL}about/`;
  return `${baseURL}#${tab}`;
}
