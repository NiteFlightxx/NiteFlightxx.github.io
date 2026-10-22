export const TICKET_TITLE = '有些体验，\n值得亲手感受。';
export const TICKET_ACCENT = '亲手感受。';
export const TICKET_EDITIONS = [
  { name: '银色全息', note: '让每个角度，都有不同的光。', price: 48, className: 'silver' },
  { name: '创始金箔', note: '献给最早到场的同行者。', price: 68, className: 'gold' },
  { name: '紫外棱镜', note: '在光谱之外，发现一点不同。', price: 58, className: 'prism' },
] as const;
export const TICKET_ZONES = [
  { id: 'general', name: '普通入场', extra: 0 },
  { id: 'balcony', name: '楼座席位', extra: 12 },
  { id: 'front', name: '前排优先', extra: 24 },
] as const;
