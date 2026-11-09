'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

export interface AnalysisInfo {
  cp?: number;
  mate?: number;
  bestMove?: string;
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const onBestMoveRef = useRef<((move: string) => void) | null>(null);
  const onAnalysisRef = useRef<((info: AnalysisInfo) => void) | null>(null);
  const isAnalyzingRef = useRef(false);
  const skipBestMoveRef = useRef(false);
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

      if (line.startsWith('info') && isAnalyzingRef.current && onAnalysisRef.current) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (cpMatch || mateMatch) {
          const info: AnalysisInfo = {};
          if (cpMatch) info.cp = parseInt(cpMatch[1], 10);
          if (mateMatch) info.mate = parseInt(mateMatch[1], 10);
          if (pvMatch) info.bestMove = pvMatch[1];
          onAnalysisRef.current(info);
        }
      }

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const move = parts[1];

        // Skip bestmove that was produced by stopping a running search
        if (skipBestMoveRef.current) {
          skipBestMoveRef.current = false;
          return;
        }

        // Analysis finished naturally — clear state, don't dispatch to game
        if (isAnalyzingRef.current) {
          isAnalyzingRef.current = false;
          return;
        }

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
      if (isAnalyzingRef.current) {
        skipBestMoveRef.current = true;
      }
      isAnalyzingRef.current = false;
      onAnalysisRef.current = null;
      onBestMoveRef.current = callback;
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    },
    [isReady],
  );

  const startAnalysis = useCallback(
    (fen: string, onInfo: (info: AnalysisInfo) => void) => {
      if (!workerRef.current || !isReady) return;
      if (isAnalyzingRef.current) {
        skipBestMoveRef.current = true;
      }
      onBestMoveRef.current = null;
      onAnalysisRef.current = onInfo;
      isAnalyzingRef.current = true;
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage('go depth 18');
    },
    [isReady],
  );

  const stopAnalysis = useCallback(() => {
    if (!workerRef.current) return;
    if (isAnalyzingRef.current) {
      skipBestMoveRef.current = true;
      isAnalyzingRef.current = false;
    }
    onAnalysisRef.current = null;
    workerRef.current.postMessage('stop');
  }, []);

  const setSkillLevel = useCallback((level: number) => {
    skillLevel.current = Math.max(0, Math.min(20, level));
    if (workerRef.current && isReady) {
      workerRef.current.postMessage(`setoption name Skill Level value ${skillLevel.current}`);
    }
  }, [isReady]);

  return { getBestMove, startAnalysis, stopAnalysis, setSkillLevel, isReady };
}
