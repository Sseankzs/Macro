use serde::{Deserialize, Serialize};

/// Define all available tools/functions for the AI assistant
pub fn get_available_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "show_app_usage_breakdown".to_string(),
            description: "Use this when the user asks about app usage, top apps, app breakdown, or wants to see which applications they use most. Shows a visual breakdown of applications with time spent.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Time period for the breakdown"
                    },
                    "chartType": {
                        "type": "string",
                        "enum": ["pie", "bar"],
                        "description": "Type of chart to display"
                    },
                    "limit": {
                        "type": "number",
                        "description": "Maximum number of apps to show (default: 10)"
                    }
                }),
                required: vec!["period".to_string()],
            },
        },
        ToolDefinition {
            name: "show_time_tracking_stats".to_string(),
            description: "Use this when the user asks 'how much time did I track', 'time spent today/week/month', 'hours worked', or wants to see their time tracking statistics. Shows summary cards with time metrics.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Time period for statistics"
                    },
                    "includeComparison": {
                        "type": "boolean",
                        "description": "Whether to include comparison with previous period"
                    }
                }),
                required: vec!["period".to_string()],
            },
        },
        ToolDefinition {
            name: "show_productivity_trends".to_string(),
            description: "Use this when the user asks about trends, productivity over time, 'show trends', time tracking patterns, or wants to see how their productivity changes over days/weeks. Shows a line or area chart.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "period": {
                        "type": "string",
                        "enum": ["week", "month"],
                        "description": "Time period for the trend"
                    },
                    "chartType": {
                        "type": "string",
                        "enum": ["line", "area"],
                        "description": "Type of trend chart"
                    }
                }),
                required: vec!["period".to_string()],
            },
        },
        ToolDefinition {
            name: "show_task_status".to_string(),
            description: "Use this when the user asks about tasks, task progress, completion status, 'how many tasks', 'task breakdown', or wants to see their task statistics. Shows task counts and progress bars.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "includeBreakdown": {
                        "type": "boolean",
                        "description": "Whether to show detailed breakdown by status"
                    }
                }),
                required: vec![],
            },
        },
        ToolDefinition {
            name: "show_peak_hours".to_string(),
            description: "Use this when the user asks about peak productivity hours, 'when am I most productive', 'best time to work', or wants to see their most productive hours of the day. Shows a heatmap or bar chart of hours.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "chartType": {
                        "type": "string",
                        "enum": ["heatmap", "bar"],
                        "description": "Type of visualization"
                    }
                }),
                required: vec![],
            },
        },
        ToolDefinition {
            name: "show_comparison".to_string(),
            description: "Use this when the user asks to compare periods like 'this week vs last week', 'today vs yesterday', or wants to see differences between time periods. Shows side-by-side comparison cards.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "currentPeriod": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Current period to compare"
                    },
                    "previousPeriod": {
                        "type": "string",
                        "enum": ["yesterday", "last_week", "last_month"],
                        "description": "Previous period to compare against"
                    }
                }),
                required: vec!["currentPeriod".to_string(), "previousPeriod".to_string()],
            },
        },
        ToolDefinition {
            name: "show_insights".to_string(),
            description: "Use this when the user asks for insights, recommendations, tips, 'how can I improve', suggestions, or wants actionable advice about their productivity. Shows cards with insights and tips.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "focus": {
                        "type": "string",
                        "enum": ["productivity", "time_management", "apps", "tasks", "general"],
                        "description": "Focus area for insights"
                    }
                }),
                required: vec![],
            },
        },
        ToolDefinition {
            name: "show_stats_summary".to_string(),
            description: "Use this when the user asks for a summary, overview, quick stats, or wants a high-level dashboard view of all their productivity metrics. Shows a grid of stat cards.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({}),
                required: vec![],
            },
        },
        // Team management tools
        ToolDefinition {
            name: "show_team_overview".to_string(),
            description: "Use this when the user (who is a team manager) asks for team overview, team summary, team stats, or wants to see high-level team metrics like active members, total hours, averages, and top performers.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "includeInactive": {
                        "type": "boolean",
                        "description": "Whether to include inactive team members in the overview"
                    }
                }),
                required: vec![],
            },
        },
        ToolDefinition {
            name: "show_member_performance".to_string(),
            description: "Use this when the user asks about a specific team member's performance, productivity, or stats. Use when questions mention '@username' or ask about individual team member data.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "member_id": {
                        "type": "string",
                        "description": "The ID of the team member to show performance for"
                    },
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Time period for the performance data"
                    }
                }),
                required: vec!["member_id".to_string()],
            },
        },
        ToolDefinition {
            name: "show_team_member_comparison".to_string(),
            description: "Use this when the user wants to compare team members' performance, see rankings, or compare productivity across the team. Shows side-by-side comparison of all team members.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "sortBy": {
                        "type": "string",
                        "enum": ["hours_today", "hours_week", "tasks_done", "completion_rate"],
                        "description": "How to sort the comparison (default: hours_today)"
                    },
                    "includeInactive": {
                        "type": "boolean",
                        "description": "Whether to include inactive team members"
                    }
                }),
                required: vec![],
            },
        },
        ToolDefinition {
            name: "show_team_insights".to_string(),
            description: "Use this when the user asks for team insights, team recommendations, team improvement suggestions, or actionable advice about team productivity and management.".to_string(),
            parameters: ToolParameters {
                r#type: "object".to_string(),
                properties: serde_json::json!({
                    "focus": {
                        "type": "string",
                        "enum": ["productivity", "collaboration", "workload", "performance", "general"],
                        "description": "Focus area for team insights"
                    }
                }),
                required: vec![],
            },
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: ToolParameters,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameters {
    #[serde(rename = "type")]
    pub r#type: String,
    pub properties: serde_json::Value,
    pub required: Vec<String>,
}

