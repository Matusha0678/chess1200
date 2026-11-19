'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { GuessPage } from '@/components/masters/GuessPage';
import type { GameData } from '@/components/masters/GuessPage';

export default function MasterGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [libraryNames, setLibraryNames] = useState<string[]>([]);
  const [history, setHistory] = useState<{ side: 'white' | 'black'; score: number; mode: string }[]>([]);
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Try to load with analysis columns (added by 38-masters-analysis.sql)
      const { data: d1, error: e1 } = await supabase
        .from('master_games')
        .select('id,white,black,event,year,result,pgn,analysis,analysis_version')
        .eq('id', id)
        .single();

      let missing = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let row: Record<string, any> | null = null;

      if (e1) {
        // analysis column may not exist yet — fall back to basic columns
        missing = true;
        const { data: d2 } = await supabase
          .from('master_games')
          .select('id,white,black,event,year,result,pgn')
          .eq('id', id)
          .single();
        row = d2;
      } else {
        row = d1;
      }

      if (!row) { setLoading(false); return; }
      setAnalysisMissing(missing);

      // Load history (mode column exists only after 38-masters-analysis.sql)
      const { data: logs } = await supabase
        .from('guess_log')
        .select('side,score,mode')
        .eq('game_id', id);

      setHistory((logs ?? []).map(l => ({
        side: (l.side || 'white') as 'white' | 'black',
        score: Number(l.score) || 0,
        mode: l.mode || '',
      })));

      // Load all player names for defaultSide detection
      const { data: allGames } = await supabase
        .from('master_games')
        .select('white,black')
        .limit(200);
      const names: string[] = [];
      for (const g of allGames ?? []) {
        if (g.white) names.push(g.white);
        if (g.black) names.push(g.black);
      }
      setLibraryNames(names);

      setGameData({
        id: row.id,
        white: row.white || '',
        black: row.black || '',
        event: row.event || '',
        year: row.year ?? null,
        result: row.result || '*',
        pgn: row.pgn || '',
        analysis: row.analysis ?? null,
        analysis_version: row.analysis_version ?? null,
      });

      setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div className="page-wrap">
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Загрузка…
      </div>
    </div>
  );

  if (!gameData) return (
    <div className="page-wrap">
      <div className="ui-card ui-card-lg" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 8 }}>Партия не найдена</div>
        <Link href="/masters" style={{
          display: 'inline-block', marginTop: 8, padding: '8px 20px',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)',
          color: 'var(--muted)', textDecoration: 'none', fontSize: 13,
        }}>
          К библиотеке
        </Link>
      </div>
    </div>
  );

  return (
    <GuessPage
      gameData={gameData}
      libraryNames={libraryNames}
      history={history}
      isDemo={false}
      analysisMissing={analysisMissing}
    />
  );
}
