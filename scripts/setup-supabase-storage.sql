--
-- Supabase Storage Buckets & Policies
-- Run this in the Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/<your-project>/sql/new
--
-- Paste the entire script and click "Run".
-- Replace <your-project> in the bucket URLs below with your actual Supabase project ref.
--

----------------------------------------------
-- 1. CREATE BUCKETS
----------------------------------------------

-- VIDEOS bucket (public, 250 MB limit, video MIME types only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  262144000,  -- 250 MB
  ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
) ON CONFLICT (id) DO UPDATE SET
  public              = true,
  file_size_limit     = 262144000,
  allowed_mime_types  = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

-- PROFILES bucket (public, 5 MB limit, image MIME types only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiles',
  'profiles',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']
) ON CONFLICT (id) DO UPDATE SET
  public              = true,
  file_size_limit     = 5242880,
  allowed_mime_types  = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'];


----------------------------------------------
-- 2. VIDEOS BUCKET POLICIES
--    Everyone can view. Authenticated users can manage.
----------------------------------------------

-- Public read access (anyone can view/download videos)
CREATE POLICY "Public read videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

-- Authenticated upload
CREATE POLICY "Authenticated upload videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'videos');

-- Authenticated update (e.g. rename, move)
CREATE POLICY "Authenticated update videos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'videos');

-- Authenticated delete
CREATE POLICY "Authenticated delete videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'videos');


----------------------------------------------
-- 3. PROFILES BUCKET POLICIES
--    Everyone can view. Authenticated users can manage.
----------------------------------------------

-- Public read access
CREATE POLICY "Public read profiles"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profiles');

-- Authenticated upload
CREATE POLICY "Authenticated upload profiles"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'profiles');

-- Authenticated update
CREATE POLICY "Authenticated update profiles"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'profiles');

-- Authenticated delete
CREATE POLICY "Authenticated delete profiles"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'profiles');


----------------------------------------------
-- VERIFICATION QUERIES (run separately)
----------------------------------------------

-- List all buckets:
-- SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;

-- List all storage policies:
-- SELECT * FROM storage.policies WHERE bucket_id IN ('videos', 'profiles');

-- After uploading a file, the public URL format is:
--   VIDEOS:   https://<your-project>.supabase.co/storage/v1/object/public/videos/<filename>
--   PROFILES: https://<your-project>.supabase.co/storage/v1/object/public/profiles/<filename>
