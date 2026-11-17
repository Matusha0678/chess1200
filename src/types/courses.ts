export type CourseKind = 'opening' | 'theme' | 'endgame' | 'tactics' | 'structure' | 'games';

export type MoveLabel =
  | '!!'   // Блестящий
  | '!'    // Сильный
  | '!?'   // Интересный
  | 'best' // Лучший
  | 'book' // Книжный
  | 'good' // Хороший
  | '?!'   // Неточность
  | '?'    // Ошибка
  | 'miss' // Пропуск
  | '??';  // Зевок

export interface Course {
  id: string;
  slug: string;
  name: string;
  color: 'white' | 'black' | 'both';
  opening: string;
  kind?: CourseKind;
  topic?: string;
  description: string;
  difficulty: number;
  level?: string;
  language?: string;
  source_md?: string;
  created_at: string;
}

export interface Arrow {
  from: string;
  to: string;
  color?: string; // green | red | yellow | blue
}

export interface SquareMark {
  square: string;
  color: string;
}

export interface CourseLessonMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: 'w' | 'b';
  comment: string | null;
  arrows: Arrow[];
  squares?: SquareMark[];
  nags?: number[];
  label?: MoveLabel;
  /** Alternatives to THIS move: each one starts from the same position as this move. */
  variations?: CourseLessonMove[][];
}

// ── Course format v1: compiled lesson blocks (stored in course_lessons.blocks) ──

export type QuizItem =
  | { type: 'choice'; question: string; options: Record<string, string>; answer: string; why: string }
  | { type: 'puzzle'; fen: string; question: string; answer: string; why: string };

export interface IdeaItem {
  fen: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  why: string;
}

export type LessonBlock =
  | { type: 'text'; title?: string; md: string }
  | { type: 'line'; title: string; intro_md: string; moves: CourseLessonMove[]; outro_md: string; start_fen?: string }
  | { type: 'plan' | 'mistakes' | 'trap' | 'summary'; title: string; md: string }
  | { type: 'quiz'; title: string; items: QuizItem[] }
  | { type: 'idea'; title: string; items: IdeaItem[] };

export interface CourseLesson {
  id: string;
  course_id: string;
  lesson_order: number;
  title: string;
  summary: string;
  plan: string;
  mistakes: string;
  trap: string;
  goal?: string;
  blocks?: LessonBlock[];
  created_at: string;
}

export interface LessonLine {
  id: string;
  lesson_id: string;
  line_order: number;
  moves: CourseLessonMove[];
  title?: string;
  intro_md?: string;
  outro_md?: string;
  start_fen?: string;
}

export interface LessonQuestion {
  id: string;
  lesson_id: string;
  question_order: number;
  fen: string;
  question: string;
  answer: string;
  why?: string;
}

export interface LessonProgress {
  id: string;
  lesson_id: string;
  completed: boolean;
  guess_correct: number;
  guess_total: number;
  completed_at: string | null;
  updated_at: string;
}

export interface CourseLessonFull extends CourseLesson {
  lines: LessonLine[];
  questions: LessonQuestion[];
  progress?: LessonProgress;
}

export interface CourseWithLessons extends Course {
  lessons: CourseLesson[];
  lessonsTotal: number;
  lessonsCompleted: number;
}

export interface TestQuestion {
  question: string;
  options: string[];
  answerIdx: number;
  why?: string;
  fen?: string;
}

export interface WrongRecord extends TestQuestion {
  userAnswerIdx: number;
}

export interface LessonTestRecord {
  id: string;
  lesson_id: string;
  score: number;
  max: number;
  wrong: WrongRecord[];
  taken_at: string;
}

export interface CoursePath {
  id: string;
  title: string;
  created_at: string;
}

export interface CoursePathItem {
  id: string;
  path_id: string;
  course_id: string;
  ord: number;
}
