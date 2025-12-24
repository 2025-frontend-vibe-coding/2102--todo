import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // 인증 성공 시 메인 페이지로 리다이렉트
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // 에러가 있거나 code가 없으면 로그인 페이지로 리다이렉트
  return NextResponse.redirect(new URL("/login?error=auth_callback_error", requestUrl.origin));
}

