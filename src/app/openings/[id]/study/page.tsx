import { redirect } from 'next/navigation';

export default async function StudyRedirect({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/openings/${id}?mode=learn`);
}
