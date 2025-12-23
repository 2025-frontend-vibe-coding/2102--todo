import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

// 출력 스키마 정의
const TodoSchema = z.object({
  title: z.string().describe("할 일 제목"),
  description: z.string().optional().nullable().describe("할 일 상세 설명"),
  due_date: z.string().optional().nullable().describe("마감일 (YYYY-MM-DD 형식)"),
  due_time: z.string().optional().nullable().describe("마감 시간 (HH:mm 형식, 시간이 없으면 null)"),
  priority: z.enum(["high", "medium", "low"]).describe("우선순위 (high: 높음, medium: 중간, low: 낮음)"),
  category: z.string().optional().nullable().describe("카테고리 (업무, 개인, 학습, 건강, 기타 등)"),
});

// 입력 검증 함수
function validateInput(text: string): { isValid: boolean; error?: string } {
  // 빈 문자열 체크
  if (!text || text.trim().length === 0) {
    return { isValid: false, error: "입력이 비어있습니다. 할 일을 입력해주세요." };
  }

  // 최소 길이 체크 (2자)
  if (text.trim().length < 2) {
    return { isValid: false, error: "입력이 너무 짧습니다. 최소 2자 이상 입력해주세요." };
  }

  // 최대 길이 체크 (500자)
  if (text.length > 500) {
    return { isValid: false, error: "입력이 너무 깁니다. 최대 500자까지 입력 가능합니다." };
  }

  // 특수 문자나 이모지가 과도하게 많은지 체크 (전체의 50% 이상이면 경고)
  const specialCharRegex = /[^\w\s가-힣]/g;
  const specialCharCount = (text.match(specialCharRegex) || []).length;
  if (specialCharCount > text.length * 0.5) {
    return { isValid: false, error: "입력에 특수 문자나 이모지가 너무 많습니다. 할 일 내용을 명확하게 입력해주세요." };
  }

  return { isValid: true };
}

// 전처리 함수
function preprocessInput(text: string): string {
  // 앞뒤 공백 제거
  let processed = text.trim();

  // 연속된 공백을 하나로 통합
  processed = processed.replace(/\s+/g, " ");

  // 대소문자 정규화 (한국어는 대소문자 구분이 없지만, 영어가 포함될 수 있으므로)
  // 의미를 보존하기 위해 대소문자 변환은 하지 않고 공백만 정리

  return processed;
}

