// Библиотека ловушек. Источник — docs/design/pages/traps/traps-library.json.
// Не меняй ходы без проверки движком (TRAPS.md, раздел 1).
import type { TrapLibEntry } from '@/lib/traps';
import rawTraps from './traps-library.json';

export const TRAPS_LIBRARY: TrapLibEntry[] = rawTraps as TrapLibEntry[];
