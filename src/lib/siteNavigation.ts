export const MAIN_NAV_ITEMS = [
  { id: 'home', labelZh: '首页' },
  { id: 'projects', labelZh: '项目与专题' },
  { id: 'knowledge', labelZh: '知识库' },
  { id: 'archive', labelZh: '档案' },
] as const;

export type MainNavTab = (typeof MAIN_NAV_ITEMS)[number]['id'];

export function mainNavHref(tab: MainNavTab, baseURL: string): string {
  if (tab === 'home') return baseURL;
  if (tab === 'knowledge') return `${baseURL}knowledge/`;
  return `${baseURL}#${tab}`;
}
