'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const onBestMoveRef = useRef<((move: string) => void) | null>(null);
  const skillLevel = useRef(8);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const worker = new Worker('/stockfish/stockfish-19-lite-single.js');

    worker.onmessage = (e: MessageEvent<string>) => {
      const line = e.data;
      if (line === 'uciok') {
        worker.postMessage(`setoption name Skill Level value ${skillLevel.current}`);
        worker.postMessage('isready');
      }
      if (line === 'readyok') {
        setIsReady(true);
      }
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const move = parts[1];
        if (move && move !== '(none)') {
          onBestMoveRef.current?.(move);
          onBestMoveRef.current = null;
        }
      }
    };

    worker.onerror = (e) => {
      console.error('Stockfish worker error:', e);
    };

    worker.postMessage('uci');
    workerRef.current = worker;

    return () => {
      worker.postMessage('quit');
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const getBestMove = useCallback(
    (fen: string, depth: number, callback: (uciMove: string) => void) => {
      if (!workerRef.current || !isReady) return;
      onBestMoveRef.current = callback;
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    },
    [isReady],
  );

  const setSkillLevel = useCallback((level: number) => {
    skillLevel.current = Math.max(0, Math.min(20, level));
    if (workerRef.current && isReady) {
      workerRef.current.postMessage(`setoption name Skill Level value ${skillLevel.current}`);
    }
  }, [isReady]);

  return { getBestMove, setSkillLevel, isReady };
}
