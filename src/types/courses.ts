export interface Course {
  id: string;
  slug: string;
  name: string;
  color: 'white' | 'black' | 'both';
  opening: string;
  description: string;
  difficulty: number;
  created_at: string;
}

export interface Arrow {
  from: string;
  to: string;
}

export interface CourseLessonMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: 'w' | 'b';
  comment: string | null;
  arrows: Arrow[];
}

export interface CourseLesson {
  id: string;
  course_id: string;
  lesson_order: number;
  title: string;
  summary: string;
  plan: string;
  mistakes: string;
  trap: string;
  created_at: string;
}

export interface LessonLine {
  id: string;
  lesson_id: string;
  line_order: number;
  moves: CourseLessonMove[];
}

export interface LessonQuestion {
  id: string;
  lesson_id: string;
  question_order: number;
  fen: string;
  question: string;
  answer: string;
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
