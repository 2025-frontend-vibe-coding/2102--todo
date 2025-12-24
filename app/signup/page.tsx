"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { CheckCircle2, Sparkles, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";

interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = React.useState(true);
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<SignupFormData>();

  const password = watch("password");

  // 로그인된 사용자 확인 - 이미 로그인되어 있으면 메인 페이지로 리다이렉트
  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // 이미 로그인되어 있으면 메인 페이지로 리다이렉트
          router.push("/");
          router.refresh();
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();

    // 인증 상태 변경 감지
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.push("/");
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const getErrorMessage = (error: { message?: string } | null | undefined): string => {
    if (error?.message) {
      if (error.message.includes("already registered")) {
        return "이미 등록된 이메일입니다.";
      }
      if (error.message.includes("Password")) {
        return "비밀번호가 너무 짧습니다. 최소 6자 이상이어야 합니다.";
      }
      if (error.message.includes("Invalid email")) {
        return "올바른 이메일 형식이 아닙니다.";
      }
      return error.message;
    }
    return "회원가입 중 오류가 발생했습니다. 다시 시도해주세요.";
  };

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();

      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        // emailRedirectTo: `${window.location.origin}/auth/callback`,
      });

      // 에러 상세 로깅
      if (error) {
        // 에러 객체의 모든 속성 확인
        const errorDetails: Record<string, unknown> = {
          message: error.message,
          status: error.status,
          name: error.name,
          cause: error.cause,
          toString: error.toString(),
        };

        // 에러 객체의 모든 속성을 순회하여 추가 정보 수집
        try {
          const errorObj = error as unknown as Record<string, unknown>;
          Object.keys(errorObj).forEach((key) => {
            if (!errorDetails[key]) {
              errorDetails[key] = errorObj[key];
            }
          });
        } catch (e) {
          console.warn("Error parsing error object:", e);
        }

        console.error("❌ Signup Error (상세):", errorDetails);
        try {
          console.error("❌ Signup Error (전체 객체):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        } catch {
          console.error("❌ Signup Error (직렬화 실패):", error);
        }

        // 500 에러인 경우 특별 처리
        if (error.status === 500) {
          console.error("🚨 500 Internal Server Error - Supabase 서버 오류");
          console.error("가능한 원인:");
          console.error("1. 데이터베이스 트리거 오류 (handle_new_user 함수)");
          console.error("2. RLS 정책 문제");
          console.error("3. 이메일 발송 설정 문제");
          console.error("4. Supabase 대시보드 → Logs에서 상세 에러 확인 필요");
        }

        // // 이메일 발송 실패 에러인지 확인
        // if (
        //   error.message?.includes("Error sending confirmation email") ||
        //   error.message?.includes("sending confirmation email") ||
        //   error.message?.toLowerCase().includes("email")
        // ) {
        //   const userId = authData?.user ? (authData.user as { id: string }).id : null;
        //   console.error("📧 이메일 발송 실패 감지:", {
        //     errorMessage: error.message,
        //     errorStatus: error.status,
        //     userCreated: !!authData?.user,
        //     userId: userId,
        //     email: data.email,
        //   });
        // }

        setErrorMessage(getErrorMessage(error));
        return;
      }

      // 회원가입 성공
      if (authData.user) {
        console.log("✅ 회원가입 성공:", {
          userId: authData.user.id,
          email: authData.user.email,
          // emailConfirmed: authData.user.email_confirmed_at,
          // confirmationSent: authData.user.confirmation_sent_at,
          hasSession: !!authData.session,
        });

        // // 이메일 확인이 필요한 경우
        // if (!authData.session) {
        //   if (authData.user.confirmation_sent_at) {
        //     console.log("📧 이메일 인증 메일 발송됨:", authData.user.confirmation_sent_at);
        //   } else {
        //     console.warn("⚠️ 이메일 인증 메일이 발송되지 않음 (confirmation_sent_at이 null)");
        //   }
        //   setSuccessMessage(
        //     "회원가입이 완료되었습니다. 이메일을 확인하여 계정을 활성화해주세요."
        //   );
        // } else {
        //   // 이메일 확인이 필요 없는 경우 (설정에 따라)
        //   console.log("✅ 이메일 인증 없이 로그인됨");
        //   setSuccessMessage("회원가입이 완료되었습니다. 메인 페이지로 이동합니다.");
        //   setTimeout(() => {
        //     router.push("/");
        //   }, 2000);
        // }

        // 이메일 인증 없이 바로 로그인 처리
        setSuccessMessage("회원가입이 완료되었습니다. 메인 페이지로 이동합니다.");
        setTimeout(() => {
          router.push("/");
        }, 2000);
      } else {
        console.error("❌ 사용자 데이터가 반환되지 않음");
      }
    } catch (error) {
      console.error("Signup error:", error);
      const errorObj = error instanceof Error 
        ? { message: error.message } 
        : error && typeof error === 'object' && 'message' in error
        ? { message: String(error.message) }
        : null;
      setErrorMessage(getErrorMessage(errorObj));
    } finally {
      setIsLoading(false);
    }
  };

  // 인증 확인 중이면 로딩 표시
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
        <div className="text-center">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* 로고 및 소개 섹션 */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10">
              <Sparkles className="size-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Todo AI</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            AI 기반 할 일 관리로 생산성을 극대화하세요
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground pt-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-primary" />
              <span>자연어 기반 할 일 생성</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-primary" />
              <span>AI 요약 및 분석</span>
            </div>
          </div>
        </div>

        {/* 회원가입 폼 */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">회원가입</CardTitle>
            <CardDescription>
              이메일과 비밀번호를 입력하여 계정을 만드세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert className="mb-6 border-primary/50 bg-primary/5">
                <CheckCircle2 className="size-4 text-primary" />
                <AlertDescription className="text-foreground">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <Field>
                <FieldLabel htmlFor="email">
                  이메일 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    {...register("email", {
                      required: "이메일을 입력해주세요",
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: "올바른 이메일 형식이 아닙니다",
                      },
                    })}
                    aria-invalid={errors.email ? "true" : "false"}
                    disabled={isLoading}
                  />
                  <FieldError errors={errors.email ? [errors.email] : []} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">
                  비밀번호 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="password"
                    type="password"
                    placeholder="비밀번호를 입력하세요 (최소 6자)"
                    {...register("password", {
                      required: "비밀번호를 입력해주세요",
                      minLength: {
                        value: 6,
                        message: "비밀번호는 최소 6자 이상이어야 합니다",
                      },
                    })}
                    aria-invalid={errors.password ? "true" : "false"}
                    disabled={isLoading}
                  />
                  <FieldError errors={errors.password ? [errors.password] : []} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">
                  비밀번호 확인 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
                    {...register("confirmPassword", {
                      required: "비밀번호 확인을 입력해주세요",
                      validate: (value) =>
                        value === password || "비밀번호가 일치하지 않습니다",
                    })}
                    aria-invalid={errors.confirmPassword ? "true" : "false"}
                    disabled={isLoading}
                  />
                  <FieldError
                    errors={errors.confirmPassword ? [errors.confirmPassword] : []}
                  />
                </FieldContent>
              </Field>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? "가입 중..." : "회원가입"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">이미 계정이 있으신가요? </span>
              <Link
                href="/login"
                className="text-primary font-medium hover:underline underline-offset-4"
              >
                로그인
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 추가 정보 */}
        {/* <p className="text-center text-xs text-muted-foreground">
          회원가입 시 이메일 인증 메일이 발송됩니다. 이메일을 확인해주세요.
        </p> */}
      </div>
    </div>
  );
}