# Supabase 회원가입 500 에러 해결 가이드

## 🔍 문제 상황
회원가입 시 `500 Internal Server Error` 발생 (`x-sb-error-code: unexpected_failure`)

## ✅ 사용자가 해야 할 작업

### 1단계: Supabase 대시보드에서 에러 로그 확인

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard 접속
   - 프로젝트 선택

2. **Logs 확인**
   - 왼쪽 메뉴: `Logs` → `Postgres Logs` 또는 `API Logs` 클릭
   - 최근 에러 메시지 확인
   - `handle_new_user` 또는 `on_auth_user_created` 관련 에러 찾기

3. **에러 메시지 복사**
   - 에러 메시지 전체를 복사하여 저장

---

### 2단계: 데이터베이스 트리거 함수 확인 및 수정 ⚡ **가장 중요!**

**⚠️ 이 단계를 먼저 실행하세요!**

1. **Supabase 대시보드 → SQL Editor 접속**

2. **`fix_signup_error.sql` 파일의 전체 내용을 복사하여 SQL Editor에 붙여넣고 실행**

   또는 다음 SQL을 직접 실행:

```sql
-- 기존 트리거 및 함수 삭제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 트리거 함수 재생성 (더 안전한 버전)
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

-- 트리거 재생성
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 함수 권한 부여
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;
```

3. **실행 후 확인:**
```sql
-- 트리거 함수 확인
SELECT proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- 트리거 확인
SELECT tgname as trigger_name, tgrelid::regclass as table_name
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';
```

---

### 3단계: RLS 정책 확인

1. **Supabase 대시보드 → Authentication → Policies**

2. **`public.users` 테이블의 정책 확인:**
   - `Users can insert own profile` 정책이 존재하는지 확인
   - 정책이 없다면 `schema.sql`의 RLS 정책을 SQL Editor에서 실행

3. **RLS 정책 재생성 (필요한 경우):**
```sql
-- users 테이블 INSERT 정책 확인 및 재생성
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);
```

---

### 4단계: 이메일 발송 설정 확인

1. **Supabase 대시보드 → Authentication → Settings**

2. **Email Auth 설정 확인:**
   - ✅ "Enable email confirmations" 활성화되어 있는지 확인
   - ✅ "Confirm email" 활성화되어 있는지 확인

3. **SMTP 설정 확인 (Custom SMTP 사용 시):**
   - Authentication → Settings → SMTP Settings
   - SMTP 서버 정보가 올바른지 확인

4. **URL Configuration 확인:**
   - Site URL: `http://localhost:3000` (개발 환경)
   - Redirect URLs에 `http://localhost:3000/auth/callback` 포함되어 있는지 확인

---

### 5단계: 임시 해결 방법 (테스트용)

이메일 발송 문제를 확인하기 위해 일시적으로 이메일 인증을 비활성화:

1. **Supabase 대시보드 → Authentication → Settings**
2. **"Enable email confirmations" 비활성화**
3. **회원가입 재시도**
4. **회원가입이 성공하면 → 이메일 발송 설정 문제임**
5. **테스트 후 다시 활성화**

---

## 📋 체크리스트

회원가입 500 에러 해결을 위해 다음을 확인하세요:

- [ ] Supabase Logs에서 에러 메시지 확인
- [ ] `handle_new_user` 트리거 함수 존재 및 정상 작동 확인
- [ ] `on_auth_user_created` 트리거 존재 확인
- [ ] `public.users` 테이블의 INSERT RLS 정책 확인
- [ ] Email Auth 설정 확인
- [ ] Redirect URLs 설정 확인
- [ ] (선택) 이메일 인증 비활성화 테스트

---

## 🆘 추가 도움이 필요한 경우

위 단계를 모두 확인했는데도 문제가 해결되지 않으면:

1. **Supabase Logs의 전체 에러 메시지** 복사
2. **브라우저 콘솔의 전체 에러 로그** 복사
3. **에러 발생 시점의 정확한 시간** 기록

이 정보들을 함께 공유해주시면 더 정확한 해결 방법을 제시할 수 있습니다.

