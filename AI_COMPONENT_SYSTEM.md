# AI Assistant Component System Design

## Core Concept
Instead of always returning plain text, the AI can return structured responses that specify:
1. **Response Type**: Text, Component, or Mixed
2. **Component Type**: Which UI component to render
3. **Data**: Structured data for the component
4. **Text Context**: Optional explanatory text before/after component

## Question Type Classification

### 1. **App Usage Breakdown Questions**
**Trigger Phrases:**
- "What apps do I use most?"
- "Show me my app usage"
- "Breakdown of applications"
- "Which apps take most time?"
- "Top apps"

**Component**: `AppUsageChart` (Pie Chart or Bar Chart)
**Data Structure**:
```typescript
{
  type: "app_usage",
  chartType: "pie" | "bar",
  data: Array<{
    app_name: string;
    hours: number;
    percentage: number;
    category?: string;
  }>,
  period: "today" | "week" | "month"
}
```

---

### 2. **Time Tracking Questions**
**Trigger Phrases:**
- "How much time did I track?"
- "Time spent today/week/month"
- "Show me my time tracking"
- "Hours worked"

**Component**: `TimeTrackingCard` (Stat Cards + Trend)
**Data Structure**:
```typescript
{
  type: "time_tracking",
  period: "today" | "week" | "month",
  total_hours: number,
  breakdown: {
    today?: number,
    yesterday?: number,
    week?: number,
    month?: number
  },
  trend: "up" | "down" | "stable",
  comparison?: number // percentage change
}
```

---

### 3. **Productivity Trends Questions**
**Trigger Phrases:**
- "Show productivity trends"
- "How productive am I over time?"
- "Productivity over the week"
- "Time tracking trends"

**Component**: `ProductivityTrendChart` (Line/Area Chart)
**Data Structure**:
```typescript
{
  type: "productivity_trend",
  chartType: "line" | "area",
  data: Array<{
    date: string,
    hours: number,
    label?: string
  }>,
  period: "week" | "month"
}
```

---

### 4. **Task Status Questions**
**Trigger Phrases:**
- "What's my task progress?"
- "Show my tasks"
- "Task breakdown"
- "How many tasks are done?"
- "Task completion"

**Component**: `TaskStatusCard` (Progress Bars + Stats)
**Data Structure**:
```typescript
{
  type: "task_status",
  stats: {
    total: number,
    todo: number,
    in_progress: number,
    done: number,
    completion_rate: number
  },
  breakdown?: Array<{
    status: "todo" | "in_progress" | "done",
    count: number,
    percentage: number
  }>
}
```

---

### 5. **Peak Hours Questions**
**Trigger Phrases:**
- "When am I most productive?"
- "Peak hours"
- "Best time to work"
- "Productivity hours"

**Component**: `PeakHoursChart` (Heatmap or Bar Chart)
**Data Structure**:
```typescript
{
  type: "peak_hours",
  chartType: "heatmap" | "bar",
  data: Array<{
    hour: number, // 0-23
    productivity_score: number,
    hours_tracked: number
  }>,
  top_hours: number[] // [9, 10, 11, 14, 15]
}
```

---

### 6. **Comparison Questions**
**Trigger Phrases:**
- "Compare this week vs last week"
- "How does today compare to yesterday?"
- "Time difference between periods"
- "Week over week comparison"

**Component**: `ComparisonCard` (Side-by-side Stats)
**Data Structure**:
```typescript
{
  type: "comparison",
  periods: {
    current: { label: string, hours: number, apps: number },
    previous: { label: string, hours: number, apps: number }
  },
  differences: {
    hours: number, // +/- hours
    percentage: number,
    trend: "up" | "down"
  }
}
```

---

### 7. **Calendar/Time View Questions**
**Trigger Phrases:**
- "Show calendar"
- "Time tracking calendar"
- "Daily breakdown"
- "What did I do this week?"
- "Calendar view"

**Component**: `TimeCalendarView` (Calendar Heatmap)
**Data Structure**:
```typescript
{
  type: "calendar",
  viewType: "month" | "week",
  data: Array<{
    date: string,
    hours: number,
    intensity: number // 0-1 for color intensity
  }>
}
```

---

### 8. **Recommendations/Insights Questions**
**Trigger Phrases:**
- "Give me insights"
- "What should I improve?"
- "Recommendations"
- "How can I be more productive?"
- "Suggestions"

**Component**: `InsightCards` (List of Insight Cards)
**Data Structure**:
```typescript
{
  type: "insights",
  insights: Array<{
    title: string,
    description: string,
    type: "tip" | "warning" | "achievement",
    actionable?: boolean,
    action?: string
  }>
}
```

---

### 9. **App Category Breakdown**
**Trigger Phrases:**
- "Show categories"
- "Time by category"
- "Development vs communication"
- "Category breakdown"

**Component**: `CategoryBreakdownChart` (Stacked Bar or Pie)
**Data Structure**:
```typescript
{
  type: "category_breakdown",
  chartType: "stacked_bar" | "pie",
  categories: Array<{
    name: string,
    hours: number,
    percentage: number,
    apps: string[]
  }>
}
```

---

### 10. **Quick Stats Summary**
**Trigger Phrases:**
- "Summary"
- "Quick stats"
- "Overview"
- "Stats"

**Component**: `StatsGrid` (Multi-card Grid)
**Data Structure**:
```typescript
{
  type: "stats_summary",
  stats: Array<{
    label: string,
    value: string | number,
    icon?: string,
    trend?: "up" | "down",
    subtitle?: string
  }>
}
```

---

## Response Format

The AI will return JSON with this structure:

```typescript
interface AIResponse {
  text: string; // Optional explanatory text
  components?: Array<{
    type: ComponentType;
    data: ComponentData;
    priority: number; // For ordering multiple components
  }>;
  metadata?: {
    confidence: number; // How confident AI is about component choice
    fallback?: string; // Fallback text if component fails
  };
}
```

## Implementation Strategy

### Phase 1: Intent Detection
- Train AI to classify question intent
- Return structured JSON instead of just text
- Support both component and text responses

### Phase 2: Component Library
- Build reusable components for each type
- Make them data-driven and flexible
- Ensure responsive design

### Phase 3: Hybrid Responses
- Support mixing text + components
- Allow multiple components in one response
- Graceful fallback to text if component fails

### Phase 4: Interactive Components
- Allow user interaction (filtering, time period changes)
- Support drill-downs and details
- Real-time updates

---

## Priority Order for MVP

1. **App Usage Breakdown** - Most common question type
2. **Time Tracking Stats** - Core functionality
3. **Task Status** - Important for productivity context
4. **Productivity Trends** - Visual trends are valuable
5. **Stats Summary** - Quick overview component

---

## Question Pattern Examples

### High Priority Patterns:
- "Show me..." → Component
- "Breakdown of..." → Chart component
- "How much..." → Stat card
- "Compare..." → Comparison component
- "Trends in..." → Trend chart
- "What are my..." → List/table component

### Low Priority (Text Response):
- "Why..." → Text explanation
- "How do I..." → Text instructions
- "Tell me about..." → Text description
- "Explain..." → Text explanation

