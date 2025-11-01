import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AIAssistantPage.css';
import Sidebar from './Sidebar';

// Check if we're running in Tauri environment
const isTauri = () => {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  // Check multiple possible Tauri indicators
  return !!(win.__TAURI_INTERNALS__ || win.__TAURI__ || win.__TAURI_METADATA__);
};

interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

interface AIResponse {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  tools?: ToolCall[];
}

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  tools?: ToolCall[]; // Tool calls from AI
}

interface ProductivityInsights {
  total_time_today: number;
  total_time_this_week: number;
  total_time_this_month: number;
  most_used_apps: Array<{
    app_name: string;
    hours: number;
    percentage: number;
  }>;
  current_activity?: {
    app_name: string;
    duration_seconds: number;
    is_active: boolean;
  };
  task_stats: {
    total: number;
    todo: number;
    in_progress: number;
    done: number;
    completion_rate: number;
  };
  productivity_trend: {
    daily_hours: Array<{
      date: string;
      hours: number;
    }>;
    peak_hours: number[];
  };
}

interface ChatMessage {
  role: string;
  content: string;
}

interface AIAssistantPageProps {
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => void;
}

const AIAssistantPage: React.FC<AIAssistantPageProps> = ({ onLogout, onPageChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [insights, setInsights] = useState<ProductivityInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Convert messages to ChatMessage format for backend
  const getConversationHistory = (): ChatMessage[] => {
    return messages.map(m => ({
      role: m.isUser ? 'user' : 'assistant',
      content: m.content
    }));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  useEffect(() => {
    loadProductivityInsights();
  }, []);

  const loadProductivityInsights = async () => {
    try {
      setIsLoadingInsights(true);
      if (isTauri()) {
        const data = await invoke<ProductivityInsights>('get_productivity_insights');
        setInsights(data);
      }
    } catch (error) {
      console.error('Failed to load productivity insights:', error);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const streamText = (text: string, callback: (chunk: string) => void) => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        callback(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 15); // Adjust speed here (lower = faster)
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping || isStreaming) return;

    // Mark conversation as started
    if (!hasStartedConversation) {
      setHasStartedConversation(true);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = inputValue.trim();
    setInputValue('');
    setIsTyping(true);

    try {
      // Try to use invoke directly - if it fails, we'll know we're not in Tauri
      const conversationHistory = getConversationHistory();
      const aiResponse: AIResponse = await invoke<AIResponse>('ai_chat', {
        message: userInput,
        conversationHistory: conversationHistory
      });
      
      setIsTyping(false);
      
      // If there are tools, don't stream - just show the message with components
      if (aiResponse.tools && aiResponse.tools.length > 0) {
        const message: Message = {
          id: (Date.now() + 1).toString(),
          content: aiResponse.content || "Here's the information:",
          isUser: false,
          timestamp: new Date(),
          tools: aiResponse.tools
        };
        setMessages(prev => [...prev, message]);
      } else {
        // No tools, stream the text response
        setIsStreaming(true);
        setStreamingMessage('');
        
        const text = aiResponse.content || "";
        streamText(text, (chunk) => {
          setStreamingMessage(chunk);
        });
        
        // Add the complete message after streaming finishes
        setTimeout(() => {
          const message: Message = {
            id: (Date.now() + 1).toString(),
            content: text,
            isUser: false,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, message]);
          setIsStreaming(false);
          setStreamingMessage('');
        }, text.length * 15 + 500);
      }
    } catch (error) {
      console.error('Failed to get AI response:', error);
      setIsTyping(false);
      
      // Check if this is a Tauri-specific error or just an API error
      const errorStr = error instanceof Error ? error.message : String(error);
      let errorMessage: string;
      
      if (errorStr.includes('invoke') || errorStr.includes('not available') || errorStr.includes('Tauri')) {
        errorMessage = "AI assistant is only available in the Tauri app. Please use the desktop application.";
      } else if (errorStr.includes('GEMINI_API_KEY') || errorStr.includes('API key')) {
        errorMessage = `I'm sorry, I encountered an error with the AI service: ${errorStr}. Please make sure your GEMINI_API_KEY is set in the src-tauri/.env file.`;
      } else {
        errorMessage = `I'm sorry, I encountered an error: ${errorStr}. Please try again.`;
      }
      
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  const handleQuickAction = (query: string) => {
    // Mark conversation as started
    if (!hasStartedConversation) {
      setHasStartedConversation(true);
    }

    // Create user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: query,
      isUser: true,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Trigger AI response
    handleQuickActionSend(query);
  };

  const handleQuickActionSend = async (query: string) => {
    setIsTyping(true);
    setInputValue('');

    try {
      const conversationHistory = getConversationHistory();
      const aiResponse: AIResponse = await invoke<AIResponse>('ai_chat', {
        message: query,
        conversationHistory: conversationHistory
      });
      
      setIsTyping(false);
      
      // If there are tools, don't stream - just show the message with components
      if (aiResponse.tools && aiResponse.tools.length > 0) {
        const message: Message = {
          id: (Date.now() + 1).toString(),
          content: aiResponse.content || "Here's the information:",
          isUser: false,
          timestamp: new Date(),
          tools: aiResponse.tools
        };
        setMessages(prev => [...prev, message]);
      } else {
        // No tools, stream the text response
        setIsStreaming(true);
        setStreamingMessage('');
        
        const text = aiResponse.content || "";
        streamText(text, (chunk) => {
          setStreamingMessage(chunk);
        });
        
        setTimeout(() => {
          const message: Message = {
            id: (Date.now() + 1).toString(),
            content: text,
            isUser: false,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, message]);
          setIsStreaming(false);
          setStreamingMessage('');
        }, text.length * 15 + 500);
      }
    } catch (error) {
      console.error('Failed to get AI response:', error);
      setIsTyping(false);
      const errorStr = error instanceof Error ? error.message : String(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I'm sorry, I encountered an error: ${errorStr}`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Component renderer - renders UI components based on tool calls
  const renderToolComponent = (tool: ToolCall) => {
    if (!insights) {
      return <div className="component-loading">Loading data...</div>;
    }

    switch (tool.name) {
      case 'show_app_usage_breakdown': {
        const period = tool.arguments?.period || 'week';
        const chartType = tool.arguments?.chartType || 'bar';
        const apps = insights.most_used_apps || [];
        
        return (
          <div className="ai-component app-usage-breakdown">
            <h4>App Usage Breakdown ({period})</h4>
            {chartType === 'pie' ? (
              <div className="simple-pie-chart">
                {apps.map((app, idx) => (
                  <div key={idx} className="app-item" style={{ 
                    width: `${app.percentage}%`,
                    backgroundColor: `hsl(${idx * 60}, 70%, 60%)`
                  }}>
                    <span>{app.app_name}: {app.hours.toFixed(1)}h ({app.percentage.toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="simple-bar-chart">
                {apps.map((app, idx) => (
                  <div key={idx} className="bar-item">
                    <div className="bar-label">{app.app_name}</div>
                    <div className="bar-wrapper">
                      <div className="bar-container">
                        <div
                          className="bar-fill"
                          style={{ width: `${app.percentage}%`, backgroundColor: `hsl(${idx * 60}, 70%, 60%)` }}
                        />
                      </div>
                      <span className="bar-value">{app.hours.toFixed(1)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      
      case 'show_time_tracking_stats': {
        return (
          <div className="ai-component time-stats">
            <h4>Time Tracking</h4>
            <div className="stat-card-large">
              <div className="stat-value">{insights.total_time_today.toFixed(1)}</div>
              <div className="stat-label">Hours Today</div>
            </div>
            <div className="stats-breakdown">
              <div className="stat-item">
                <span className="stat-label-small">This Week</span>
                <span className="stat-value-small">{insights.total_time_this_week.toFixed(1)}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label-small">This Month</span>
                <span className="stat-value-small">{insights.total_time_this_month.toFixed(1)}h</span>
              </div>
            </div>
          </div>
        );
      }
      
      case 'show_task_status': {
        const stats = insights.task_stats;
        return (
          <div className="ai-component task-status">
            <h4>Task Status</h4>
            <div className="task-stats-grid">
              <div className="task-stat-card">
                <div className="task-stat-value">{stats.total}</div>
                <div className="task-stat-label">Total Tasks</div>
              </div>
              <div className="task-stat-card">
                <div className="task-stat-value">{stats.todo}</div>
                <div className="task-stat-label">To Do</div>
              </div>
              <div className="task-stat-card">
                <div className="task-stat-value">{stats.in_progress}</div>
                <div className="task-stat-label">In Progress</div>
              </div>
              <div className="task-stat-card">
                <div className="task-stat-value">{stats.done}</div>
                <div className="task-stat-label">Done</div>
              </div>
            </div>
            <div className="completion-progress">
              <div className="progress-label">Completion Rate</div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${stats.completion_rate}%` }}
                />
              </div>
              <div className="progress-value">{stats.completion_rate.toFixed(1)}%</div>
            </div>
          </div>
        );
      }
      
      case 'show_peak_hours': {
        const peakHours = insights.productivity_trend.peak_hours || [];
        return (
          <div className="ai-component peak-hours">
            <h4>Peak Productivity Hours</h4>
            <div className="peak-hours-list">
              {peakHours.map((hour, idx) => (
                <div key={idx} className="peak-hour-badge">
                  {hour}:00
                </div>
              ))}
            </div>
            <p className="peak-hours-note">You're most productive during these hours</p>
          </div>
        );
      }
      
      case 'show_stats_summary': {
        return (
          <div className="ai-component stats-summary">
            <h4>Productivity Overview</h4>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-info">
                  <div className="stat-value">{insights.total_time_today.toFixed(1)}h</div>
                  <div className="stat-label">Today</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <div className="stat-value">{insights.total_time_this_week.toFixed(1)}h</div>
                  <div className="stat-label">This Week</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <div className="stat-value">{insights.task_stats.completion_rate.toFixed(0)}%</div>
                  <div className="stat-label">Tasks Done</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📱</div>
                <div className="stat-info">
                  <div className="stat-value">{insights.most_used_apps.length}</div>
                  <div className="stat-label">Top Apps</div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      default:
        return (
          <div className="ai-component unknown">
            <p>Component for {tool.name} not yet implemented</p>
            <pre>{JSON.stringify(tool.arguments, null, 2)}</pre>
          </div>
        );
    }
  };

  return (
    <div className="ai-assistant-container">
      <Sidebar 
        currentPage="ai-assistant" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        <div className="ai-assistant-page-container">
          <div className="ai-assistant-header">
            <h1>AI Assistant</h1>
            <div className="status-indicator">
              <div className="status-dot"></div>
              Online
            </div>
          </div>

          {/* Quick Actions - Show at top when conversation started, below input when not */}
          {hasStartedConversation && (
            <div className="quick-actions-container top-actions">
              <div className="quick-actions-buttons">
                <button 
                  className="quick-action-btn"
                  onClick={() => handleQuickAction("How much time did I track today?")}
                  disabled={isTyping || isStreaming}
                >
                  Time Today
                </button>
                <button 
                  className="quick-action-btn"
                  onClick={() => handleQuickAction("What are my most used apps?")}
                  disabled={isTyping || isStreaming}
                >
                  Top Apps
                </button>
                <button 
                  className="quick-action-btn"
                  onClick={() => handleQuickAction("What's my task progress?")}
                  disabled={isTyping || isStreaming}
                >
                  Task Status
                </button>
                <button 
                  className="quick-action-btn"
                  onClick={() => handleQuickAction("When am I most productive?")}
                  disabled={isTyping || isStreaming}
                >
                  Peak Hours
                </button>
                <button 
                  className="quick-action-btn"
                  onClick={() => handleQuickAction("Show me productivity insights")}
                  disabled={isTyping || isStreaming}
                >
                  Insights
                </button>
              </div>
            </div>
          )}

          <div className="chat-container">
            {/* Welcome Screen - Show when conversation hasn't started */}
            {!hasStartedConversation ? (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <h2>Welcome to Insights</h2>
                  <p>Ask me anything about your team's productivity, time tracking, tasks, or get insights to improve your workflow.</p>
                </div>
              </div>
            ) : (
              <div className="messages-container">
                {messages.map((message) => (
                <div key={message.id} className={`message ${message.isUser ? 'user-message' : 'ai-message'}`}>
                   <div className="message-avatar">
                     {message.isUser ? (
                       <div className="user-avatar"></div>
                     ) : (
                       <div className="ai-avatar"></div>
                     )}
                   </div>
                  <div className="message-content">
                    {/* Show text content if present */}
                    {message.content && (
                      <div className="message-text">
                        {message.content.split('\n').map((line, index) => (
                          <div key={index}>{line}</div>
                        ))}
                      </div>
                    )}
                    {/* Render tool components if present */}
                    {message.tools && message.tools.length > 0 && (
                      <div className="message-components">
                        {message.tools.map((tool, idx) => (
                          <div key={idx} className="tool-component-wrapper">
                            {renderToolComponent(tool)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {(isTyping || isStreaming) && (
                 <div className="message ai-message">
                   <div className="message-avatar">
                     <div className="ai-avatar"></div>
                   </div>
                   <div className="message-content">
                     <div className="message-text">
                       {isStreaming ? (
                         <>
                           {streamingMessage.split('\n').map((line, index) => (
                             <div key={index}>{line}</div>
                           ))}
                           <span className="streaming-cursor">|</span>
                         </>
                       ) : (
                         <span className="typing-indicator">
                           <span></span>
                           <span></span>
                           <span></span>
                         </span>
                       )}
                     </div>
                   </div>
                 </div>
               )}
              
              <div ref={messagesEndRef} />
              </div>
            )}

             <div className="input-container">
               <div className="input-wrapper">
                 <textarea
                   ref={inputRef}
                   value={inputValue}
                   onChange={(e) => setInputValue(e.target.value)}
                   onKeyPress={handleKeyPress}
                   placeholder="Message AI Assistant..."
                   className="message-input"
                   rows={1}
                 />
                 <button 
                  className="send-button"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isTyping || isStreaming}
                 >
                  ↑
                 </button>
               </div>
               
               {/* Quick Actions below input - Show when conversation hasn't started */}
               {!hasStartedConversation && (
                 <div className="quick-actions-container bottom-actions">
                   <div className="quick-actions-buttons">
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("How much time did I track today?")}
                       disabled={isTyping || isStreaming}
                     >
                       Time Today
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("What are my most used apps?")}
                       disabled={isTyping || isStreaming}
                     >
                       Top Apps
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("What's my task progress?")}
                       disabled={isTyping || isStreaming}
                     >
                       Task Status
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("When am I most productive?")}
                       disabled={isTyping || isStreaming}
                     >
                       Peak Hours
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("Show me productivity insights")}
                       disabled={isTyping || isStreaming}
                     >
                       Insights
                     </button>
                   </div>
                 </div>
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPage;
