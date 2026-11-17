'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

export interface AnalysisInfo {
  cp?: number;
  mate?: number;
  bestMove?: string;
}

export interface EvalResult {
  bestMove: string;
  cp?: number;
  mate?: number;
}

interface TopMovesRequest {
  count: number;
  collected: Map<number, string>;
  callback: (moves: string[]) => void;
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const onBestMoveRef      = useRef<((move: string) => void) | null>(null);
  const onAnalysisRef      = useRef<((info: AnalysisInfo) => void) | null>(null);
  const evalCallbackRef    = useRef<((r: EvalResult) => void) | null>(null);
  const topMovesRef        = useRef<TopMovesRequest | null>(null);
  const lastInfoRef        = useRef<{ cp?: number; mate?: number }>({});
  const isAnalyzingRef     = useRef(false);
  const skipBestMoveRef    = useRef(false);
  const skillLevel         = useRef(8);

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

      if (line.startsWith('info')) {
        // Always track latest score
        const cpMatch   = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        if (cpMatch)   lastInfoRef.current.cp   = parseInt(cpMatch[1], 10);
        if (mateMatch) lastInfoRef.current.mate = parseInt(mateMatch[1], 10);

        // Collect multipv moves
        if (topMovesRef.current) {
          const pvMatch = line.match(/ multipv (\d+) .* pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
          if (pvMatch) topMovesRef.current.collected.set(parseInt(pvMatch[1], 10), pvMatch[2]);
        }

        if (isAnalyzingRef.current && onAnalysisRef.current) {
          const info: AnalysisInfo = {};
          if (cpMatch)   info.cp       = parseInt(cpMatch[1], 10);
          if (mateMatch) info.mate     = parseInt(mateMatch[1], 10);
          const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
          if (pvMatch)   info.bestMove = pvMatch[1];
          if (cpMatch || mateMatch) onAnalysisRef.current(info);
        }
      }

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const move  = parts[1];

        if (skipBestMoveRef.current) {
          skipBestMoveRef.current = false;
          return;
        }

        // getTopMoves path
        if (topMovesRef.current) {
          const { count, collected, callback } = topMovesRef.current;
          topMovesRef.current = null;
          workerRef.current?.postMessage('setoption name MultiPV value 1');
          const moves: string[] = [];
          for (let i = 1; i <= count; i++) {
            const m = collected.get(i);
            if (m) moves.push(m);
          }
          callback(moves);
          return;
        }

        // getEval path
        if (evalCallbackRef.current) {
          const cb = evalCallbackRef.current;
          evalCallbackRef.current = null;
          const snap = { ...lastInfoRef.current };
          lastInfoRef.current = {};
          cb({ bestMove: move ?? '', ...snap });
          return;
        }

        // startAnalysis path — bestmove after stop, skip
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
      if (isAnalyzingRef.current) skipBestMoveRef.current = true;
      isAnalyzingRef.current  = false;
      onAnalysisRef.current   = null;
      evalCallbackRef.current = null;
      topMovesRef.current     = null;
      onBestMoveRef.current   = callback;
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    },
    [isReady],
  );

  const getEval = useCallback(
    (fen: string, depth: number, callback: (r: EvalResult) => void) => {
      if (!workerRef.current || !isReady) return;
      if (isAnalyzingRef.current) skipBestMoveRef.current = true;
      isAnalyzingRef.current  = false;
      onAnalysisRef.current   = null;
      onBestMoveRef.current   = null;
      topMovesRef.current     = null;
      lastInfoRef.current     = {};
      evalCallbackRef.current = callback;
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    },
    [isReady],
  );

  const getTopMoves = useCallback(
    (fen: string, depth: number, count: number, callback: (moves: string[]) => void) => {
      if (!workerRef.current || !isReady) return;
      if (isAnalyzingRef.current) skipBestMoveRef.current = true;
      isAnalyzingRef.current  = false;
      onAnalysisRef.current   = null;
      onBestMoveRef.current   = null;
      evalCallbackRef.current = null;
      topMovesRef.current     = { count, collected: new Map(), callback };
      workerRef.current.postMessage(`setoption name MultiPV value ${count}`);
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    },
    [isReady],
  );

  const startAnalysis = useCallback(
    (fen: string, onInfo: (info: AnalysisInfo) => void) => {
      if (!workerRef.current || !isReady) return;
      if (isAnalyzingRef.current) skipBestMoveRef.current = true;
      onBestMoveRef.current   = null;
      evalCallbackRef.current = null;
      topMovesRef.current     = null;
      onAnalysisRef.current   = onInfo;
      isAnalyzingRef.current  = true;
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
      isAnalyzingRef.current  = false;
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

  return { getBestMove, getEval, getTopMoves, startAnalysis, stopAnalysis, setSkillLevel, isReady };
}
