"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, LogOut, Sparkles, Filter, ArrowUpDown, AlertCircle, Loader2, TrendingUp, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TodoForm, TodoList } from "@/components/todo";
import type { Todo, TodoFormData, Priority } from "@/components/todo/types";
import { createClient } from "@/lib/supabase/client";

type FilterStatus = "all" | "active" | "completed" | "overdue";
type SortOption = "priority" | "due_date" | "created_date" | "title";

export default function HomePage() {
  const router = useRouter();
  const [todos, setTodos] = React.useState<Todo[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<FilterStatus>("all");
  const [priorityFilter, setPriorityFilter] = React.useState<Priority | "all">("all");
  const [sortOption, setSortOption] = React.useState<SortOption>("created_date");
  const [editingTodo, setEditingTodo] = React.useState<Todo | undefined>(undefined);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [user, setUser] = React.useState<{ email: string; name: string; id: string; avatar_url?: string | null } | null>(null);
  const [isLoadingUser, setIsLoadingUser] = React.useState(true);
  const [isLoadingTodos, setIsLoadingTodos] = React.useState(true);
  const [logoutError, setLogoutError] = React.useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [analysisData, setAnalysisData] = React.useState<{
    summary: string;
    urgentTasks: string[];
    insights: string[];
    recommendations: string[];
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisPeriod, setAnalysisPeriod] = React.useState<"today" | "week">("today");
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [deletingTodoIds, setDeletingTodoIds] = React.useState<Set<string>>(new Set());

  // 사용자 정보 가져오기 및 인증 상태 실시간 감지
  React.useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const fetchUserProfile = async (authUser: any) => {
      try {
        // 사용자 프로필 정보 가져오기 (maybeSingle로 변경하여 row가 없어도 에러 안 남)
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("email, name, avatar_url")
          .eq("id", authUser.id)
          .maybeSingle();

        if (!isMounted) return;

        if (profileError) {
          // 프로필이 없으면 기본 정보 사용
          setUser({
            id: authUser.id,
            email: authUser.email || "",
            name: authUser.user_metadata?.name || authUser.email?.split("@")[0] || "사용자",
            avatar_url: null,
          });
        } else {
          setUser({
            id: authUser.id,
            email: profile.email || authUser.email || "",
            name: profile.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "사용자",
            avatar_url: profile.avatar_url || null,
          });
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        if (!isMounted) return;
        // 프로필 가져오기 실패해도 기본 정보 사용
        setUser({
          id: authUser.id,
          email: authUser.email || "",
          name: authUser.user_metadata?.name || authUser.email?.split("@")[0] || "사용자",
          avatar_url: null,
        });
      } finally {
        if (isMounted) {
          setIsLoadingUser(false);
        }
      }
    };

    // 페이지 포커스 시 사용자 정보 다시 가져오기 (프로필 수정 후 반영)
    const handleFocus = async () => {
      if (!isMounted) return;
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser && isMounted) {
        await fetchUserProfile(authUser);
      }
    };

    window.addEventListener("focus", handleFocus);

    // 인증 상태 변경 실시간 감지 (초기 세션도 함께 받음)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !session) {
        // 로그아웃 또는 세션 만료 시 로그인 페이지로 리다이렉트
        setUser(null);
        // window.location을 사용하여 확실하게 리다이렉트
        if (isMounted) {
          window.location.href = "/login";
        }
      } else if (session?.user) {
        // 초기 로드 또는 로그인/토큰 갱신 시
        // 먼저 기본 정보로 빠르게 표시 (프로필 쿼리 전에)
        const initialUser = {
          email: session.user.email || "",
          name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "사용자",
        };
        setUser({
          ...initialUser,
          id: session.user.id,
        });
        setIsLoadingUser(false);
        
        // 프로필 정보는 백그라운드에서 가져오기 (있으면 업데이트)
        fetchUserProfile(session.user);
        
        // 할 일 목록 가져오기
        fetchTodos(session.user.id);
        
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          router.refresh();
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [router]);

  // 할 일 목록 가져오기
  const fetchTodos = React.useCallback(async (userId: string) => {
    try {
      setIsLoadingTodos(true);
      setErrorMessage(null);
      const supabase = createClient();

      // 현재 사용자 확인 (세션 확인)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("Session error in fetchTodos:", sessionError);
        throw new Error("세션을 확인할 수 없습니다.");
      }
      
      if (!session || !session.user) {
        throw new Error("로그인 세션이 없습니다. 다시 로그인해주세요.");
      }
      
      const currentUserId = session.user.id;
      
      if (currentUserId !== userId) {
        console.warn("User ID mismatch in fetchTodos:", { sessionUserId: currentUserId, paramUserId: userId });
        // 세션의 user.id를 우선 사용
      }

      console.log("Fetching todos for user:", currentUserId);

      // 세션의 user.id를 사용하여 조회
      const { data, error, status, statusText } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", currentUserId)
        .order("created_date", { ascending: false });

      console.log("Fetch todos response:", {
        hasData: !!data,
        dataLength: data?.length || 0,
        hasError: !!error,
        errorMessage: error?.message,
        errorCode: error?.code,
        status,
        statusText,
      });

      if (error) {
        console.error("Fetch todos error details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          status,
          statusText,
        });
        throw error;
      }

      if (status === 406) {
        throw new Error("서버가 요청을 처리할 수 없습니다. Supabase 설정을 확인해주세요.");
      }

      setTodos((data as Todo[]) || []);
    } catch (error: any) {
      console.error("Error fetching todos:", error);
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code;
      const status = error?.status;
      
      if (status === 406 || errorCode === "PGRST301" || errorCode === "PGRST116" || errorMessage?.includes("JWT")) {
        setErrorMessage("인증이 만료되었거나 서버 설정에 문제가 있습니다. 다시 로그인해주세요.");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else {
        setErrorMessage(`할 일 목록을 불러오는 중 오류가 발생했습니다: ${errorMessage}`);
      }
    } finally {
      setIsLoadingTodos(false);
    }
  }, []);

  // 필터링 및 정렬된 할 일 목록
  const filteredAndSortedTodos = React.useMemo(() => {
    let filtered = [...todos];

    // 검색 필터
    if (searchQuery) {
      filtered = filtered.filter(
        (todo) =>
          todo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          todo.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 상태 필터
    if (statusFilter === "active") {
      filtered = filtered.filter((todo) => !todo.completed);
    } else if (statusFilter === "completed") {
      filtered = filtered.filter((todo) => todo.completed);
    } else if (statusFilter === "overdue") {
      const now = new Date();
      filtered = filtered.filter(
        (todo) =>
          !todo.completed &&
          todo.due_date &&
          new Date(todo.due_date) < now
      );
    }

    // 우선순위 필터
    if (priorityFilter !== "all") {
      filtered = filtered.filter((todo) => todo.priority === priorityFilter);
    }

    // 정렬
    filtered.sort((a, b) => {
      switch (sortOption) {
        case "priority":
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case "due_date":
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case "created_date":
          return (
            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
          );
        case "title":
          return a.title.localeCompare(b.title, "ko");
        default:
          return 0;
      }
    });

    return filtered;
  }, [todos, searchQuery, statusFilter, priorityFilter, sortOption]);

  const handleAddTodo = async (data: TodoFormData) => {
    if (!user) return;

    try {
      setErrorMessage(null);
      const supabase = createClient();

      // 데이터 검증 및 준비
      if (!data.title || !data.title.trim()) {
        setErrorMessage("제목을 입력해주세요.");
        return;
      }

      const insertData: any = {
        user_id: user.id,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        priority: data.priority || "medium",
        category: data.category && data.category !== "none" ? data.category : null,
        completed: false,
      };

      // due_date가 있으면 ISO 형식으로 변환
      if (data.due_date) {
        try {
          const dateObj = new Date(data.due_date);
          if (!isNaN(dateObj.getTime())) {
            insertData.due_date = dateObj.toISOString();
          } else {
            insertData.due_date = null;
          }
        } catch {
          insertData.due_date = null;
        }
      } else {
        insertData.due_date = null;
      }

      // 현재 사용자 확인 (세션 확인)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("Session error:", sessionError);
        throw new Error("세션을 확인할 수 없습니다.");
      }
      
      if (!session || !session.user) {
        throw new Error("로그인 세션이 없습니다. 다시 로그인해주세요.");
      }
      
      if (session.user.id !== user.id) {
        console.warn("User ID mismatch:", { sessionUserId: session.user.id, stateUserId: user.id });
      }

      console.log("Inserting todo data:", insertData);
      console.log("Current user ID:", session.user.id);
      
      // user_id를 세션의 user.id로 사용
      insertData.user_id = session.user.id;

      const response = await supabase
        .from("todos")
        .insert(insertData)
        .select()
        .single();

      console.log("Supabase insert response:", {
        hasData: !!response.data,
        hasError: !!response.error,
        errorMessage: response.error?.message,
        errorCode: response.error?.code,
        errorDetails: response.error?.details,
        errorHint: response.error?.hint,
      });

      // 에러 확인
      if (response.error) {
        const error = response.error;
        const errorMessage = error.message || "알 수 없는 오류";
        const errorCode = error.code || "UNKNOWN";
        
        console.error("Supabase insert error:", {
          message: errorMessage,
          code: errorCode,
          details: error.details,
          hint: error.hint,
        });
        
        // 에러 코드에 따른 처리
        if (errorCode === "PGRST301" || errorCode === "PGRST116" || errorMessage.includes("JWT")) {
          setErrorMessage("인증이 만료되었습니다. 다시 로그인해주세요.");
        } else if (errorCode === "23505") {
          setErrorMessage("이미 존재하는 할 일입니다.");
        } else if (errorCode === "23503") {
          setErrorMessage("사용자 정보를 찾을 수 없습니다.");
        } else if (errorCode === "42501") {
          setErrorMessage("권한이 없습니다. 다시 로그인해주세요.");
        } else {
          setErrorMessage(`할 일 추가 중 오류가 발생했습니다: ${errorMessage}`);
        }
        return;
      }

      // 성공 시 처리
      if (!response.data) {
        console.warn("Insert succeeded but no data returned");
        // 목록은 새로고침
        await fetchTodos(user.id);
        setIsFormOpen(false);
        setEditingTodo(undefined);
        return;
      }

      console.log("Todo created successfully:", response.data);

      // 목록 새로고침
      await fetchTodos(session.user.id);
      setIsFormOpen(false);
      setEditingTodo(undefined);
    } catch (error: any) {
      // 예상치 못한 에러 처리
      let errorMessage = "할 일 추가 중 오류가 발생했습니다.";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error("Caught error:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      } else if (typeof error === "string") {
        errorMessage = error;
        console.error("Caught string error:", error);
      } else {
        // 객체인 경우 속성 추출 시도
        try {
          const errorStr = JSON.stringify(error, Object.getOwnPropertyNames(error));
          console.error("Caught object error:", errorStr);
          if (errorStr && errorStr !== "{}") {
            errorMessage = `오류: ${errorStr}`;
          }
        } catch (e) {
          console.error("Failed to stringify error:", e);
          console.error("Original error:", error);
        }
      }
      
      setErrorMessage(errorMessage);
    }
  };

  const handleUpdateTodo = async (data: TodoFormData) => {
    if (!editingTodo || !user) return;

    try {
      setErrorMessage(null);
      const supabase = createClient();

      // 현재 사용자 확인 (세션 확인)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("Session error in handleUpdateTodo:", sessionError);
        throw new Error("세션을 확인할 수 없습니다.");
      }
      
      if (!session || !session.user) {
        throw new Error("로그인 세션이 없습니다. 다시 로그인해주세요.");
      }
      
      const currentUserId = session.user.id;

      // 업데이트 데이터 준비
      const updateData: any = {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        priority: data.priority || "medium",
        category: data.category && data.category !== "none" ? data.category : null,
      };

      // due_date 처리
      if (data.due_date) {
        try {
          const dateObj = new Date(data.due_date);
          if (!isNaN(dateObj.getTime())) {
            updateData.due_date = dateObj.toISOString();
          } else {
            updateData.due_date = null;
          }
        } catch {
          updateData.due_date = null;
        }
      } else {
        updateData.due_date = null;
      }

      console.log("Updating todo:", { id: editingTodo.id, data: updateData, userId: currentUserId });

      const response = await supabase
        .from("todos")
        .update(updateData)
        .eq("id", editingTodo.id)
        .eq("user_id", currentUserId) // 본인 소유만 수정 가능
        .select()
        .single();

      console.log("Update response:", {
        hasData: !!response.data,
        hasError: !!response.error,
        errorMessage: response.error?.message,
        errorCode: response.error?.code,
      });

      if (response.error) {
        const error = response.error;
        const errorMessage = error.message || "알 수 없는 오류";
        const errorCode = error.code || "UNKNOWN";
        
        console.error("Update error:", { message: errorMessage, code: errorCode });
        
        if (errorCode === "PGRST301" || errorCode === "PGRST116" || errorMessage.includes("JWT")) {
          setErrorMessage("인증이 만료되었습니다. 다시 로그인해주세요.");
        } else if (errorCode === "42501") {
          setErrorMessage("권한이 없습니다. 본인의 할 일만 수정할 수 있습니다.");
        } else {
          setErrorMessage(`할 일 수정 중 오류가 발생했습니다: ${errorMessage}`);
        }
        return;
      }

      console.log("Todo updated successfully:", response.data);

      // 목록 새로고침
      await fetchTodos(currentUserId);
      setEditingTodo(undefined);
      setIsFormOpen(false);
    } catch (error: any) {
      console.error("Error updating todo:", error);
      const errorMessage = error?.message || String(error) || "할 일 수정 중 오류가 발생했습니다.";
      setErrorMessage(errorMessage);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    if (!user) return;

    try {
      setErrorMessage(null);
      
      // 삭제 애니메이션 시작
      setDeletingTodoIds((prev) => new Set(prev).add(id));
      
      // 애니메이션 시간 대기 (0.6초)
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      const supabase = createClient();

      // 현재 사용자 확인 (세션 확인)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("Session error in handleDeleteTodo:", sessionError);
        setDeletingTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        throw new Error("세션을 확인할 수 없습니다.");
      }
      
      if (!session || !session.user) {
        setDeletingTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        throw new Error("로그인 세션이 없습니다. 다시 로그인해주세요.");
      }
      
      const currentUserId = session.user.id;

      console.log("Deleting todo:", id, "for user:", currentUserId);

      const response = await supabase
        .from("todos")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUserId) // 본인 소유만 삭제 가능
        .select();

      console.log("Delete response:", {
        hasData: !!response.data,
        hasError: !!response.error,
        errorMessage: response.error?.message,
        errorCode: response.error?.code,
      });

      if (response.error) {
        const error = response.error;
        const errorMessage = error.message || "알 수 없는 오류";
        const errorCode = error.code || "UNKNOWN";
        
        console.error("Delete error:", { message: errorMessage, code: errorCode });
        
        // 애니메이션 상태 제거
        setDeletingTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        
        if (errorCode === "PGRST301" || errorCode === "PGRST116" || errorMessage.includes("JWT")) {
          setErrorMessage("인증이 만료되었습니다. 다시 로그인해주세요.");
        } else if (errorCode === "42501") {
          setErrorMessage("권한이 없습니다. 본인의 할 일만 삭제할 수 있습니다.");
        } else {
          setErrorMessage(`할 일 삭제 중 오류가 발생했습니다: ${errorMessage}`);
        }
        return;
      }

      console.log("Todo deleted successfully");

      // 목록 새로고침
      await fetchTodos(currentUserId);
      
      // 애니메이션 상태 제거
      setDeletingTodoIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error: any) {
      console.error("Error deleting todo:", error);
      const errorMessage = error?.message || String(error) || "할 일 삭제 중 오류가 발생했습니다.";
      setErrorMessage(errorMessage);
      
      // 애니메이션 상태 제거
      setDeletingTodoIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleComplete = async (id: string, completed: boolean) => {
    if (!user) return;

    try {
      setErrorMessage(null);
      const supabase = createClient();

      // 현재 사용자 확인 (세션 확인)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("Session error in handleToggleComplete:", sessionError);
        throw new Error("세션을 확인할 수 없습니다.");
      }
      
      if (!session || !session.user) {
        throw new Error("로그인 세션이 없습니다. 다시 로그인해주세요.");
      }
      
      const currentUserId = session.user.id;

      console.log("Toggling todo:", { id, completed, userId: currentUserId });

      const response = await supabase
        .from("todos")
        .update({ completed })
        .eq("id", id)
        .eq("user_id", currentUserId) // 본인 소유만 수정 가능
        .select()
        .single();

      console.log("Toggle response:", {
        hasData: !!response.data,
        hasError: !!response.error,
        errorMessage: response.error?.message,
        errorCode: response.error?.code,
      });

      if (response.error) {
        const error = response.error;
        const errorMessage = error.message || "알 수 없는 오류";
        const errorCode = error.code || "UNKNOWN";
        
        console.error("Toggle error:", { message: errorMessage, code: errorCode });
        
        if (errorCode === "PGRST301" || errorCode === "PGRST116" || errorMessage.includes("JWT")) {
          setErrorMessage("인증이 만료되었습니다. 다시 로그인해주세요.");
        } else if (errorCode === "42501") {
          setErrorMessage("권한이 없습니다. 본인의 할 일만 수정할 수 있습니다.");
        } else {
          setErrorMessage(`상태 변경 중 오류가 발생했습니다: ${errorMessage}`);
        }
        return;
      }

      console.log("Todo toggled successfully:", response.data);

      // 목록 새로고침
      await fetchTodos(user.id);
    } catch (error: any) {
      console.error("Error toggling todo:", error);
      const errorMessage = error?.message || String(error) || "상태 변경 중 오류가 발생했습니다.";
      setErrorMessage(errorMessage);
    }
  };

  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setIsFormOpen(true);
  };

  // AI 요약 및 분석
  const handleAnalyzeTodos = async (period: "today" | "week") => {
    if (!user || todos.length === 0) {
      setAnalysisError("분석할 할 일이 없습니다.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisPeriod(period);

    try {
      // 기간별 할 일 필터링
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // 이번 주 월요일

      let filteredTodos = todos;
      if (period === "today") {
        filteredTodos = todos.filter((todo) => {
          if (!todo.due_date) return false;
          const dueDate = new Date(todo.due_date);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate.getTime() === today.getTime();
        });
      } else if (period === "week") {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // 이번 주 일요일
        weekEnd.setHours(23, 59, 59, 999);

        filteredTodos = todos.filter((todo) => {
          if (!todo.due_date) return false;
          const dueDate = new Date(todo.due_date);
          return dueDate >= weekStart && dueDate <= weekEnd;
        });
      }

      if (filteredTodos.length === 0) {
        setAnalysisError(period === "today" ? "오늘 할 일이 없습니다." : "이번 주 할 일이 없습니다.");
        setIsAnalyzing(false);
        return;
      }

      const response = await fetch("/api/ai/analyze-todos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          todos: filteredTodos,
          period,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || "AI 분석 중 오류가 발생했습니다.");
      }

      if (!responseData.data) {
        throw new Error("AI가 분석 데이터를 생성하지 못했습니다.");
      }

      setAnalysisData(responseData.data);
    } catch (error: any) {
      console.error("AI analyze error:", error);
      setAnalysisError(error.message || "AI 분석 중 오류가 발생했습니다.");
      setAnalysisData(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFormSubmit = async (data: TodoFormData) => {
    if (editingTodo) {
      await handleUpdateTodo(data);
    } else {
      await handleAddTodo(data);
    }
  };

  const handleFormCancel = () => {
    setEditingTodo(undefined);
    setIsFormOpen(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setLogoutError("로그아웃 중 오류가 발생했습니다. 다시 시도해주세요.");
        console.error("Logout error:", error);
        setIsLoggingOut(false);
        return;
      }

      // 로그아웃 성공 - 즉시 로그인 페이지로 이동
      // window.location을 사용하여 확실하게 리다이렉트
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
      setLogoutError("로그아웃 중 오류가 발생했습니다. 다시 시도해주세요.");
      setIsLoggingOut(false);
    }
  };

  // 로딩 중이거나 사용자 정보가 없으면 로딩 표시
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 사용자가 없으면 아무것도 렌더링하지 않음 (useEffect에서 리다이렉트)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold">Todo AI</h1>
          </div>

          <div className="flex items-center gap-4">
            {logoutError && (
              <Alert variant="destructive" className="hidden md:flex py-2 px-3">
                <AlertCircle className="size-4" />
                <AlertDescription className="text-xs">{logoutError}</AlertDescription>
              </Alert>
            )}
            <div 
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push("/profile")}
            >
              <Avatar>
                {user.avatar_url && (
                  <AvatarImage src={user.avatar_url} alt={user.name} />
                )}
                <AvatarFallback>
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="gap-2"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">
                {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* 에러 메시지 */}
        {errorMessage && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="size-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {/* AI 요약 및 분석 섹션 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              AI 요약 및 분석
            </CardTitle>
            <CardDescription>
              할 일 목록을 AI가 분석하여 요약과 인사이트를 제공합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="today" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="today">오늘의 요약</TabsTrigger>
                <TabsTrigger value="week">이번주 요약</TabsTrigger>
              </TabsList>
              <TabsContent value="today" className="mt-4">
                <div className="space-y-4">
                  <Button
                    onClick={() => handleAnalyzeTodos("today")}
                    disabled={isAnalyzing || todos.length === 0}
                    className="w-full"
                    variant="outline"
                  >
                    {isAnalyzing && analysisPeriod === "today" ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        AI 분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4 mr-2" />
                        AI 요약
                      </>
                    )}
                  </Button>
                  {analysisError && analysisPeriod === "today" && (
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{analysisError}</AlertDescription>
                    </Alert>
                  )}
                  {analysisData && analysisPeriod === "today" && (
                    <div className="space-y-4 pt-4 border-t">
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <Calendar className="size-4" />
                          요약
                        </h3>
                        <p className="text-sm text-muted-foreground">{analysisData.summary}</p>
                      </div>
                      {analysisData.urgentTasks.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <AlertCircle className="size-4 text-destructive" />
                            긴급 작업
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {analysisData.urgentTasks.map((task, index) => (
                              <li key={index}>{task}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysisData.insights.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <TrendingUp className="size-4" />
                            인사이트
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {analysisData.insights.map((insight, index) => (
                              <li key={index}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysisData.recommendations.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <Clock className="size-4" />
                            추천 사항
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {analysisData.recommendations.map((rec, index) => (
                              <li key={index}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="week" className="mt-4">
                <div className="space-y-4">
                  <Button
                    onClick={() => handleAnalyzeTodos("week")}
                    disabled={isAnalyzing || todos.length === 0}
                    className="w-full"
                    variant="outline"
                  >
                    {isAnalyzing && analysisPeriod === "week" ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        AI 분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4 mr-2" />
                        AI 요약
                      </>
                    )}
                  </Button>
                  {analysisError && analysisPeriod === "week" && (
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{analysisError}</AlertDescription>
                    </Alert>
                  )}
                  {analysisData && analysisPeriod === "week" && (
                    <div className="space-y-4 pt-4 border-t">
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <Calendar className="size-4" />
                          요약
                        </h3>
                        <p className="text-sm text-muted-foreground">{analysisData.summary}</p>
                      </div>
                      {analysisData.urgentTasks.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <AlertCircle className="size-4 text-destructive" />
                            긴급 작업
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {analysisData.urgentTasks.map((task, index) => (
                              <li key={index}>{task}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysisData.insights.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <TrendingUp className="size-4" />
                            인사이트
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {analysisData.insights.map((insight, index) => (
                              <li key={index}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysisData.recommendations.length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <Clock className="size-4" />
                            추천 사항
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {analysisData.recommendations.map((rec, index) => (
                              <li key={index}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Toolbar */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* 검색 */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="할 일 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* 필터 및 정렬 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 상태 필터 */}
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as FilterStatus)}
              >
                <SelectTrigger className="w-[140px]">
                  <Filter className="size-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="active">진행 중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="overdue">지연</SelectItem>
                </SelectContent>
              </Select>

              {/* 우선순위 필터 */}
              <Select
                value={priorityFilter}
                onValueChange={(value) => setPriorityFilter(value as Priority | "all")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="우선순위" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="medium">중간</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>

              {/* 정렬 */}
              <Select
                value={sortOption}
                onValueChange={(value) => setSortOption(value as SortOption)}
              >
                <SelectTrigger className="w-[140px]">
                  <ArrowUpDown className="size-4 mr-2" />
                  <SelectValue placeholder="정렬" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">우선순위 순</SelectItem>
                  <SelectItem value="due_date">마감일 순</SelectItem>
                  <SelectItem value="created_date">생성일 순</SelectItem>
                  <SelectItem value="title">제목 순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Main Area */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* TodoForm - 좌측 또는 상단 */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <TodoForm
                todo={editingTodo}
                onSubmit={handleFormSubmit}
                onCancel={isFormOpen ? handleFormCancel : undefined}
              />
            </div>
          </div>

          {/* TodoList - 우측 또는 하단 */}
          <div className="lg:col-span-2">
            {isLoadingTodos ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">할 일 목록을 불러오는 중...</p>
              </div>
            ) : (
              <TodoList
                todos={filteredAndSortedTodos}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTodo}
                onDelete={handleDeleteTodo}
                deletingIds={deletingTodoIds}
                emptyMessage={
                  searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                    ? "검색 조건에 맞는 할 일이 없습니다."
                    : "할 일이 없습니다. 새로운 할 일을 추가해보세요!"
                }
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
