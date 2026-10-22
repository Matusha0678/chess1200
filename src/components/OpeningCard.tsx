'use client';

interface Props {
  opening: {
    id: string;
    name: string;
    eco_code?: string | null;
    color: 'white' | 'black' | 'both';
    total_lines: number;
  };
  linesTotal: number;
  linesMastered: number;
  linesDue: number;
  onClick: () => void;
}

const COLOR_ICON: Record<'white' | 'black' | 'both', string> = {
  white: '♙',
  black: '♟',
  both: '♗',
};

const COLOR_LABEL: Record<'white' | 'black' | 'both', string> = {
  white: 'Белые',
  black: 'Чёрные',
  both: 'Оба цвета',
};

export default function OpeningCard({
  opening,
  linesTotal,
  linesMastered,
  linesDue,
  onClick,
}: Props) {
  const progress = linesTotal > 0 ? (linesMastered / linesTotal) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#15130F] border border-[#2A2722] rounded-[20px] p-7 flex flex-col gap-4 hover:border-[#4A3E28] hover:bg-[#1B1810] transition-all duration-200 cursor-pointer group"
    >
      {/* Header row: ECO badge + color pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {opening.eco_code && (
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E] bg-[#2A2218] border border-[#4A3E28] rounded-[8px] px-[10px] py-[4px]">
            {opening.eco_code}
          </span>
        )}
        <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F] bg-[#15130F] border border-[#2A2722] rounded-full px-[10px] py-[4px] flex items-center gap-1.5">
          <span className="text-[14px] leading-none">{COLOR_ICON[opening.color]}</span>
          <span>{COLOR_LABEL[opening.color]}</span>
        </span>
      </div>

      {/* Opening name */}
      <h3 className="m-0 font-cormorant font-[500] text-[26px] leading-[1.15] tracking-[-0.01em] text-[#F3EEE5] group-hover:text-[#D6B97E] transition-colors">
        {opening.name}
      </h3>

      {/* Progress bar */}
      <div className="h-[5px] w-full bg-[#24221D] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#D6B97E] rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[#B3AC9F]">
          {linesTotal} {linesTotal === 1 ? 'линия' : linesTotal >= 2 && linesTotal <= 4 ? 'линии' : 'линий'}
        </span>
        {linesDue > 0 && (
          <span className="flex items-center gap-[5px] bg-[#2A2218] border border-[#4A3E28] rounded-full px-[10px] py-[4px]">
            <span className="w-[5px] h-[5px] rounded-full bg-[#D6B97E]" />
            <span className="text-[12px] font-semibold text-[#D6B97E] whitespace-nowrap">
              {linesDue} к повторению
            </span>
          </span>
        )}
      </div>
    </button>
  );
}
