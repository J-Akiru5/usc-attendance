-- Step 1: Check the current IDs (run this first to see the mismatch)
SELECT 'auth.users' AS table_name, id::text, email FROM auth.users WHERE email = 'admin@usc.edu.ph'
UNION ALL
SELECT 'public.users' AS table_name, id::text, email FROM public.users WHERE email = 'admin@usc.edu.ph';

-- Step 2: Check for related records that would block the repair
SELECT
  (SELECT count(*) FROM public.attendance WHERE "userId" = (SELECT id FROM public.users WHERE email = 'admin@usc.edu.ph')) AS attendance_count,
  (SELECT count(*) FROM public.office_duties WHERE "userId" = (SELECT id FROM public.users WHERE email = 'admin@usc.edu.ph')) AS duty_count;

-- Step 3: If both counts are 0, run this to fix the ID:
-- The correct Supabase Auth ID is: a436a98a-56fc-4ad6-aab4-202c0727e691
-- UPDATE public.users SET id = 'a436a98a-56fc-4ad6-aab4-202c0727e691' WHERE email = 'admin@usc.edu.ph';

-- Step 4: Verify the fix (run after Step 3)
-- SELECT 'auth.users' AS table_name, id::text, email FROM auth.users WHERE email = 'admin@usc.edu.ph'
-- UNION ALL
-- SELECT 'public.users' AS table_name, id::text, email FROM public.users WHERE email = 'admin@usc.edu.ph';
