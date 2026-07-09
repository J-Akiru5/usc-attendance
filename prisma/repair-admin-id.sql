-- Step 1: Check the current IDs (run this first to see the mismatch)
SELECT 'auth.users' AS table_name, id, email FROM auth.users WHERE email = 'admin@usc.edu.ph'
UNION ALL
SELECT 'public.users' AS table_name, id, email FROM public.users WHERE email = 'admin@usc.edu.ph';

-- Step 2: If the IDs don't match, run this to repair
-- The correct Supabase Auth ID is: a436a98a-56fc-4ad6-aab4-202c0727e691
-- First check for related records that would block the repair:
SELECT
  (SELECT count(*) FROM public.attendance WHERE "userId" = (SELECT id FROM public.users WHERE email = 'admin@usc.edu.ph')) AS attendance_count,
  (SELECT count(*) FROM public.office_duties WHERE "userId" = (SELECT id FROM public.users WHERE email = 'admin@usc.edu.ph')) AS duty_count;

-- Step 3: If both counts are 0, run this to fix the ID:
-- UPDATE public.users SET id = 'a436a98a-56fc-4ad6-aab4-202c0727e691' WHERE email = 'admin@usc.edu.ph';

-- Step 4: Verify the fix
SELECT 'auth.users' AS table_name, id, email FROM auth.users WHERE email = 'admin@usc.edu.ph'
UNION ALL
SELECT 'public.users' AS table_name, id, email FROM public.users WHERE email = 'admin@usc.edu.ph';
