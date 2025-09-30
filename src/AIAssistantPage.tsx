import React, { useState, useRef, useEffect } from 'react';
import './AIAssistantPage.css';
import Sidebar from './Sidebar';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface AIAssistantPageProps {
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => void;
}

const AIAssistantPage: React.FC<AIAssistantPageProps> = ({ onLogout, onPageChange }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm your AI assistant. I can help you analyze your productivity data, answer questions about your time tracking, and provide insights to improve your workflow. How can I assist you today?",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

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
    if (!inputValue.trim()) return;

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

    // Simulate AI response with streaming
    setTimeout(() => {
      const fullResponse = generateAIResponse(userInput);
      setIsTyping(false);
      setIsStreaming(true);
      setStreamingMessage('');
      
      streamText(fullResponse, (chunk) => {
        setStreamingMessage(chunk);
      });
      
      // Add the complete message after streaming finishes
      setTimeout(() => {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          content: fullResponse,
          isUser: false,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiResponse]);
        setIsStreaming(false);
        setStreamingMessage('');
      }, fullResponse.length * 15 + 500); // Wait for streaming to complete
    }, 1500);
  };

  const generateAIResponse = (userInput: string): string => {
    const input = userInput.toLowerCase();
    
    if (input.includes('productivity') || input.includes('time tracking')) {
      return "Based on your time tracking data, I can see you've been quite productive! Your most active hours are typically in the morning. Would you like me to analyze specific patterns in your work habits or suggest ways to optimize your schedule?";
    } else if (input.includes('apps') || input.includes('application')) {
      return "I can help you analyze your application usage patterns. From your data, I notice you spend most time in development tools. Would you like insights on how to better manage your app usage or reduce distractions?";
    } else if (input.includes('help') || input.includes('assist')) {
      return "I'm here to help! I can assist with:\n\n• Analyzing your productivity patterns\n• Providing insights on time management\n• Answering questions about your tracked data\n• Suggesting workflow improvements\n• Helping with task prioritization\n\nWhat would you like to explore?";
    } else if (input.includes('schedule') || input.includes('calendar')) {
      return "I can help you optimize your schedule based on your productivity patterns. Your data shows you're most focused during certain hours. Would you like me to suggest the best times for different types of work?";
    } else {
      return "That's an interesting question! I'm designed to help you with productivity insights and time management. Could you tell me more about what you'd like to know about your work patterns or how I can assist you better?";
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

          <div className="chat-container">
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
                    <div className="message-text">
                      {message.content.split('\n').map((line, index) => (
                        <div key={index}>{line}</div>
                      ))}
                    </div>
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
                   disabled={!inputValue.trim() || isTyping}
                 >
                  ↑
                 </button>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPage;
