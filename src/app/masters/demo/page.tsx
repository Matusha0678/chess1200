'use client';

import demoData from '@/data/masters-demo.json';
import { GuessPage } from '@/components/masters/GuessPage';
import type { GameData } from '@/components/masters/GuessPage';
import type { AnalysisEntry } from '@/lib/masters';

export default function MastersDemoPage() {
  const gameData: GameData = {
    id: 'demo',
    white: demoData.game.white,
    black: demoData.game.black,
    event: demoData.game.event,
    year: demoData.game.year,
    result: demoData.game.result,
    pgn: demoData.game.pgn,
    analysis: demoData.analysis as unknown as AnalysisEntry[],
    analysis_version: 2,
  };

  const history = demoData.history.map(h => ({
    side: h.side as 'white' | 'black',
    score: h.score,
    mode: 'key',
  }));

  return (
    <GuessPage
      gameData={gameData}
      libraryNames={demoData.libraryNames}
      history={history}
      isDemo={true}
      demoUserEvals={demoData.userEvals as Record<string, number>}
      panelDemoAttr="masters"
    />
  );
}
