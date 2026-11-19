import { redirect } from 'next/navigation';

export default async function PracticeRedirect({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const line = sp.line ? `&line=${sp.line}` : '';
  redirect(`/openings/${id}?mode=review${line}`);
}
