# Chess 1200 — Setup

## 1. Supabase
1. Create project at supabase.com
2. Run `supabase/schema.sql` in the SQL editor
3. Copy Project URL and anon key to `.env.local`

## 2. Local dev
npm run dev

## 3. Deploy (Vercel)
Connect GitHub repo → Vercel will auto-deploy.
Add env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

## chess.com username
rozt1shka — configured in src/lib/constants.ts