// 후처리 함수
function postprocessResult(data: any, currentDate: string): any {
  const result = { ...data };

  // 제목 검증 및 조정
  if (!result.title || typeof result.title !== "string") {
    result.title = "할 일";
  } else {
    // 제목 앞뒤 공백 제거
    result.title = result.title.trim();
    
    // 제목이 너무 긴 경우 (100자 초과) 자동 자르기
    if (result.title.length > 100) {
      result.title = result.title.substring(0, 97) + "...";
    }
    
    // 제목이 너무 짧은 경우 (1자 미만) 기본값 설정
    if (result.title.length < 1) {
      result.title = "할 일";
    }
  }

  // 설명 검증
  if (result.description && typeof result.description === "string") {
    result.description = result.description.trim();
    if (result.description.length === 0) {
      result.description = null;
    }
  } else {
    result.description = null;
  }

  // 날짜 검증 및 과거 날짜 체크
  if (result.due_date && typeof result.due_date === "string") {
    try {
      const dueDate = new Date(result.due_date);
      const today = new Date(currentDate);
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);

      // 과거 날짜인 경우 오늘로 변경
      if (dueDate < today) {
        console.warn(`Past date detected: ${result.due_date}, setting to today: ${currentDate}`);
        result.due_date = currentDate;
      } else {
        // 날짜 형식 검증 (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(result.due_date)) {
          console.warn(`Invalid date format: ${result.due_date}, setting to null`);
          result.due_date = null;
        }
      }
    } catch (error) {
      console.warn(`Invalid date: ${result.due_date}, setting to null`);
      result.due_date = null;
    }
  } else {
    result.due_date = null;
  }

  // 시간 검증
  if (result.due_time && typeof result.due_time === "string") {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(result.due_time)) {
      console.warn(`Invalid time format: ${result.due_time}, setting to null`);
      result.due_time = null;
    }
  } else {
    result.due_time = null;
  }

  // 우선순위 기본값 설정
  if (!result.priority || !["high", "medium", "low"].includes(result.priority)) {
    result.priority = "medium";
  }

  // 카테고리 검증
  if (result.category && typeof result.category === "string") {
    result.category = result.category.trim();
    if (result.category.length === 0) {
      result.category = null;
    }
  } else {
    result.category = null;
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    // 요청 본문 파싱
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "잘못된 요청 형식입니다. JSON 형식으로 입력해주세요." },
        { status: 400 }
      );
    }

    const { text } = body;

    // 입력 타입 검증
    if (typeof text !== "string") {
      return NextResponse.json(
        { error: "입력은 문자열 형식이어야 합니다." },
        { status: 400 }
      );
    }

    // 입력 검증
    const validation = validateInput(text);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // 전처리
    const processedText = preprocessInput(text);

    // API 키 확인
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set in environment variables");
      return NextResponse.json(
        { 
          error: "AI 서비스 설정 오류가 발생했습니다. 환경 변수 GOOGLE_GENERATIVE_AI_API_KEY를 확인해주세요." 
        },
        { status: 500 }
      );
    }

    // 현재 날짜/시간 정보
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(" ")[0].slice(0, 5); // HH:mm

    console.log("Generating todo with AI:", { 
      original: text, 
      processed: processedText, 
      currentDate, 
      currentTime 
    });

    // Gemini 모델 시도 (사용 가능한 모델 이름들)
    // Google AI API에서 실제로 지원하는 모델만 사용
    // gemini-2.5-flash 사용
    const modelNames = [
      "gemini-2.5-flash",         // 최신 Flash 모델 (2.5)
      "gemini-1.5-flash",         // Flash 모델 (1.5 - 백업)
    ];
    let lastError: any = null;
    let object: any = null;

    for (const modelName of modelNames) {
      try {
        console.log(`Trying model: ${modelName}`);
        const result = await generateObject({
          model: google(modelName as any),
          schema: TodoSchema,
          prompt: `다음 자연어 입력을 할 일 데이터로 변환해주세요. 반드시 JSON 형식으로 응답해야 합니다.

입력: "${processedText}"

현재 날짜/시간: ${currentDate} ${currentTime}

=== 필수 변환 규칙 ===

1. 제목(title): 
   - 핵심 내용만 간결하게 추출 (최대 50자)
   - 예: "내일 오후 3시까지 중요한 팀 회의 준비하기" → "팀 회의 준비"

2. 설명(description): 
   - 상세 내용이 있으면 포함, 없으면 null
   - 원본 입력의 맥락을 유지

3. 마감일(due_date) - 현재 날짜(${currentDate})를 기준으로 계산:
   - "오늘" → ${currentDate}
   - "내일" → ${currentDate} + 1일
   - "모레" → ${currentDate} + 2일
   - "이번 주 [요일]" → 가장 가까운 해당 요일
   - "다음 주 [요일]" → 다음 주의 해당 요일
   - "다음주" → 다음 주 월요일
   - 구체적 날짜가 명시되면 그대로 사용 (예: "1월 15일", "2026-01-20")
   - 날짜가 전혀 없으면 null

4. 마감 시간(due_time) - HH:mm 형식:
   - "아침" → "09:00"
   - "점심" → "12:00"
   - "오후" → "14:00"
   - "저녁" → "18:00"
   - "밤" → "21:00"
   - "오전 [N]시" → "0N:00" (예: "오전 10시" → "10:00")
   - "오후 [N]시" → "[N+12]:00" (예: "오후 3시" → "15:00")
   - "N시" → "0N:00" (예: "9시" → "09:00")
   - "N:MM" 형식이면 그대로 사용
   - 시간이 명시되지 않았으면 null

5. 우선순위(priority) - 반드시 다음 키워드 기준:
   - "high": "급하게", "중요한", "빨리", "꼭", "반드시" 키워드가 있으면
   - "medium": "보통", "적당히" 키워드가 있거나 키워드가 없을 때
   - "low": "여유롭게", "천천히", "언젠가" 키워드가 있으면

6. 카테고리(category) - 다음 키워드 기준:
   - "업무": "회의", "보고서", "프로젝트", "업무" 키워드가 있으면
   - "개인": "쇼핑", "친구", "가족", "개인" 키워드가 있으면
   - "건강": "운동", "병원", "건강", "요가" 키워드가 있으면
   - "학습": "공부", "책", "강의", "학습" 키워드가 있으면
   - 명확하지 않으면 null

=== 출력 형식 ===
반드시 JSON 형식으로 응답해야 하며, 다음 필드를 포함해야 합니다:
- title: string (필수)
- description: string | null
- due_date: string | null (YYYY-MM-DD 형식)
- due_time: string | null (HH:mm 형식)
- priority: "high" | "medium" | "low" (필수)
- category: string | null

=== 예시 ===
입력: "내일 오후 3시까지 중요한 팀 회의 준비하기"
출력: {
  "title": "팀 회의 준비",
  "description": "내일 오후 3시까지 중요한 팀 회의 준비하기",
  "due_date": "${currentDate}",
  "due_time": "15:00",
  "priority": "high",
  "category": "업무"
}

입력: "다음 주 월요일 아침 운동하기"
출력: {
  "title": "운동하기",
  "description": null,
  "due_date": "[다음 주 월요일 날짜]",
  "due_time": "09:00",
  "priority": "medium",
  "category": "건강"
}

위 규칙을 정확히 따르고, 현재 날짜(${currentDate})를 기준으로 날짜를 계산해주세요.`,
        });
        object = result.object;
        console.log(`Successfully generated with model: ${modelName}`);
        break;
      } catch (modelError: any) {
        console.warn(`Model ${modelName} failed:`, {
          message: modelError.message,
          name: modelError.name,
          code: modelError.code,
        });
        lastError = modelError;
        // 다음 모델 시도
        continue;
      }
    }

    if (!object) {
      // 모든 모델 실패
      console.error("All models failed. Last error:", {
        message: lastError?.message,
        name: lastError?.name,
        stack: lastError?.stack,
        cause: lastError?.cause,
      });

      // 마지막 에러 메시지 분석
      const errorMessage = lastError?.message?.toLowerCase() || "";
      
      // Rate Limit / Quota 오류
      if (errorMessage.includes("quota") || 
          errorMessage.includes("rate limit") || 
          errorMessage.includes("429") ||
          errorMessage.includes("resource exhausted")) {
        return NextResponse.json(
          { error: "AI 서비스 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요." },
          { status: 429 }
        );
      }

      // API 키 오류
      if (errorMessage.includes("api key") || errorMessage.includes("api_key") || errorMessage.includes("authentication")) {
        return NextResponse.json(
          { error: "AI 서비스 인증에 실패했습니다. 서버 설정을 확인해주세요." },
          { status: 500 }
        );
      }

      // 모델 오류 - 더 구체적인 메시지
      if (errorMessage.includes("model") || 
          errorMessage.includes("not found") ||
          errorMessage.includes("invalid model") ||
          errorMessage.includes("model not found") ||
          errorMessage.includes("404")) {
        console.error("Model error details:", {
          lastError: lastError?.message,
          availableModels: modelNames,
        });
        return NextResponse.json(
          { 
            error: "AI 모델을 사용할 수 없습니다. 서버 설정을 확인해주세요.",
            details: process.env.NODE_ENV === "development" 
              ? `시도한 모델: ${modelNames.join(", ")}. 에러: ${lastError?.message}` 
              : undefined
          },
          { status: 500 }
        );
      }

      // 네트워크 오류
      if (errorMessage.includes("network") || errorMessage.includes("timeout") || errorMessage.includes("fetch")) {
        return NextResponse.json(
          { error: "AI 서비스에 연결할 수 없습니다. 네트워크 연결을 확인해주세요." },
          { status: 500 }
        );
      }

      // 기타 오류
      return NextResponse.json(
        { 
          error: "AI가 할 일을 생성하는 데 실패했습니다. 입력을 다시 확인하거나 잠시 후 다시 시도해주세요.",
          details: process.env.NODE_ENV === "development" ? lastError?.message : undefined
        },
        { status: 500 }
      );
    }

    // 후처리
    const processedResult = postprocessResult(object, currentDate);

    console.log("AI generation result:", {
      original: object,
      processed: processedResult,
    });

    // 결과 반환
    return NextResponse.json({ data: processedResult });
  } catch (error: any) {
    console.error("AI generate todo error:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause,
    });
    
    // 에러 타입별 처리
    const errorMessage = error.message?.toLowerCase() || "";
    
    // API 키 오류 (500)
    if (errorMessage.includes("api key") || errorMessage.includes("api_key") || errorMessage.includes("authentication")) {
      return NextResponse.json(
        { error: "AI 서비스 인증에 실패했습니다. 서버 설정을 확인해주세요." },
        { status: 500 }
      );
    }
    
    // Rate Limit / Quota 오류 (429)
    if (errorMessage.includes("quota") || 
        errorMessage.includes("rate limit") || 
        errorMessage.includes("429") ||
        errorMessage.includes("resource exhausted")) {
      return NextResponse.json(
        { error: "AI 서비스 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 }
      );
    }

    // 모델 오류 (500)
    if (errorMessage.includes("model") || errorMessage.includes("not found")) {
      return NextResponse.json(
        { error: "AI 모델을 사용할 수 없습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      );
    }

    // 네트워크 오류 (500)
    if (errorMessage.includes("network") || errorMessage.includes("timeout") || errorMessage.includes("fetch")) {
      return NextResponse.json(
        { error: "AI 서비스에 연결할 수 없습니다. 네트워크 연결을 확인해주세요." },
        { status: 500 }
      );
    }

    // 기타 오류 (500)
    return NextResponse.json(
      { 
        error: "AI 할 일 생성 중 오류가 발생했습니다. 다시 시도해주세요.",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

