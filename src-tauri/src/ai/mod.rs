mod gemini;
mod traits;
mod tools;

pub use gemini::GeminiService;
pub use traits::{AIService, AIServiceError, ChatMessage, AIResponse, ToolCall};
pub use tools::get_available_tools;

