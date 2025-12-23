"use client";

import * as React from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, Clock, Tag, Trash2, Edit, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Todo, Priority } from "./types";

interface TodoCardProps {
  todo: Todo;
  onToggleComplete?: (id: string, completed: boolean) => void;
  onEdit?: (todo: Todo) => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

const priorityConfig: Record<Priority, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  high: { label: "높음", variant: "destructive" },
  medium: { label: "중간", variant: "default" },
  low: { label: "낮음", variant: "secondary" },
};

export function TodoCard({ todo, onToggleComplete, onEdit, onDelete, isDeleting = false }: TodoCardProps) {
  const priority = priorityConfig[todo.priority];
  const isOverdue = todo.due_date && !todo.completed && new Date(todo.due_date) < new Date();
  const [showExplosion, setShowExplosion] = React.useState(false);
  const [showFragments, setShowFragments] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleToggleComplete = (checked: boolean) => {
    onToggleComplete?.(todo.id, checked);
  };

  const handleEdit = () => {
    onEdit?.(todo);
  };

  const handleDelete = () => {
    if (confirm("정말 이 할 일을 삭제하시겠습니까?")) {
      onDelete?.(todo.id);
    }
  };

  // 삭제 애니메이션 트리거
  React.useEffect(() => {
    if (isDeleting) {
      setShowExplosion(true);
      setShowFragments(true);
    }
  }, [isDeleting]);

  // 폭탄 파티클 위치 계산 (더 강한 폭발)
  const getParticleStyle = (index: number, total: number, distance: number) => {
    const angle = (index * 360) / total;
    const radians = (angle * Math.PI) / 180;
    const x = Math.cos(radians) * distance;
    const y = Math.sin(radians) * distance;
    return {
      left: '50%',
      top: '50%',
      '--explode-x': `${x}px`,
      '--explode-y': `${y}px`,
    } as React.CSSProperties;
  };

  // 카드 조각 생성 (3x3 그리드로 9개 조각)
  const fragments = React.useMemo(() => {
    if (!showFragments) return [];
    const fragmentCount = 9;
    return Array.from({ length: fragmentCount }).map((_, i) => {
      const angle = (i * 360) / fragmentCount;
      const radians = (angle * Math.PI) / 180;
      const distance = 150 + (i % 3) * 30; // 조각마다 다른 거리
      const x = Math.cos(radians) * distance;
      const y = Math.sin(radians) * distance;
      const rotate = angle + (i * 45); // 조각마다 다른 회전
      
      return {
        id: i,
        style: {
          '--fragment-x': `${x}px`,
          '--fragment-y': `${y}px`,
          '--fragment-rotate': `${rotate}deg`,
        } as React.CSSProperties,
        // 각 조각의 위치 (3x3 그리드)
        gridX: (i % 3) * 33.33,
        gridY: Math.floor(i / 3) * 33.33,
      };
    });
  }, [showFragments]);

  return (
    <div className="relative">
      {/* 폭탄 섬광 효과 */}
      {showExplosion && (
        <div className="absolute inset-0 z-[60] pointer-events-none bg-white/80 rounded-lg animate-bomb-flash" />
      )}
      
      {/* 폭탄 파티클 효과 */}
      {showExplosion && (
        <div className="absolute inset-0 z-[55] pointer-events-none overflow-visible">
          {/* 큰 파티클 (주황색/빨간색) */}
          {[...Array(20)].map((_, i) => (
            <div
              key={`large-${i}`}
              className="absolute w-3 h-3 bg-primary rounded-full animate-bomb-particle-large shadow-lg"
              style={getParticleStyle(i, 20, 120)}
            />
          ))}
          {/* 중간 파티클 (노란색) */}
          {[...Array(15)].map((_, i) => (
            <div
              key={`medium-${i}`}
              className="absolute w-2 h-2 bg-yellow-500 rounded-full animate-bomb-particle-medium shadow-md"
              style={getParticleStyle(i + 20, 15, 100)}
            />
          ))}
          {/* 작은 파티클 (빨간색) */}
          {[...Array(25)].map((_, i) => (
            <div
              key={`small-${i}`}
              className="absolute w-1.5 h-1.5 bg-destructive rounded-full animate-bomb-particle-small"
              style={getParticleStyle(i + 35, 25, 80)}
            />
          ))}
        </div>
      )}
      
      {/* 카드 조각들 */}
      {showFragments && (
        <div className="absolute inset-0 z-[50] pointer-events-none overflow-visible">
          {fragments.map((fragment) => (
            <div
              key={fragment.id}
              className="absolute animate-fragment-fly bg-card border border-border rounded-sm shadow-lg"
              style={{
                ...fragment.style,
                left: `${fragment.gridX}%`,
                top: `${fragment.gridY}%`,
                width: '33.33%',
                height: '33.33%',
                transformOrigin: 'center',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}
            />
          ))}
        </div>
      )}
      
      <Card
        ref={cardRef}
        className={cn(
          "transition-all hover:shadow-md",
          todo.completed && "opacity-60",
          isOverdue && !todo.completed && "border-destructive/50",
          isDeleting && "animate-bomb-explode"
        )}
      >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Checkbox
              checked={todo.completed}
              onCheckedChange={handleToggleComplete}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <CardTitle
                className={cn(
                  "text-base font-semibold line-clamp-2",
                  todo.completed && "line-through text-muted-foreground"
                )}
              >
                {todo.title}
              </CardTitle>
              {todo.description && (
                <CardDescription className="mt-1.5 line-clamp-2">
                  {todo.description}
                </CardDescription>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {todo.due_date && (
            <div
              className={cn(
                "flex items-center gap-1.5",
                isOverdue && !todo.completed && "text-destructive font-medium"
              )}
            >
              <Calendar className="size-4" />
              <span>
                {format(new Date(todo.due_date), "yyyy년 MM월 dd일", { locale: ko })}
              </span>
              {new Date(todo.due_date).toDateString() === new Date().toDateString() && (
                <Badge variant="outline" className="text-xs">
                  오늘
                </Badge>
              )}
            </div>
          )}
          {todo.category && (
            <div className="flex items-center gap-1.5">
              <Tag className="size-4" />
              <span>{todo.category}</span>
            </div>
          )}
          <Badge variant={priority.variant} className="text-xs">
            {priority.label}
          </Badge>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEdit}
            className="h-8"
          >
            <Edit className="size-4 mr-1.5" />
            수정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-8 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4 mr-1.5" />
            삭제
          </Button>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}

