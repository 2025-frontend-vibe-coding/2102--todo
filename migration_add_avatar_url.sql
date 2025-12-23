-- ============================================
-- 마이그레이션: users 테이블에 avatar_url 컬럼 추가
-- ============================================
-- 이 스크립트는 Supabase SQL Editor에서 실행하세요.

-- avatar_url 컬럼이 없으면 추가
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.users ADD COLUMN avatar_url TEXT;
    RAISE NOTICE 'avatar_url 컬럼이 성공적으로 추가되었습니다.';
  ELSE
    RAISE NOTICE 'avatar_url 컬럼이 이미 존재합니다.';
  END IF;
END $$;

