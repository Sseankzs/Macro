use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub enum AIServiceError {
    NetworkError(String),
    ApiError(String),
    ConfigurationError(String),
    InvalidResponse(String),
}

impl std::fmt::Display for AIServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIServiceError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            AIServiceError::ApiError(msg) => write!(f, "API error: {}", msg),
            AIServiceError::ConfigurationError(msg) => write!(f, "Configuration error: {}", msg),
            AIServiceError::InvalidResponse(msg) => write!(f, "Invalid response: {}", msg),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" or "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIResponse {
    pub content: String,
    pub usage: Option<UsageStats>,
    pub tools: Option<Vec<ToolCall>>, // Function calls/tools invoked
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: serde_json::Value, // JSON object with function arguments
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[async_trait::async_trait]
pub trait AIService: Send + Sync {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<AIResponse, AIServiceError>;
    
    async fn chat_with_context(
        &self,
        messages: Vec<ChatMessage>,
        context: &str,
    ) -> Result<AIResponse, AIServiceError>;
    
    fn get_model_name(&self) -> &str;
}

