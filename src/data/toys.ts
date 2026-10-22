import { TICKET_ACCENT, TICKET_TITLE } from '../ticket/ticketContent';

export interface ToyCase {
  id: string;
  name: string;
  title: string;
  accent?: string;
  category: string;
  description: string;
  tags: string[];
  href: string;
  preview: { src: string; width: number; height: number; viewBox: string };
  caption: string;
}

/** Add a case here to publish another card in the TOY gallery. Paths are site-relative. */
export const TOY_CASES: ToyCase[] = [
  {
    id: 'ticket-tear',
    name: 'Ticket Tear',
    title: TICKET_TITLE,
    accent: TICKET_ACCENT,
    category: '数字触感',
    description: '一张可以弯折、翻转与撕开的全息通行证。\n用一次真实的交互，感受数字界面的触感。',
    tags: ['3D 纸张物理', '全息材质', '程序化声音'],
    href: 'cases/ticket-tear/',
    preview: { src: 'images/cases/ticket-tear-preview.png', width: 1264, height: 1262, viewBox: '610 341 480 611' },
    caption: '触碰 · 弯折 · 撕开',
  },
];
