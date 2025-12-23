# PRD - AI 기반 할 일 관리 웹 애플리케이션

## 1. 제품 개요

### 1.1 제품 목적
본 제품은 사용자가 할 일을 효율적으로 관리할 수 있도록 지원하는 웹 기반 할 일 관리 서비스이다.
기존의 번거로운 입력 방식에서 벗어나 AI를 활용한 자연어 기반 할 일 생성과 요약/분석 기능을 제공하여 생산성을 극대화하는 것을 목표로 한다.

### 1.2 타겟 사용자
- 개인 일정과 업무를 함께 관리하려는 일반 사용자
- 학습 및 프로젝트 단위로 할 일을 체계적으로 관리하고 싶은 학생 및 직장인

---

## 2. 주요 기능 요구사항

### 2.1 사용자 인증 (Authentication)

#### 기능 설명
- 이메일/비밀번호 기반 로그인 및 회원가입 기능 제공
- Supabase Auth를 활용하여 인증 로직 구현

#### 세부 요구사항
- 회원가입 시 이메일 인증 메일 발송
- 로그인 유지(Session 관리)
- 로그아웃 기능 제공

---

### 2.2 할 일 관리 (Todo CRUD)

#### 기능 설명
사용자는 자신의 할 일을 생성, 조회, 수정, 삭제할 수 있다.

#### 할 일 데이터 필드
| 필드명 | 타입 | 설명 |
|------|------|------|
| id | uuid | 할 일 고유 ID |
| user_id | uuid | 사용자 ID (users 테이블 FK) |
| title | string | 할 일 제목 |
| description | text | 할 일 상세 설명 |
| created_date | timestamp | 생성일 |
| due_date | timestamp | 마감일 |
| priority | enum | high / medium / low |
| category | string | 업무 / 개인 / 학습 등 |
| completed | boolean | 완료 여부 |

#### 세부 요구사항
- 완료 여부 토글 가능
- 수정 시 즉시 UI 반영
- 사용자 본인의 할 일만 접근 가능 (Row Level Security 적용)

---

### 2.3 검색 / 필터 / 정렬 기능

#### 검색
- 제목(title), 설명(description) 기준 텍스트 검색

#### 필터
- 우선순위: 높음 / 중간 / 낮음
- 카테고리: 업무 / 개인 / 학습 등
- 진행 상태:
  - 진행 중 (completed = false && due_date >= today)
  - 완료 (completed = true)
  - 지연 (completed = false && due_date < today)

#### 정렬
- 우선순위 순
- 마감일 순
- 생성일 순

---

### 2.4 AI 할 일 생성 기능

#### 기능 설명
사용자가 자연어로 입력한 문장을 AI가 분석하여 구조화된 할 일 데이터로 변환한다.

#### 입력 예시
```
내일 오전 10시에 팀 회의 준비
```

#### 출력 예시
```json
{
  "title": "팀 회의 준비",
  "description": "내일 오전 10시에 있을 팀 회의를 위해 자료 작성하기",
  "created_date": "YYYY-MM-DD HH:MM",
  "due_date": "YYYY-MM-DD 10:00",
  "priority": "high",
  "category": "업무",
  "completed": false
}
```

#### 세부 요구사항
- Google Gemini API 활용
- 날짜/시간 자동 파싱
- 결과 확인 후 사용자 승인 시 저장

---

### 2.5 AI 요약 및 분석 기능

#### 기능 설명
버튼 클릭 한 번으로 AI가 사용자의 전체 할 일을 분석하여 요약 정보를 제공한다.

#### 일일 요약
- 오늘 완료한 할 일 목록
- 오늘 남은 할 일 요약

#### 주간 요약
- 이번 주 전체 할 일 개수
- 완료율(%)
- 가장 많이 사용한 카테고리
- 지연된 할 일 개수

---

## 3. 화면 구성

### 3.1 로그인 / 회원가입 화면
- 이메일 / 비밀번호 입력
- 로그인, 회원가입 전환
- 인증 상태에 따른 라우팅

### 3.2 할 일 관리 메인 화면
- 할 일 목록 리스트
- 할 일 추가 버튼
- 검색 입력창
- 필터 및 정렬 옵션
- AI 할 일 생성 버튼
- AI 요약 및 분석 버튼

### 3.3 확장 화면 (추후)
- 통계 및 분석 대시보드
- 주간 활동량 그래프
- 카테고리별 완료율 시각화

---

## 4. 기술 스택

### 프론트엔드
- Next.js (App Router)
- Tailwind CSS
- shadcn/ui

### 백엔드 / 인프라
- Supabase (Auth, Database, RLS)

### AI
- Google Gemini API

---

## 5. 데이터베이스 구조 (Supabase)

### 5.1 users
- Supabase Auth 기본 테이블 사용

### 5.2 todos
```sql
create table todos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  title text not null,
  description text,
  created_date timestamp with time zone default now(),
  due_date timestamp with time zone,
  priority text check (priority in ('high', 'medium', 'low')),
  category text,
  completed boolean default false
);
```

#### 보안 정책
- Row Level Security 활성화
- user_id = auth.uid() 인 경우만 접근 허용

---

## 6. 비기능 요구사항

- 반응형 UI 지원 (모바일 / 데스크탑)
- 평균 응답 시간 1초 이내
- 접근성 고려 (키보드 네비게이션)

---

## 7. 향후 확장 방향

- 캘린더 연동
- 푸시 알림
- 팀 단위 할 일 공유 기능
