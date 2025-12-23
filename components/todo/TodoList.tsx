"use client";

import * as React from "react";
import { ClipboardList, CheckCircle2 } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { TodoCard } from "./TodoCard";
import type { Todo } from "./types";

interface TodoListProps {
  todos: Todo[];
  onToggleComplete?: (id: string, completed: boolean) => void;
  onEdit?: (todo: Todo) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
  showCount?: boolean;
  deletingIds?: Set<string>;
}

export function TodoList({
  todos,
  onToggleComplete,
  onEdit,
  onDelete,
  emptyMessage = "할 일이 없습니다. 새로운 할 일을 추가해보세요!",
  showCount = true,
  deletingIds = new Set(),
}: TodoListProps) {
  const completedCount = todos.filter((todo) => todo.completed).length;
  const totalCount = todos.length;

  if (todos.length === 0) {
    return (
      <Empty className="py-16 border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList className="size-12 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>할 일이 없습니다</EmptyTitle>
          <EmptyDescription>
            {emptyMessage}
            <br />
            <span className="text-xs text-muted-foreground/80 mt-2 block">
              좌측 폼을 사용하여 새로운 할 일을 추가해보세요!
            </span>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {showCount && (
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="size-4" />
            <span>
              전체 <span className="font-medium text-foreground">{totalCount}</span>개
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            <span>
              완료 <span className="font-medium text-foreground">{completedCount}</span>개
            </span>
          </div>
        </div>
      )}
      {todos.map((todo) => (
        <TodoCard
          key={todo.id}
          todo={todo}
          onToggleComplete={onToggleComplete}
          onEdit={onEdit}
          onDelete={onDelete}
          isDeleting={deletingIds.has(todo.id)}
        />
      ))}
    </div>
  );
}

