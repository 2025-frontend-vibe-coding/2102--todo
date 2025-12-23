"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowLeft, Sparkles, AlertCircle, Upload, Loader2, CheckCircle2, User, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

interface ProfileFormData {
  name: string;
  avatar_url?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<{ id: string; email: string; name: string; avatar_url?: string | null } | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ProfileFormData>();

  const nameValue = watch("name");

  // 프로필 정보 가져오기
  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          router.push("/login");
          return;
        }

        // 사용자 프로필 정보 가져오기 (maybeSingle로 변경하여 row가 없어도 에러 안 남)
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("email, name, avatar_url")
          .eq("id", authUser.id)
          .maybeSingle();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Error fetching profile:", profileError);
        }

        const userData = {
          id: authUser.id,
          email: profile?.email || authUser.email || "",
          name: profile?.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "사용자",
          avatar_url: profile?.avatar_url || null,
        };

        setUser(userData);
        setValue("name", userData.name);
        if (userData.avatar_url) {
          setAvatarPreview(userData.avatar_url);
          setValue("avatar_url", userData.avatar_url);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        setErrorMessage("프로필을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchProfile();
  }, [router, setValue]);

  // 프로필 사진 선택 핸들러
  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 파일 타입 검증
    if (!file.type.startsWith("image/")) {
      setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    // 파일 크기 검증 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("이미지 크기는 5MB 이하여야 합니다.");
      return;
    }

    setIsUploadingAvatar(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setErrorMessage("인증된 사용자 정보가 없습니다.");
        setIsUploadingAvatar(false);
        return;
      }

      // 미리보기를 위해 FileReader 사용
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setAvatarPreview(base64String);
      };
      reader.readAsDataURL(file);

      // Supabase Storage에 업로드
      const fileExt = file.name.split(".").pop();
      const fileName = `${authUser.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // 기존 프로필 사진이 있으면 삭제
      if (user.avatar_url && user.avatar_url.includes("supabase")) {
        const oldFileName = user.avatar_url.split("/").pop();
        if (oldFileName) {
          await supabase.storage.from("avatars").remove([oldFileName]);
        }
      }

      // 새 파일 업로드
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading avatar:", uploadError);
        // Storage가 설정되지 않은 경우 Base64로 대체
        const reader2 = new FileReader();
        reader2.onloadend = () => {
          const base64String = reader2.result as string;
          setAvatarPreview(base64String);
          setValue("avatar_url", base64String);
          setIsUploadingAvatar(false);
        };
        reader2.readAsDataURL(file);
        return;
      }

      // 업로드된 파일의 공개 URL 가져오기
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      setAvatarPreview(publicUrl);
      setValue("avatar_url", publicUrl);
      setIsUploadingAvatar(false);
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      setErrorMessage("프로필 사진 업로드 중 오류가 발생했습니다.");
      setIsUploadingAvatar(false);
    }
  };

  // 프로필 사진 제거
  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    setValue("avatar_url", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 프로필 업데이트 핸들러
  const onSubmit = async (data: ProfileFormData) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setErrorMessage("인증된 사용자 정보가 없습니다.");
        setIsLoading(false);
        return;
      }

      // 프로필 업데이트
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: data.name,
          avatar_url: data.avatar_url || null,
        })
        .eq("id", authUser.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        setErrorMessage("프로필 업데이트 중 오류가 발생했습니다.");
        setIsLoading(false);
        return;
      }

      setSuccessMessage("프로필이 성공적으로 업데이트되었습니다.");
      
      // 메인 페이지로 이동 (완전히 새로고침하여 변경사항 반영)
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      setErrorMessage("프로필 업데이트 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">프로필을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* 헤더 */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="size-4 mr-2" />
            뒤로 가기
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <Sparkles className="size-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">프로필 수정</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            프로필 정보를 수정할 수 있습니다.
          </p>
        </div>

        {/* 에러 메시지 */}
        {errorMessage && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="size-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {/* 성공 메시지 */}
        {successMessage && (
          <Alert className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="size-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* 프로필 수정 폼 */}
        <Card>
          <CardHeader>
            <CardTitle>프로필 정보</CardTitle>
            <CardDescription>
              닉네임과 프로필 사진을 변경할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 프로필 사진 */}
              <div className="space-y-4">
                <Label>프로필 사진</Label>
                <div className="flex items-center gap-6">
                  <Avatar className="size-24">
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt={user.name} />
                    ) : (
                      <AvatarFallback className="text-2xl">
                        {nameValue?.charAt(0).toUpperCase() || user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                      >
                        {isUploadingAvatar ? (
                          <>
                            <Loader2 className="size-4 mr-2 animate-spin" />
                            업로드 중...
                          </>
                        ) : (
                          <>
                            <Upload className="size-4 mr-2" />
                            사진 선택
                          </>
                        )}
                      </Button>
                      {avatarPreview && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveAvatar}
                        >
                          제거
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, GIF 형식, 최대 5MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarSelect}
                    className="hidden"
                  />
                </div>
              </div>

              {/* 이메일 (읽기 전용) */}
              <Field>
                <FieldLabel>
                  <Mail className="size-4 mr-2 inline" />
                  이메일
                </FieldLabel>
                <FieldContent>
                  <Input
                    type="email"
                    value={user.email}
                    disabled
                    className="bg-muted"
                  />
                </FieldContent>
                <p className="text-xs text-muted-foreground mt-1">
                  이메일은 변경할 수 없습니다.
                </p>
              </Field>

              {/* 닉네임 */}
              <Field>
                <FieldLabel>
                  <User className="size-4 mr-2 inline" />
                  닉네임
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...register("name", {
                      required: "닉네임을 입력해주세요.",
                      minLength: {
                        value: 2,
                        message: "닉네임은 최소 2자 이상이어야 합니다.",
                      },
                      maxLength: {
                        value: 20,
                        message: "닉네임은 최대 20자까지 입력할 수 있습니다.",
                      },
                    })}
                    placeholder="닉네임을 입력하세요"
                  />
                </FieldContent>
                {errors.name && <FieldError>{errors.name.message}</FieldError>}
              </Field>

              {/* 저장 버튼 */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    "저장"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  취소
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

