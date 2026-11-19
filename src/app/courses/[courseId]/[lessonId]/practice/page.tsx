import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function LessonPracticeRedirect({ params }: Props) {
  const { courseId, lessonId } = await params;
  redirect(`/courses/${courseId}/${lessonId}?mode=play`);
}
