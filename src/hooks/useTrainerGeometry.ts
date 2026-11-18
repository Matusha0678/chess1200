'use client';

import { useState, useEffect } from 'react';

const TOPBAR_H = 56;
const PAD = 20;
const PLAYER_BAR_H = 32;
const EVAL_BAR_W = 24;
const EVAL_GAP = 8;
const COL_GAP = 20;
const LEFT_COL_W = 280;
const MIN_RIGHT_W = 420;
const MAX_RIGHT_W = 600;
const MAX_S = 900;

interface TrainerGeometry {
  S: number;           // board size in px (multiple of 8)
  showLeft: boolean;   // show left session column
  rightWidth: number;  // right panel width
  sidebarW: number;    // current sidebar width (240 or 64)
}

function getSidebarW(): number {
  if (typeof window === 'undefined') return 240;
  try {
    return localStorage.getItem('chess1200-sidebar-collapsed') === '1' ? 64 : 240;
  } catch { return 240; }
}

function compute(winW: number, winH: number, sidebarW: number): TrainerGeometry {
  const cardH = winH - TOPBAR_H - 2 * PAD;
  const shRaw = cardH - 2 * PLAYER_BAR_H - 2 * EVAL_GAP;
  let S = Math.min(shRaw, MAX_S);
  S = Math.floor(S / 8) * 8;

  const workW = winW - sidebarW - 2 * PAD;
  const boardColW = EVAL_BAR_W + EVAL_GAP + S;

  // Check if left column fits
  const neededWithLeft = LEFT_COL_W + COL_GAP + boardColW + COL_GAP + MIN_RIGHT_W;
  const showLeft = neededWithLeft <= workW;

  let rightWidth = workW - boardColW - COL_GAP - (showLeft ? LEFT_COL_W + COL_GAP : 0);

  // If right panel is too narrow, shrink S
  while (rightWidth < MIN_RIGHT_W && S > 8) {
    S -= 8;
    rightWidth += 8;
  }

  if (rightWidth > MAX_RIGHT_W) rightWidth = MAX_RIGHT_W;

  return { S, showLeft, rightWidth, sidebarW };
}

export function useTrainerGeometry(): TrainerGeometry {
  const [geo, setGeo] = useState<TrainerGeometry>(() => {
    if (typeof window === 'undefined') {
      return { S: 768, showLeft: true, rightWidth: 520, sidebarW: 240 };
    }
    return compute(window.innerWidth, window.innerHeight, getSidebarW());
  });

  useEffect(() => {
    const update = () => {
      setGeo(compute(window.innerWidth, window.innerHeight, getSidebarW()));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('chess1200-sidebar-toggle', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('chess1200-sidebar-toggle', update);
    };
  }, []);

  return geo;
}
