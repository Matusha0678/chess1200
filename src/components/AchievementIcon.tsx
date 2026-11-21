'use client';

import {
  Play, Gamepad2, Dices, Target, Crosshair, Trophy, Medal, Award, Crown,
  Flame, Zap, Rocket, Swords, Shield, Sparkles, BookOpen, Book, Library,
  GraduationCap, Brain, Sun, Moon, Calendar, Star, Clock, Hourglass,
  Mountain, Compass, CheckCircle, TrendingUp, Infinity as InfinityIcon,
  Puzzle, ArrowLeftRight, Lightbulb, Snowflake,
} from 'lucide-react';

type IconComp = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const MAP: Record<string, IconComp> = {
  // play
  play: Play,
  gamepad: Gamepad2,
  dices: Dices,
  // win
  trophy: Trophy,
  medal: Medal,
  award: Award,
  crown: Crown,
  // streaks (win)
  flame: Flame,
  zap: Zap,
  rocket: Rocket,
  // tactical
  swords: Swords,
  shield: Shield,
  sparkles: Sparkles,
  // accuracy
  target: Target,
  crosshair: Crosshair,
  // books / study
  book: Book,
  'book-open': BookOpen,
  library: Library,
  graduation: GraduationCap,
  brain: Brain,
  // day streaks
  sun: Sun,
  moon: Moon,
  calendar: Calendar,
  star: Star,
  // time
  clock: Clock,
  hourglass: Hourglass,
  // misc
  mountain: Mountain,
  compass: Compass,
  check: CheckCircle,
  trending: TrendingUp,
  infinity: InfinityIcon,
  puzzle: Puzzle,
  swap: ArrowLeftRight,
  lightbulb: Lightbulb,
  snowflake: Snowflake,
};

interface Props {
  name: string;
  size?: number;
  strokeWidth?: number;
}

export function AchievementIcon({ name, size = 20, strokeWidth = 1.8 }: Props) {
  const Icon = MAP[name] ?? Trophy;
  return <Icon size={size} strokeWidth={strokeWidth} />;
}
