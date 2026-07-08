-- USC Attendance System v2.0 — Officer Seed SQL
-- Run this in Supabase SQL Editor after auth accounts are created

-- Clean up test user
DELETE FROM users WHERE email = 'test@example.com';

-- Insert officers (uses auth IDs from Supabase Auth)
INSERT INTO users (id, email, name, position, role, "mustChangePassword", active, "createdAt")
VALUES
  ('5956f883-cd83-4fb1-94ba-91f912d2639a', 'jdemonteverde@isufst.edu.ph', 'Jared S. Demonteverde', 'President', 'super_admin', true, true, NOW()),
  ('cb64887b-e2ae-48f1-a3ec-ef7362610b5e', 'kbicodo@isufst.edu.ph', 'Katherine Anne B. Bicodo', 'Vice President', 'staff', true, true, NOW()),
  ('1935fdfa-50c3-473b-8ade-855bba410cec', 'ndanugrao@isufst.edu.ph', 'Nikki Loraine B. Danugrao', 'Secretary', 'staff', true, true, NOW()),
  ('31db40f2-20e3-45a2-98cc-46c35e5e20a4', 'ddaguro@isufst.edu.ph', 'Dein Andrey D. Daguro', 'Senate Press', 'staff', true, true, NOW()),
  ('016b3f22-1208-499e-a780-d0f2922a1c86', 'lparcia@isufst.edu.ph', 'Lianne B. Parcia', 'Auditor', 'staff', true, true, NOW()),
  ('cff850cd-2a20-442e-9951-75e7e3a77b3f', 'raquino@isufst.edu.ph', 'Rena Grace B. Aquiño', 'Spokesperson', 'staff', true, true, NOW()),
  ('a62ada83-8ef2-44dc-8147-f3b69b01b47a', 'cmanderico@isufst.edu.ph', 'Chene D. Manderico', 'Senator', 'client', true, true, NOW()),
  ('47f1c7cd-2d98-4059-a112-da3fbd8f3e9b', 'ndeang@isufst.edu.ph', 'Nezie Ann A. Deang', 'Senator', 'client', true, true, NOW()),
  ('c0b7111e-3a0b-400c-a30c-0a9948300dbf', 'jnatalio@isufst.edu.ph', 'John David A. Natalio', 'Senator', 'client', true, true, NOW()),
  ('f08a8ac4-dbe6-42ad-bec6-a3fa57c15c4f', 'jbalinas@isufst.edu.ph', 'John Emiel P. Balinas', 'Senator', 'client', true, true, NOW()),
  ('853f0eaf-f25e-41f5-8c36-5bd2f8f6d233', 'jmartinez@isufst.edu.ph', 'Jeff Edrick C. Martinez', 'Senator', 'client', true, true, NOW()),
  ('20b48535-10c9-411b-89a1-e2ec06a8a850', 'aperisme@isufst.edu.ph', 'Andro Renz D. Perisme', 'Senator', 'client', true, true, NOW()),
  ('b5f99437-b150-48b5-b98e-f96811971fd9', 'ralmirante@isufst.edu.ph', 'Reynald S. Almirante', 'Senator', 'client', true, true, NOW()),
  ('ef90bc32-6612-4cd3-886f-318dc19a55c3', 'jfrial@isufst.edu.ph', 'Jona Ross P. Frial', 'Senator', 'client', true, true, NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  position = EXCLUDED.position,
  role = EXCLUDED.role,
  "mustChangePassword" = true,
  active = true;
