import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

// 출력 스키마 정의
const AnalysisSchema = z.object({
  summary: z.string().describe("전체 요약 (완료율, 총 개수 등 포함)"),
  urgentTasks: z.array(z.string()).describe("긴급한 할 일 목록 (제목만)"),
  insights: z.array(z.string()).describe("인사이트 (시간대별 집중도, 우선순위 분포 등)"),
  recommendations: z.array(z.string()).describe("실행 가능한 추천 사항"),
});

export async function POST(request: NextRequest) {
  try {
    const { todos, period } = await request.json();

    // 입력 검증
    if (!todos || !Array.isArray(todos)) {
      return NextResponse.json(
        { error: "할 일 목록이 필요합니다." },
        { status: 400 }
      );
    }

    if (!period || !["today", "week"].includes(period)) {
      return NextResponse.json(
        { error: "분석 기간이 필요합니다. (today 또는 week)" },
        { status: 400 }
      );
    }

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

    // 할 일 통계 계산
    const total = todos.length;
    const completed = todos.filter((t: any) => t.completed).length;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0";
    
    // 우선순위별 통계
    const highPriorityTotal = todos.filter((t: any) => t.priority === "high").length;
    const highPriorityCompleted = todos.filter((t: any) => t.priority === "high" && t.completed).length;
    const highPriorityRate = highPriorityTotal > 0 ? ((highPriorityCompleted / highPriorityTotal) * 100).toFixed(1) : "0";
    
    const mediumPriorityTotal = todos.filter((t: any) => t.priority === "medium").length;
    const mediumPriorityCompleted = todos.filter((t: any) => t.priority === "medium" && t.completed).length;
    const mediumPriorityRate = mediumPriorityTotal > 0 ? ((mediumPriorityCompleted / mediumPriorityTotal) * 100).toFixed(1) : "0";
    
    const lowPriorityTotal = todos.filter((t: any) => t.priority === "low").length;
    const lowPriorityCompleted = todos.filter((t: any) => t.priority === "low" && t.completed).length;
    const lowPriorityRate = lowPriorityTotal > 0 ? ((lowPriorityCompleted / lowPriorityTotal) * 100).toFixed(1) : "0";
    
    const highPriorityPending = todos.filter((t: any) => t.priority === "high" && !t.completed).length;
    const mediumPriorityPending = todos.filter((t: any) => t.priority === "medium" && !t.completed).length;
    const lowPriorityPending = todos.filter((t: any) => t.priority === "low" && !t.completed).length;

    // 마감일 관련 통계
    const withDueDate = todos.filter((t: any) => t.due_date).length;
    const completedOnTime = todos.filter((t: any) => {
      if (!t.due_date || !t.completed) return false;
      const dueDate = new Date(t.due_date);
      const completedDate = new Date(t.created_date);
      return completedDate <= dueDate;
    }).length;
    const onTimeRate = withDueDate > 0 ? ((completedOnTime / withDueDate) * 100).toFixed(1) : "0";
    
    const overdue = todos.filter((t: any) => {
      if (!t.due_date || t.completed) return false;
      return new Date(t.due_date) < new Date();
    }).length;
    
    const upcomingDeadlines = todos.filter((t: any) => {
      if (!t.due_date || t.completed) return false;
      const dueDate = new Date(t.due_date);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return dueDate >= now && dueDate <= tomorrow;
    }).length;

    // 시간대별 분석
    const timeSlots: Record<string, { total: number; completed: number }> = {
      "오전 (09:00-12:00)": { total: 0, completed: 0 },
      "오후 (12:00-18:00)": { total: 0, completed: 0 },
      "저녁 (18:00-21:00)": { total: 0, completed: 0 },
      "밤 (21:00-24:00)": { total: 0, completed: 0 },
    };

    todos.forEach((todo: any) => {
      if (todo.due_time) {
        const [hours] = todo.due_time.split(":").map(Number);
        let slot: string;
        if (hours >= 9 && hours < 12) slot = "오전 (09:00-12:00)";
        else if (hours >= 12 && hours < 18) slot = "오후 (12:00-18:00)";
        else if (hours >= 18 && hours < 21) slot = "저녁 (18:00-21:00)";
        else if (hours >= 21) slot = "밤 (21:00-24:00)";
        else return;
        
        timeSlots[slot].total++;
        if (todo.completed) timeSlots[slot].completed++;
      }
    });

    // 요일별 분석
    const dayOfWeekStats: Record<string, { total: number; completed: number }> = {
      "월요일": { total: 0, completed: 0 },
      "화요일": { total: 0, completed: 0 },
      "수요일": { total: 0, completed: 0 },
      "목요일": { total: 0, completed: 0 },
      "금요일": { total: 0, completed: 0 },
      "토요일": { total: 0, completed: 0 },
      "일요일": { total: 0, completed: 0 },
    };

    todos.forEach((todo: any) => {
      if (todo.due_date) {
        const dueDate = new Date(todo.due_date);
        const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
        const dayName = dayNames[dueDate.getDay()];
        if (dayOfWeekStats[dayName]) {
          dayOfWeekStats[dayName].total++;
          if (todo.completed) dayOfWeekStats[dayName].completed++;
        }
      }
    });

    // 카테고리별 완료 패턴
    const categoryStats: Record<string, { total: number; completed: number }> = {};
    todos.forEach((todo: any) => {
      const category = todo.category || "기타";
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, completed: 0 };
      }
      categoryStats[category].total++;
      if (todo.completed) categoryStats[category].completed++;
    });

    const periodLabel = period === "today" ? "오늘" : "이번 주";
    const currentDate = new Date().toISOString().split("T")[0];

    console.log(`Analyzing todos for ${periodLabel}:`, {
      total,
      completed,
      completionRate,
      highPriorityPending,
      overdue,
      onTimeRate,
    });

    // 가장 생산적인 시간대 찾기
    const mostProductiveTimeSlot = Object.entries(timeSlots)
      .filter(([_, stats]) => stats.total > 0)
      .sort(([_, a], [__, b]) => {
        const rateA = (a.completed / a.total) * 100;
        const rateB = (b.completed / b.total) * 100;
        return rateB - rateA;
      })[0];

    // 가장 생산적인 요일 찾기
    const mostProductiveDay = Object.entries(dayOfWeekStats)
      .filter(([_, stats]) => stats.total > 0)
      .sort(([_, a], [__, b]) => {
        const rateA = (a.completed / a.total) * 100;
        const rateB = (b.completed / b.total) * 100;
        return rateB - rateA;
      })[0];

    // 가장 집중된 시간대 찾기
    const mostConcentratedTimeSlot = Object.entries(timeSlots)
      .sort(([_, a], [__, b]) => b.total - a.total)[0];

    // Gemini를 사용하여 분석 생성
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AnalysisSchema,
      prompt: `${periodLabel} 할 일 목록을 심층 분석하여 요약과 인사이트를 제공해주세요.

=== 기본 통계 ===
- 총 할 일: ${total}개
- 완료: ${completed}개
- 미완료: ${total - completed}개
- 전체 완료율: ${completionRate}%

=== 우선순위별 완료 패턴 ===
- 긴급 (high): ${highPriorityTotal}개 중 ${highPriorityCompleted}개 완료 (${highPriorityRate}%)
- 보통 (medium): ${mediumPriorityTotal}개 중 ${mediumPriorityCompleted}개 완료 (${mediumPriorityRate}%)
- 낮음 (low): ${lowPriorityTotal}개 중 ${lowPriorityCompleted}개 완료 (${lowPriorityRate}%)
- 미완료 긴급 작업: ${highPriorityPending}개
- 미완료 보통 작업: ${mediumPriorityPending}개
- 미완료 낮은 작업: ${lowPriorityPending}개

=== 시간 관리 분석 ===
- 마감일이 있는 할 일: ${withDueDate}개
- 마감일 준수율: ${onTimeRate}% (${completedOnTime}/${withDueDate}개)
- 지연된 할 일: ${overdue}개
- 내일 마감인 할 일: ${upcomingDeadlines}개

=== 시간대별 업무 집중도 및 생산성 ===
${Object.entries(timeSlots)
  .map(([slot, stats]) => {
    const rate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0";
    return `- ${slot}: 총 ${stats.total}개 (완료 ${stats.completed}개, 완료율 ${rate}%)`;
  })
  .join("\n")}
${mostProductiveTimeSlot ? `- 가장 생산적인 시간대: ${mostProductiveTimeSlot[0]} (완료율 ${((mostProductiveTimeSlot[1].completed / mostProductiveTimeSlot[1].total) * 100).toFixed(1)}%)` : ""}
${mostConcentratedTimeSlot ? `- 가장 집중된 시간대: ${mostConcentratedTimeSlot[0]} (${mostConcentratedTimeSlot[1].total}개 할 일)` : ""}

=== 요일별 생산성 패턴 ===
${Object.entries(dayOfWeekStats)
  .filter(([_, stats]) => stats.total > 0)
  .map(([day, stats]) => {
    const rate = ((stats.completed / stats.total) * 100).toFixed(1);
    return `- ${day}: 총 ${stats.total}개 (완료 ${stats.completed}개, 완료율 ${rate}%)`;
  })
  .join("\n")}
${mostProductiveDay ? `- 가장 생산적인 요일: ${mostProductiveDay[0]} (완료율 ${((mostProductiveDay[1].completed / mostProductiveDay[1].total) * 100).toFixed(1)}%)` : ""}

=== 카테고리별 완료 패턴 ===
${Object.entries(categoryStats)
  .map(([category, stats]) => {
    const rate = ((stats.completed / stats.total) * 100).toFixed(1);
    return `- ${category}: 총 ${stats.total}개 (완료 ${stats.completed}개, 완료율 ${rate}%)`;
  })
  .join("\n")}

=== 할 일 상세 목록 ===
${todos.map((todo: any, index: number) => {
  const status = todo.completed ? "✅ 완료" : "⏳ 진행중";
  const priority = todo.priority === "high" ? "🔴 긴급" : todo.priority === "medium" ? "🟡 보통" : "🟢 낮음";
  const dueInfo = todo.due_date ? `마감: ${todo.due_date} ${todo.due_time || ""}` : "마감일 없음";
  const category = todo.category || "기타";
  const isOverdue = !todo.completed && todo.due_date && new Date(todo.due_date) < new Date();
  const overdueMark = isOverdue ? " ⚠️ 지연" : "";
  return `${index + 1}. ${status} ${priority} [${category}] "${todo.title}" - ${dueInfo}${overdueMark}`;
}).join("\n")}

=== 심층 분석 요청 ===

${period === "today" ? "오늘의 요약" : "이번주 요약"} 형식으로 다음을 포함하여 분석해주세요:

1. summary: ${periodLabel}의 할 일 현황을 간단히 요약 (완료율, 총 개수, 주요 성과 포함)
   - 완료율이 70% 이상이면 "훌륭한 진행률" 등 긍정적 표현
   - 완료율이 50% 미만이면 "개선의 여지가 있습니다" 등 격려적 표현

2. urgentTasks: 긴급하고 미완료인 할 일의 제목만 배열로 (최대 5개)
   - 지연된 할 일 우선 표시
   - 내일 마감인 할 일 포함

3. insights: 다음을 모두 포함한 심층 인사이트 (각각 한 문장, 자연스러운 한국어):
   a) 완료율 분석:
      - 전체 완료율 평가 및 우선순위별 완료 패턴 비교
      - 긴급 작업의 완료율이 높으면 "긴급한 일을 우선 처리하는 좋은 습관" 등 긍정적 피드백
      - 우선순위별 차이가 크면 "낮은 우선순위 작업도 놓치지 않도록" 등 개선 제안
   
   b) 시간 관리 분석:
      - 마감일 준수율 평가 (${onTimeRate}% 기준)
      - 지연된 할 일이 있다면 패턴 분석 (예: "긴급 작업이 자주 지연되는 경향")
      - 내일 마감인 할 일이 있다면 언급
   
   c) 생산성 패턴:
      - 가장 생산적인 시간대와 요일 언급 (데이터 기반)
      - 시간대별 업무 집중도 분석 (가장 많은 시간대 언급)
      - 완료율이 높은 카테고리 특징 분석
   
   d) 개선점 발견:
      - 자주 미루는 작업 유형 (카테고리, 우선순위 기준)
      - 완료하기 쉬운 작업의 공통 특징 도출

4. recommendations: 실행 가능한 구체적인 추천 사항 (각각 한 문장, 최대 4개):
   a) 시간 관리 팁:
      - 마감일 준수율이 낮으면 "마감일을 1-2일 앞당겨 설정" 등 구체적 제안
      - 지연된 할 일이 많으면 "주간 시작 시 지연된 작업부터 처리" 등
   
   b) 우선순위 조정:
      - 긴급 작업이 많으면 "중요도 재평가로 긴급 작업 줄이기" 제안
      - 우선순위 분산 제안
   
   c) 일정 재배치:
      - 생산적인 시간대에 중요한 작업 배치 제안
      - 업무 과부하 시간대의 작업 분산 전략
   
   d) 동기부여:
      - 잘하고 있는 부분 강조 (예: "오전 시간대 집중도가 높아 생산적")
      - 개선점을 격려하는 긍정적 톤 (예: "작은 개선으로도 큰 변화를 만들 수 있습니다")

=== 작성 규칙 ===
- 한국어로 자연스럽고 친근한 문체 사용 (반말체 또는 존댓말체 일관성 유지)
- 숫자와 통계를 활용하여 구체적으로 작성
- 긍정적이면서도 실용적인 톤 유지
- 사용자가 잘하고 있는 부분을 먼저 강조한 후 개선점 제시
- 추천 사항은 실행 가능하도록 구체적으로 작성 (예: "오전 9-12시에 중요한 작업 배치")
- ${period === "today" ? "오늘 남은 시간을 효율적으로 활용할 수 있는 당일 집중도와 우선순위 제시" : "주간 패턴 분석 및 다음 주 계획 수립을 위한 제안 포함"}

현재 날짜: ${currentDate}`,
    });

    // 결과 반환
    return NextResponse.json({ data: object });
  } catch (error: any) {
    console.error("AI analyze todos error:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause,
    });
    
    // 에러 타입별 처리
    const errorMessage = error.message?.toLowerCase() || "";
    
    if (errorMessage.includes("api key") || errorMessage.includes("api_key") || errorMessage.includes("authentication")) {
      return NextResponse.json(
        { error: "AI 서비스 인증에 실패했습니다. 서버 설정을 확인해주세요." },
        { status: 500 }
      );
    }
    
    if (errorMessage.includes("quota") || 
        errorMessage.includes("rate limit") || 
        errorMessage.includes("429") ||
        errorMessage.includes("resource exhausted")) {
      return NextResponse.json(
        { error: "AI 서비스 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 }
      );
    }

    if (errorMessage.includes("model") || errorMessage.includes("not found")) {
      return NextResponse.json(
        { error: "AI 모델을 사용할 수 없습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      );
    }

    if (errorMessage.includes("network") || errorMessage.includes("timeout") || errorMessage.includes("fetch")) {
      return NextResponse.json(
        { error: "AI 서비스에 연결할 수 없습니다. 네트워크 연결을 확인해주세요." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        error: "AI 분석 중 오류가 발생했습니다. 다시 시도해주세요.",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

