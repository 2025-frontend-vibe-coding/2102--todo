"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { CalendarIcon, Sparkles, Loader2 } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { Todo, TodoFormData, Priority } from "./types";

interface TodoFormProps {
  todo?: Todo;
  onSubmit: (data: TodoFormData) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "high", label: "높음" },
  { value: "medium", label: "중간" },
  { value: "low", label: "낮음" },
];

const categoryOptions = [
  "업무",
  "개인",
  "학습",
  "건강",
  "기타",
];

export function TodoForm({ todo, onSubmit, onCancel, isLoading = false }: TodoFormProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    todo?.due_date ? new Date(todo.due_date) : undefined
  );
  const [category, setCategory] = React.useState<string>(
    todo?.category || "none"
  );
  const [priority, setPriority] = React.useState<Priority>(
    todo?.priority || "medium"
  );
  const [aiInput, setAiInput] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<TodoFormData>({
    defaultValues: {
      title: todo?.title || "",
      description: todo?.description || "",
      priority: todo?.priority || "medium",
      category: todo?.category || "none",
    },
  });

  React.useEffect(() => {
    setValue("priority", priority);
  }, [priority, setValue]);

  React.useEffect(() => {
    if (date) {
      setValue("due_date", format(date, "yyyy-MM-dd'T'HH:mm"));
    } else {
      setValue("due_date", undefined);
    }
  }, [date, setValue]);

  React.useEffect(() => {
    setValue("category", category);
  }, [category, setValue]);

  const onFormSubmit = async (data: TodoFormData) => {
    await onSubmit({
      ...data,
      due_date: date ? format(date, "yyyy-MM-dd'T'HH:mm") : undefined,
      category: category === "none" ? undefined : category,
      priority,
    });
  };

  // AI 기반 할 일 생성
  const handleAIGenerate = async () => {
    if (!aiInput.trim()) {
      setAiError("자연어 입력을 입력해주세요.");
      return;
    }

    setIsGenerating(true);
    setAiError(null);

    try {
      const response = await fetch("/api/ai/generate-todo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: aiInput.trim() }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // 상태 코드별 에러 메시지 처리
        let errorMessage = responseData.error || "AI 생성 중 오류가 발생했습니다.";
        
        // 개발 환경에서 상세 정보 표시
        if (responseData.details && process.env.NODE_ENV === "development") {
          console.error("AI API Error Details:", responseData.details);
        }
        
        throw new Error(errorMessage);
      }

      if (!responseData.data) {
        throw new Error("AI가 데이터를 생성하지 못했습니다.");
      }

      const { data } = responseData;

      // AI 결과를 폼에 적용
      if (data.title) {
        setValue("title", data.title);
      }
      if (data.description) {
        setValue("description", data.description);
      }

      // 날짜 처리
      if (data.due_date) {
        try {
          // due_time이 있으면 시간 포함, 없으면 기본값 09:00
          const timeStr = data.due_time || "09:00";
          const [hours, minutes] = timeStr.split(":").map(Number);
          const dateObj = parseISO(data.due_date);
          dateObj.setHours(hours, minutes, 0, 0);
          setDate(dateObj);
        } catch (e) {
          // 날짜 파싱 실패 시 날짜만 설정
          const dateObj = parseISO(data.due_date);
          dateObj.setHours(9, 0, 0, 0);
          setDate(dateObj);
        }
      }

      // 우선순위 설정
      if (data.priority) {
        setPriority(data.priority as Priority);
      }

      // 카테고리 설정
      if (data.category) {
        setCategory(data.category);
      } else {
        setCategory("none");
      }

      // 입력 필드 초기화
      setAiInput("");
    } catch (error: any) {
      console.error("AI generate error:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      
      // 에러 메시지 설정
      let errorMessage = "AI 할 일 생성 중 오류가 발생했습니다.";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.";
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setAiError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* AI 기반 할 일 생성 섹션 */}
      <div className="space-y-2 rounded-lg border p-4 bg-muted/50">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="size-4 text-primary" />
          <Label htmlFor="ai-input" className="text-sm font-medium">
            AI로 할 일 생성
          </Label>
        </div>
        <div className="flex gap-2">
          <Input
            id="ai-input"
            placeholder="예: 내일 오후 3시까지 중요한 팀 회의 준비하기"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAIGenerate();
              }
            }}
            disabled={isGenerating}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAIGenerate}
            disabled={isGenerating || !aiInput.trim()}
            className="shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                생성
              </>
            )}
          </Button>
        </div>
        {aiError && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription className="text-sm">{aiError}</AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          자연어로 할 일을 입력하면 AI가 자동으로 제목, 날짜, 우선순위 등을 추출합니다.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          placeholder="할 일 제목을 입력하세요"
          {...register("title", { required: "제목을 입력해주세요" })}
          aria-invalid={errors.title ? "true" : "false"}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          placeholder="할 일에 대한 상세 설명을 입력하세요 (선택사항)"
          rows={4}
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="due_date">마감일</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 size-4" />
                {date ? (
                  format(date, "yyyy년 MM월 dd일", { locale: ko })
                ) : (
                  <span>마감일 선택</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">우선순위</Label>
          <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
            <SelectTrigger id="priority">
              <SelectValue placeholder="우선순위 선택" />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">카테고리</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="category">
            <SelectValue placeholder="카테고리 선택 (선택사항)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">카테고리 없음</SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            취소
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "저장 중..." : todo ? "수정하기" : "추가하기"}
        </Button>
      </div>
    </form>
  );
}

