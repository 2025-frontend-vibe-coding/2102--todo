-- ============================================
-- 회원가입 500 에러 해결을 위한 SQL 스크립트
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 1. 기존 트리거 및 함수 삭제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. 트리거 함수 재생성 (더 안전한 버전)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_email TEXT;
  user_name TEXT;
BEGIN
  -- 이메일 추출 (NULL 체크)
  user_email := COALESCE(NEW.email, '');
  
  -- 이름 추출 (metadata에서 먼저, 없으면 이메일에서)
  IF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data->>'name' IS NOT NULL THEN
    user_name := NEW.raw_user_meta_data->>'name';
  ELSE
    user_name := split_part(user_email, '@', 1);
  END IF;
  
  -- 이미 프로필이 존재하는지 확인 (중복 방지)
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    -- 프로필 생성 시도
    INSERT INTO public.users (id, email, name)
    VALUES (NEW.id, user_email, user_name)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 에러 발생 시 로그 기록
    RAISE WARNING 'Error in handle_new_user trigger for user %: %', NEW.id, SQLERRM;
    -- 트리거 에러가 회원가입을 막지 않도록 NEW 반환
    RETURN NEW;
END;
$$;

-- 3. 트리거 재생성
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS 정책 확인 및 재생성
-- users 테이블 INSERT 정책
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. 함수 권한 확인
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;

-- 6. 확인 쿼리
SELECT 
  '트리거 함수 확인' as check_type,
  proname as function_name,
  CASE WHEN proname = 'handle_new_user' THEN '✅ 존재함' ELSE '❌ 없음' END as status
FROM pg_proc 
WHERE proname = 'handle_new_user';

SELECT 
  '트리거 확인' as check_type,
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE WHEN tgname = 'on_auth_user_created' THEN '✅ 존재함' ELSE '❌ 없음' END as status
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';

SELECT 
  'RLS 정책 확인' as check_type,
  policyname as policy_name,
  CASE WHEN policyname = 'Users can insert own profile' THEN '✅ 존재함' ELSE '❌ 없음' END as status
FROM pg_policies 
WHERE tablename = 'users' AND policyname = 'Users can insert own profile';

