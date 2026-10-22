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
      className="w-full text-left bg-[#15130F] border border-[#2A2722] rounded-[20px] p-6 flex flex-col gap-4 hover:border-[#4A3E28] hover:bg-[#1B1810] transition-all duration-200 cursor-pointer group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-[6px] min-w-0">
          {/* ECO badge + color icon */}
          <div className="flex items-center gap-2">
            {opening.eco_code && (
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E] bg-[#2A2218] border border-[#4A3E28] rounded-[6px] px-[7px] py-[2px]">
                {opening.eco_code}
              </span>
            )}
            <span
              className="text-[13px] text-[#B3AC9F] flex items-center gap-1"
              title={COLOR_LABEL[opening.color]}
            >
              <span className="text-[15px] leading-none">{COLOR_ICON[opening.color]}</span>
              <span>{COLOR_LABEL[opening.color]}</span>
            </span>
          </div>

          {/* Opening name */}
          <h3 className="m-0 font-cormorant font-[500] text-[26px] leading-[1.15] tracking-[-0.01em] text-[#F3EEE5] group-hover:text-[#D6B97E] transition-colors">
            {opening.name}
          </h3>
        </div>

        {/* Due badge */}
        {linesDue > 0 && (
          <div className="shrink-0 flex items-center gap-[5px] bg-[#2A2218] border border-[#4A3E28] rounded-full px-[10px] py-[4px] mt-1">
            <span className="w-[6px] h-[6px] rounded-full bg-[#D6B97E]" />
            <span className="text-[12px] font-semibold text-[#D6B97E]">
              {linesDue} к повторению
            </span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-[10px]">
        {/* Progress bar */}
        <div className="relative h-[5px] w-full bg-[#24221D] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#D6B97E] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[#B3AC9F]">
            <span className="text-[#F3EEE5] font-semibold">{linesMastered}</span>
            {' линий из '}
            <span className="text-[#F3EEE5] font-semibold">{linesTotal}</span>
            {' освоено'}
          </span>
          <span className="text-[12px] text-[#5A5249]">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </button>
  );
}
