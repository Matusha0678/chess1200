// Общий код макетов: меню, доска, стрелки, иконки
window.MK = (() => {
  const ico = (n, s = '') => `<i class="ico" data-i="${n}" style="${s}"></i>`;
  const NAV = [
    ['calendar', 'Сегодня'],
    ['#', 'Учиться'], ['layers', 'Дебюты'], ['book-open', 'Курсы'], ['flag', 'Ловушки'], ['lightbulb', 'Идеи позиций'],
    ['#', 'Тренироваться'], ['zap', 'Тактика'], ['eye', 'Расчёт вслепую'], ['timer', 'Дебютный спринт'], ['circle-alert', 'Ошибки'], ['triangle-alert', 'Проверка угроз'], ['grid-3x3', 'Эндшпили'], ['target', 'Дожми партию'], ['shield', 'Жертвы'], ['circle-play', 'Играть'],
    ['#', 'Партии'], ['message-square', 'Мои партии'], ['book-check', 'Дебюты в партиях'], ['trending-down', 'Где я теряю очки'], ['star', 'Мастера'],
  ];
  function side(active) {
    document.getElementById('side').innerHTML = NAV.map(([i, t]) => i === '#'
      ? `<div class="grp">${t}${ico('chevron-down')}</div>`
      : `<div class="item${t === active ? ' active' : ''}">${ico(i)}${t}</div>`).join('');
  }
  const files = 'abcdefgh', Q = 774 / 8;
  function board({ fen, flip, last = [], arrows = [] }) {
    const grid = {};
    fen.split(' ')[0].split('/').forEach((row, ri) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { grid[files[f] + (8 - ri)] = ch; f++; } } });
    let h = '';
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const f = flip ? 7 - col : col, r = flip ? row + 1 : 8 - row, sq = files[f] + r, light = (f + r) % 2 === 0;
      let inner = last.includes(sq) ? `<div class="hl" style="background:rgba(247,214,74,${sq === last[1] ? .38 : .26})"></div>` : '';
      const p = grid[sq];
      if (p) inner += `<img src="pieces/${p === p.toUpperCase() ? 'w' : 'b'}${p.toUpperCase()}.svg">`;
      const co = light ? 'var(--dark)' : 'var(--light)';
      if (col === 0) inner += `<span class="co r" style="color:${co}">${r}</span>`;
      if (row === 7) inner += `<span class="co f" style="color:${co}">${files[f]}</span>`;
      h += `<div class="sq" style="background:var(--${light ? 'light' : 'dark'})">${inner}</div>`;
    }
    document.getElementById('sqs').innerHTML = h;
    const ctr = sq => { const f = files.indexOf(sq[0]), r = +sq[1]; const col = flip ? 7 - f : f, row = flip ? r - 1 : 8 - r; return [(col + .5) * Q, (row + .5) * Q]; };
    let svg = '';
    for (const a of arrows) {
      const [x1, y1] = ctr(a.from), [x2, y2] = ctr(a.to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy, py = ux;
      const color = { played: '#E0574A', best: '#81B64C', plan: '#4A90E2' }[a.role];
      if (a.style === 'dashed') {
        const s0 = 30, e = L - 18, hl = 26, hw = 16, ex = x1 + ux * e, ey = y1 + uy * e;
        const head = [[ex, ey], [ex - ux * hl + px * hw, ey - uy * hl + py * hw], [ex - ux * hl - px * hw, ey - uy * hl - py * hw]].map(p => p.map(q => q.toFixed(1)).join(',')).join(' ');
        svg += `<line x1="${(x1 + ux * s0).toFixed(1)}" y1="${(y1 + uy * s0).toFixed(1)}" x2="${(ex - ux * hl).toFixed(1)}" y2="${(ey - uy * hl).toFixed(1)}" stroke="${color}" stroke-width="9" stroke-dasharray="16 11" stroke-linecap="round" opacity=".95"/><polygon points="${head}" fill="${color}" opacity=".95"/>`;
      } else {
        const st = 18, en = L - 14, hd = 34, sw = 9, hw = 22;
        const P = (t, o) => [(x1 + ux * t + px * o).toFixed(1), (y1 + uy * t + py * o).toFixed(1)].join(',');
        svg += `<polygon points="${[P(st, -sw), P(en - hd, -sw), P(en - hd, -hw), P(en, 0), P(en - hd, hw), P(en - hd, sw), P(st, sw)].join(' ')}" fill="${color}" opacity="${a.op || .85}"/>`;
      }
      if (a.label) { const x = x1 + dx * .5, y = y1 + dy * .5; svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="${color}"/><text x="${x.toFixed(1)}" y="${(y + 5.5).toFixed(1)}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="16" fill="#fff">${a.label}</text>`; }
    }
    document.getElementById('over').innerHTML = `<svg width="774" height="774" style="position:absolute;inset:0">${svg}</svg>`;
  }
  function icons() { document.querySelectorAll('[data-i]').forEach(el => { const u = window.ICONS && ICONS[el.dataset.i]; if (u) el.style.setProperty('--i', `url("${u}")`); }); }
  return { ico, side, board, icons };
})();
