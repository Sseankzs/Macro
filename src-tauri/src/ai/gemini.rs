use super::traits::{AIService, AIServiceError, ChatMessage, AIResponse, UsageStats, ToolCall};
use super::tools::get_available_tools;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Clone)]
pub struct GeminiService {
    api_key: String,
    model_name: String,
    client: reqwest::Client,
}

impl GeminiService {
    pub fn new() -> Result<Self, AIServiceError> {
        let api_key = env::var("GEMINI_API_KEY")
            .map_err(|_| AIServiceError::ConfigurationError(
                "GEMINI_API_KEY environment variable not set".to_string()
            ))?;
        
        // Default to gemini-1.5-flash (fast, free tier friendly)
        // Alternatives: gemini-1.5-pro, gemini-2.0-flash-exp
        let model_name = env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-2.5-flash".to_string());
        
        Ok(Self {
            api_key,
            model_name,
            client: reqwest::Client::new(),
        })
    }

    fn build_api_url(&self) -> String {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            self.model_name
        )
    }
}

#[async_trait::async_trait]
impl AIService for GeminiService {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<AIResponse, AIServiceError> {
        self.chat_with_context(messages, "").await
    }

    async fn chat_with_context(
        &self,
        messages: Vec<ChatMessage>,
        context: &str,
    ) -> Result<AIResponse, AIServiceError> {
        // Build the prompt with context and system messages
        let mut system_context_parts = Vec::new();
        let mut conversation_contents = Vec::new();
        
        // Add context if available
        if !context.is_empty() {
            system_context_parts.push(format!("Context about user's productivity data:\n{}", context));
        }
        
        // Process messages and build conversation
        for message in &messages {
            match message.role.as_str() {
                "system" => {
                    system_context_parts.push(message.content.clone());
                }
                "user" | "assistant" => {
                    conversation_contents.push(ConversationMessage {
                        role: if message.role == "user" { "user".to_string() } else { "model".to_string() },
                        parts: vec![ConversationPart {
                            text: message.content.clone(),
                        }],
                    });
                }
                _ => {}
            }
        }
        
        // Get available tools
        let tools = get_available_tools();
        
        // Build system prompt with tool instructions
        let tool_descriptions: String = tools.iter()
            .map(|tool| format!("- {}: {}", tool.name, tool.description))
            .collect::<Vec<_>>()
            .join("\n");
        
        let tool_instruction = format!(
            "\n\nIMPORTANT - When to use tools vs text:\n\
            - Use tools when the user asks for VISUAL data, charts, breakdowns, comparisons, or structured information\n\
            - Use text when explaining concepts, providing advice, answering 'why/how' questions, or having a conversation\n\
            - If unsure, prefer tools for data-heavy questions and text for explanations\n\
            \nAvailable tools:\n{}\n\
            \nYou can call multiple tools in one response. Return tool calls in JSON format:\n\
            {{\"tools\": [{{\"name\": \"tool_name\", \"arguments\": {{\"param\": \"value\"}}}}, ...], \"text\": \"optional explanatory text\"}}",
            tool_descriptions
        );
        
        // Combine system context with the first user message if available
        let mut final_contents = Vec::new();
        if !system_context_parts.is_empty() {
            let system_prompt = format!(
                "You are a helpful productivity assistant and secretary for a time tracking application. \
                Help users understand their work patterns, time tracking data, task management, and productivity insights. \
                Be concise, helpful, and data-driven.\n\n{}\n\n{}", 
                system_context_parts.join("\n\n"),
                tool_instruction
            );
            if let Some(first_user) = conversation_contents.iter().find(|m| m.role == "user") {
                // Prepend system context to first user message
                let mut first_user_modified = first_user.clone();
                first_user_modified.parts[0].text = format!("{}{}", system_prompt, first_user_modified.parts[0].text);
                final_contents.push(first_user_modified);
                // Add remaining messages
                let mut added_first = false;
                for msg in conversation_contents {
                    if msg.role == "user" && !added_first {
                        added_first = true;
                        continue; // Already added modified version
                    }
                    final_contents.push(msg);
                }
            } else {
                // No user message yet, just add system prompt as user message
                final_contents.push(ConversationMessage {
                    role: "user".to_string(),
                    parts: vec![ConversationPart {
                        text: system_prompt,
                    }],
                });
            }
        } else {
            final_contents = conversation_contents;
        }
        
        // If no messages, create a default prompt
        if final_contents.is_empty() {
            final_contents.push(ConversationMessage {
                role: "user".to_string(),
                parts: vec![ConversationPart {
                    text: "Hello, I'm your productivity assistant.".to_string(),
                }],
            });
        }

        // Build the request body for Gemini API
        #[derive(Serialize, Clone)]
        struct ConversationMessage {
            role: String,
            parts: Vec<ConversationPart>,
        }

        #[derive(Serialize, Clone)]
        struct ConversationPart {
            text: String,
        }

        // Convert tools to Gemini function declarations format
        let gemini_functions: Vec<serde_json::Value> = tools.iter()
            .map(|tool| {
                serde_json::json!({
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters
                })
            })
            .collect();

        #[derive(Serialize)]
        struct RequestBody {
            contents: Vec<ConversationMessage>,
            tools: Option<serde_json::Value>,
            generation_config: GenerationConfig,
        }

        #[derive(Serialize)]
        struct GenerationConfig {
            temperature: f32,
            top_k: u32,
            top_p: f32,
            max_output_tokens: u32,
        }

        let request_body = RequestBody {
            contents: final_contents,
            tools: if !gemini_functions.is_empty() {
                Some(serde_json::json!({
                    "function_declarations": gemini_functions
                }))
            } else {
                None
            },
            generation_config: GenerationConfig {
                temperature: 0.7,
                top_k: 40,
                top_p: 0.95,
                max_output_tokens: 2048,
            },
        };

        // Make the API request
        let url = self.build_api_url();
        let response = self
            .client
            .post(&url)
            .query(&[("key", &self.api_key)])
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AIServiceError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AIServiceError::ApiError(format!(
                "API returned status {}: {}",
                status, error_text
            )));
        }

        // Parse the response
        #[derive(Deserialize)]
        struct GeminiResponse {
            candidates: Option<Vec<Candidate>>,
            #[serde(rename = "promptFeedback")]
            prompt_feedback: Option<PromptFeedback>,
            #[serde(rename = "usageMetadata")]
            usage_metadata: Option<UsageMetadata>,
        }

        #[derive(Deserialize)]
        struct Candidate {
            content: Option<CandidateContent>,
            #[serde(rename = "finishReason")]
            finish_reason: Option<String>,
        }

        #[derive(Deserialize)]
        struct CandidateContent {
            parts: Option<Vec<PartResponse>>,
            role: Option<String>,
        }

        #[derive(Deserialize)]
        struct PartResponse {
            text: Option<String>,
            #[serde(rename = "functionCall")]
            function_call: Option<FunctionCallResponse>,
        }

        #[derive(Deserialize)]
        struct FunctionCallResponse {
            name: String,
            args: serde_json::Value,
        }

        #[derive(Deserialize)]
        struct PromptFeedback {
            block_reason: Option<String>,
        }

        #[derive(Deserialize)]
        struct UsageMetadata {
            #[serde(rename = "promptTokenCount")]
            prompt_token_count: Option<u32>,
            #[serde(rename = "candidatesTokenCount")]
            candidates_token_count: Option<u32>,
            #[serde(rename = "totalTokenCount")]
            total_token_count: Option<u32>,
        }

        let gemini_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| AIServiceError::InvalidResponse(format!("Failed to parse JSON: {}", e)))?;

        // Extract the response - handle both text and function calls
        let mut content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        
        if let Some(candidates) = gemini_response.candidates {
            for candidate in candidates {
                if let Some(candidate_content) = candidate.content {
                    if let Some(parts) = candidate_content.parts {
                        for part in parts {
                            // Handle text responses
                            if let Some(text) = part.text {
                                content.push_str(&text);
                            }
                            
                            // Handle function calls
                            if let Some(function_call) = part.function_call {
                                tool_calls.push(ToolCall {
                                    name: function_call.name,
                                    arguments: function_call.args,
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // If no content but we have tool calls, provide a default message
        if content.is_empty() && !tool_calls.is_empty() {
            content = "I'll show you that information:".to_string();
        }
        
        // If we have neither content nor tools, return an error
        if content.is_empty() && tool_calls.is_empty() {
            return Err(AIServiceError::InvalidResponse(
                "No content or tools in response".to_string()
            ));
        }

        // Extract usage stats if available
        let usage = gemini_response.usage_metadata.map(|um| UsageStats {
            prompt_tokens: um.prompt_token_count,
            completion_tokens: um.candidates_token_count,
            total_tokens: um.total_token_count,
        });

        Ok(AIResponse { 
            content,
            usage,
            tools: if tool_calls.is_empty() { None } else { Some(tool_calls) },
        })
    }

    fn get_model_name(&self) -> &str {
        &self.model_name
    }
}

