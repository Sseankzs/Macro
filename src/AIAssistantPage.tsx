import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AIAssistantPage.css';
import Sidebar from './Sidebar';


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

interface TeamMemberInsights {
  member_id: string;
  member_name: string;
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

type AppUsage = {
  app_name: string;
  hours: number;
  percentage: number;
};

interface ProductivityInsights {
  // Individual insights (for personal queries)
  total_time_today: number;
  total_time_this_week: number;
  total_time_this_month: number;
  most_used_apps: Array<AppUsage>;
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

  // Team insights (for manager queries)
  team_members?: TeamMemberInsights[];
  team_summary?: {
    total_members: number;
    active_members: number;
    average_hours_today: number;
    average_hours_this_week: number;
    total_team_hours_today: number;
    total_team_hours_this_week: number;
    top_performers: Array<{
      member_id: string;
      member_name: string;
      hours: number;
    }>;
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

// Mock team data - will be replaced with real backend data
interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  isActive: boolean;
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  managerId: string; // Current user's ID if they are a manager
}

const AIAssistantPage: React.FC<AIAssistantPageProps> = ({ onLogout, onPageChange }) => {
  // Mock user data - will be replaced with real authentication
  const [currentUser] = useState({
    id: 'user-1',
    name: 'John Manager',
    role: 'manager', // 'manager' or 'member'
    teamId: 'team-1'
  });

  // Mock team data - will be replaced with real backend data
  const [currentTeam] = useState<Team>({
    id: 'team-1',
    name: 'Product Development Team',
    managerId: 'user-1', // John Manager is the manager
    members: [
      { id: 'user-1', name: 'John Manager', role: 'Manager', isActive: true },
      { id: 'user-2', name: 'Sarah Developer', role: 'Senior Developer', isActive: true },
      { id: 'user-3', name: 'Mike Designer', role: 'UI/UX Designer', isActive: true },
      { id: 'user-4', name: 'Alex QA', role: 'QA Engineer', isActive: false },
      { id: 'user-5', name: 'Lisa Analyst', role: 'Business Analyst', isActive: true }
    ]
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [insights] = useState<ProductivityInsights | null>(null);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);

  // Mention autocomplete state
  const [mentionSuggestions, setMentionSuggestions] = useState<TeamMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // Parse text into segments with mentions
  const parseTextWithMentions = (text: string) => {
    const segments: Array<{ type: 'text' | 'mention', content: string, member?: TeamMember }> = [];
    const mentionRegex = /(@\w+(?:\s+\w+)*)/g;
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }

      // Add mention
      const mentionText = match[1];
      const member = currentTeam.members.find(m =>
        m.isActive &&
        m.name.toLowerCase() === mentionText.substring(1).toLowerCase()
      );

      segments.push({
        type: 'mention',
        content: mentionText,
        member
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    return segments;
  };


  // Handle input changes
  const handleInputChange = () => {
    if (!inputRef.current) return;

    const text = inputRef.current.textContent || '';
    setInputValue(text);

    // Get cursor position
    const selection = window.getSelection();
    let cursorPos = 0;
    if (selection && selection.rangeCount > 0) {
      const preCaretRange = selection.getRangeAt(0).cloneRange();
      preCaretRange.selectNodeContents(inputRef.current);
      preCaretRange.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
      cursorPos = preCaretRange.toString().length;
    }

    // Check for @ mentions
    const textBeforeCursor = text.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && atIndex === textBeforeCursor.length - 1) {
      // @ is at the cursor, show all team members
      setMentionSuggestions(currentTeam.members.filter(m => m.isActive));
      setShowMentions(true);
    } else if (atIndex !== -1) {
      // There's text after @, filter suggestions
      const query = textBeforeCursor.substring(atIndex + 1);
      if (query.length > 0) {
        const filtered = currentTeam.members.filter(m =>
          m.isActive &&
          (m.name.toLowerCase().includes(query.toLowerCase()) ||
           m.role.toLowerCase().includes(query.toLowerCase()))
        );
        setMentionSuggestions(filtered);
        setShowMentions(filtered.length > 0);
      } else {
        setMentionSuggestions(currentTeam.members.filter(m => m.isActive));
        setShowMentions(true);
      }
    } else {
      setShowMentions(false);
      setMentionSuggestions([]);
    }
  };

  const handleMentionSelect = (member: TeamMember) => {
    if (!inputRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const text = inputRef.current.textContent || '';

    // Find the @ that triggered the mention
    const cursorPos = getCursorPosition(inputRef.current);
    const textBeforeCursor = text.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      // Remove any partial mention text after @
      const beforeAt = text.substring(0, atIndex);
      const afterAt = text.substring(atIndex);
      const spaceAfterAt = afterAt.indexOf(' ');
      const endOfMention = spaceAfterAt === -1 ? afterAt.length : spaceAfterAt;
      const afterMention = text.substring(atIndex + endOfMention);

      const newText = beforeAt + '@' + member.name + ' ' + afterMention;

      // Update the content
      inputRef.current.textContent = newText;

      // Render mentions and update input value
      renderMentions();
      handleInputChange(); // Update input value after rendering

      setShowMentions(false);
      setMentionSuggestions([]);

      // Focus and set cursor position after the mention
      setTimeout(() => {
        inputRef.current?.focus();
        setCursorPositionInElement(inputRef.current!, beforeAt.length + member.name.length + 2);
      }, 0);
    }
  };

  // Get cursor position in contentEditable
  const getCursorPosition = (element: HTMLElement): number => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  };

  // Set cursor position in contentEditable
  const setCursorPositionInElement = (element: HTMLElement, position: number) => {
    const selection = window.getSelection();
    const range = document.createRange();

    let charIndex = 0;
    const nodes = element.childNodes;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        const textLength = node.textContent?.length || 0;
        if (charIndex + textLength >= position) {
          range.setStart(node, Math.min(position - charIndex, textLength));
          range.setEnd(node, Math.min(position - charIndex, textLength));
          selection?.removeAllRanges();
          selection?.addRange(range);
          return;
        }
        charIndex += textLength;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // For mention chips, count as their text length
        const textLength = node.textContent?.length || 0;
        if (charIndex + textLength >= position) {
          // Place cursor in the zero-width space after the mention
          const nextNode = node.nextSibling;
          if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
            range.setStart(nextNode, 0);
            range.setEnd(nextNode, 0);
          } else {
            range.setStartAfter(node);
            range.setEndAfter(node);
          }
          selection?.removeAllRanges();
          selection?.addRange(range);
          return;
        }
        charIndex += textLength;
      }
    }

    // If we didn't find the position, place at the end
    const lastNode = element.lastChild;
    if (lastNode) {
      if (lastNode.nodeType === Node.TEXT_NODE) {
        range.setStart(lastNode, lastNode.textContent?.length || 0);
        range.setEnd(lastNode, lastNode.textContent?.length || 0);
      } else {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
      }
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  // Render mentions in the contentEditable div
  const renderMentions = () => {
    if (!inputRef.current) return;

    const text = inputRef.current.textContent || '';
    if (text.trim() === '' || text === '\u00A0') return; // Don't render if empty

    const segments = parseTextWithMentions(text);

    // Check if we need to render mentions (only when exact member match)
    const hasMentions = segments.some(s => (s as any).type === 'mention' && (s as any).member);
    if (!hasMentions) return; // No mentions to render

    // Temporarily store cursor position
    const selection = window.getSelection();
    const cursorPos = selection ? getCursorPosition(inputRef.current) : 0;

    // Build everything in a fragment first to avoid text direction issues
    const fragment = document.createDocumentFragment();
    
    let lastWasMention = false;
    segments.forEach(segment => {
      const seg: any = segment as any;
      if (segment.type === 'mention' && seg.member) {
        const mentionSpan = document.createElement('span');
        mentionSpan.className = 'mention-chip';
        mentionSpan.textContent = segment.content;
        mentionSpan.contentEditable = 'false';
        mentionSpan.setAttribute('data-mention', 'true');
        mentionSpan.setAttribute('dir', 'ltr'); // Force LTR for mention
        fragment.appendChild(mentionSpan);
        
        // Add LRM + zero-width space after mention to keep LTR flow
        const spacer = document.createTextNode('\u200E\u200B');
        fragment.appendChild(spacer);
        lastWasMention = true;
      } else {
        if (lastWasMention && segment.content.length > 0) {
          // Wrap immediate post-mention text to enforce LTR in a fresh bidi context
          const guard = document.createElement('span');
          guard.className = 'ltr-guard';
          guard.setAttribute('dir', 'ltr');
          guard.appendChild(document.createTextNode(segment.content));
          fragment.appendChild(guard);
        } else {
          const textNode = document.createTextNode(segment.content);
          fragment.appendChild(textNode);
        }
        lastWasMention = false;
      }
    });

    // Clear and append all at once
    inputRef.current.innerHTML = '';
    inputRef.current.appendChild(fragment);

    // Restore cursor position
    setTimeout(() => {
      if (cursorPos > 0) {
        setCursorPositionInElement(inputRef.current!, cursorPos);
      }
    }, 0);
  };

  // Handle keydown for special mention deletion
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab selects first suggestion when mention dropdown is open
    if (e.key === 'Tab' && showMentions && mentionSuggestions.length > 0) {
      e.preventDefault();
      handleMentionSelect(mentionSuggestions[0]);
      return;
    }

    if (e.key === 'Backspace' && inputRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Check if we're at the start of a mention chip
        if (range.startOffset === 0 && range.startContainer.previousSibling) {
          const prevSibling = range.startContainer.previousSibling;
          if (prevSibling.nodeType === Node.ELEMENT_NODE &&
              (prevSibling as Element).classList.contains('mention-chip')) {
            e.preventDefault();
            prevSibling.remove(); // Delete the entire mention
            setShowMentions(false);
            setMentionSuggestions([]);
            handleInputChange(); // Update the input value
            return;
          }
        }

        // Check if we're inside or at the end of a mention chip
        if (range.startContainer.parentElement?.classList.contains('mention-chip')) {
          e.preventDefault();
          const mentionElement = range.startContainer.parentElement;
          // Move cursor before the mention and delete it
          const rangeBefore = document.createRange();
          rangeBefore.setStartBefore(mentionElement);
          rangeBefore.setEndBefore(mentionElement);
          selection.removeAllRanges();
          selection.addRange(rangeBefore);
          mentionElement.remove();
          setShowMentions(false);
          setMentionSuggestions([]);
          handleInputChange(); // Update the input value
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
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

  // Handle clicking outside to close mention dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMentions && !(event.target as Element).closest('.input-container')) {
        setShowMentions(false);
        setMentionSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMentions]);

  // Render mentions when input changes
  useEffect(() => {
    renderMentions();
  }, [inputValue]);

  // Initialize input
  useEffect(() => {
    if (inputRef.current && inputRef.current.textContent === '') {
      inputRef.current.textContent = '\u00A0'; // Non-breaking space to maintain height
    }
  }, []);

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
    let userInput = inputValue.trim();

    // Remove invisible bidi/formatting characters to avoid backend confusion
    const sanitize = (s: string) => s.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B]/g, '');
    userInput = sanitize(userInput);

    // Preprocess @ mentions for AI processing (convert @Member Name to @member-id)
    const mentionRegex = /(@\w+(?:\s+\w+)*)/g;
    userInput = userInput.replace(mentionRegex, (match, name) => {
      // Find the member by name (case insensitive)
      const member = currentTeam.members.find(m =>
        m.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(m.name.toLowerCase())
      );
      if (member) {
        return `@${member.id}`; // Use member ID instead of name for backend processing
      }
      return match; // Keep original if no match found
    });

    // Clear input
    if (inputRef.current) {
      inputRef.current.textContent = '\u00A0';
    setInputValue('');
    }
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

    // Clear input visually
    if (inputRef.current) {
      inputRef.current.textContent = '\u00A0';
    }
    setInputValue('');

    // Preprocess @ mentions in quick actions
    let processedQuery = query;
    const mentionRegex = /(@\w+(?:\s+\w+)*)/g;
    processedQuery = processedQuery.replace(mentionRegex, (match, name) => {
      // Find the member by name (case insensitive)
      const member = currentTeam.members.find(m =>
        m.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(m.name.toLowerCase())
      );
      if (member) {
        return `@${member.id}`; // Use member ID instead of name for backend processing
      }
      return match; // Keep original if no match found
    });

    try {
      const conversationHistory = getConversationHistory();
      const aiResponse: AIResponse = await invoke<AIResponse>('ai_chat', {
        message: processedQuery,
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


  // Component renderer - renders UI components based on tool calls
  const renderToolComponent = (tool: ToolCall) => {
    switch (tool.name) {
      case 'show_team_overview': {
        const teamSummary = tool.arguments?.team_summary;
        if (!teamSummary) {
          return <div className="component-loading">Team data not available</div>;
        }

        return (
          <div className="ai-component team-overview">
            <h4>Team Overview - {currentTeam.name}</h4>
            <div className="team-stats-grid">
              <div className="team-stat-card">
                <div className="team-stat-icon">👥</div>
                <div className="team-stat-info">
                  <div className="team-stat-value">{teamSummary.active_members}/{teamSummary.total_members}</div>
                  <div className="team-stat-label">Active Members</div>
                </div>
              </div>
              <div className="team-stat-card">
                <div className="team-stat-icon">⏱️</div>
                <div className="team-stat-info">
                  <div className="team-stat-value">{teamSummary.total_team_hours_today.toFixed(1)}h</div>
                  <div className="team-stat-label">Team Hours Today</div>
                </div>
              </div>
              <div className="team-stat-card">
                <div className="team-stat-icon">📈</div>
                <div className="team-stat-info">
                  <div className="team-stat-value">{teamSummary.average_hours_today.toFixed(1)}h</div>
                  <div className="team-stat-label">Avg Hours Today</div>
                </div>
              </div>
              <div className="team-stat-card">
                <div className="team-stat-icon">🏆</div>
                <div className="team-stat-info">
                  <div className="team-stat-value">{teamSummary.top_performers[0]?.hours.toFixed(1)}h</div>
                  <div className="team-stat-label">Top Performer</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'show_member_performance': {
        const memberInsights = tool.arguments?.member_insights;

        if (!memberInsights) {
          return <div className="component-loading">Member data not available</div>;
        }

        return (
          <div className="ai-component member-performance">
            <h4>{memberInsights.member_name}'s Performance</h4>
            <div className="member-stats-grid">
              <div className="member-stat-card">
                <div className="member-stat-label">Today</div>
                <div className="member-stat-value">{memberInsights.total_time_today.toFixed(1)}h</div>
              </div>
              <div className="member-stat-card">
                <div className="member-stat-label">This Week</div>
                <div className="member-stat-value">{memberInsights.total_time_this_week.toFixed(1)}h</div>
              </div>
              <div className="member-stat-card">
                <div className="member-stat-label">Tasks Done</div>
                <div className="member-stat-value">{memberInsights.task_stats.done}</div>
              </div>
              <div className="member-stat-card">
                <div className="member-stat-label">Completion Rate</div>
                <div className="member-stat-value">{memberInsights.task_stats.completion_rate.toFixed(0)}%</div>
              </div>
            </div>
            {memberInsights.most_used_apps.length > 0 && (
              <div className="member-apps-section">
                <h5>Top Apps</h5>
                <div className="member-apps-list">
                  {memberInsights.most_used_apps.slice(0, 3).map((app: AppUsage, idx: number) => (
                    <div key={idx} className="member-app-item">
                      <span className="app-name">{app.app_name}</span>
                      <span className="app-hours">{app.hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'show_team_member_comparison': {
        const teamMembers = tool.arguments?.team_members || [];
        if (teamMembers.length === 0) {
          return <div className="component-loading">Team member data not available</div>;
        }

        return (
          <div className="ai-component team-comparison">
            <h4>Team Member Comparison</h4>
            <div className="comparison-list">
              {teamMembers
                .sort((a: TeamMemberInsights, b: TeamMemberInsights) => b.total_time_today - a.total_time_today)
                .map((member: TeamMemberInsights, idx: number) => (
                <div key={member.member_id} className="comparison-item">
                  <div className="member-rank">#{idx + 1}</div>
                  <div className="member-info">
                    <div className="member-name">{member.member_name}</div>
                    <div className="member-role">{currentTeam.members.find((m: TeamMember) => m.id === member.member_id)?.role}</div>
                  </div>
                  <div className="member-hours">{member.total_time_today.toFixed(1)}h</div>
                  <div className="member-bar">
                    <div
                      className="member-bar-fill"
                      style={{
                        width: `${(member.total_time_today / Math.max(...teamMembers.map((m: TeamMemberInsights) => m.total_time_today))) * 100}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'show_team_insights': {
        const insights_data = tool.arguments?.insights || [];

        return (
          <div className="ai-component team-insights">
            <h4>Team Insights & Recommendations</h4>
            <div className="insights-list">
              {insights_data.length > 0 ? insights_data.map((insight: { title: string; description: string; type: string }, idx: number) => (
                <div key={idx} className="insight-item">
                  <div className="insight-icon">
                    {insight.type === 'info' ? '📊' : insight.type === 'tip' ? '💡' : '🏆'}
                  </div>
                  <div className="insight-content">
                    <h5>{insight.title}</h5>
                    <p>{insight.description}</p>
                  </div>
                </div>
              )) : (
                <>
                  <div className="insight-item">
                    <div className="insight-icon">📊</div>
                    <div className="insight-content">
                      <h5>Productivity Distribution</h5>
                      <p>Your team shows good productivity distribution with Sarah leading development tasks.</p>
                    </div>
                  </div>
                  <div className="insight-item">
                    <div className="insight-icon">🎯</div>
                    <div className="insight-content">
                      <h5>Focus Areas</h5>
                      <p>Consider increasing collaboration time - team members are spending significant individual time.</p>
                    </div>
                  </div>
                  <div className="insight-item">
                    <div className="insight-icon">⚡</div>
                    <div className="insight-content">
                      <h5>Peak Performance</h5>
                      <p>Morning hours (9-11 AM) show highest productivity across the team.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }

      case 'show_app_usage_breakdown': {
        const period = tool.arguments?.period || 'week';
        const chartType = tool.arguments?.chartType || 'bar';
        const userData = tool.arguments?.insights || insights;
        const apps = userData.most_used_apps || [];
        
        return (
          <div className="ai-component app-usage-breakdown">
            <h4>App Usage Breakdown ({period})</h4>
            {chartType === 'pie' ? (
              <div className="simple-pie-chart">
                {apps.map((app: AppUsage, idx: number) => (
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
                {apps.map((app: AppUsage, idx: number) => (
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
        const userData = tool.arguments?.insights || insights;

        return (
          <div className="ai-component time-stats">
            <h4>Time Tracking</h4>
            <div className="stat-card-large">
              <div className="stat-value">{userData.total_time_today.toFixed(1)}</div>
              <div className="stat-label">Hours Today</div>
            </div>
            <div className="stats-breakdown">
              <div className="stat-item">
                <span className="stat-label-small">This Week</span>
                <span className="stat-value-small">{userData.total_time_this_week.toFixed(1)}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label-small">This Month</span>
                <span className="stat-value-small">{userData.total_time_this_month.toFixed(1)}h</span>
              </div>
            </div>
          </div>
        );
      }
      
      case 'show_task_status': {
        const userData = tool.arguments?.insights || insights;
        const stats = userData.task_stats;
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
        const userData = tool.arguments?.insights || insights;
        const peakHours = userData.productivity_trend.peak_hours || [];
        return (
          <div className="ai-component peak-hours">
            <h4>Peak Productivity Hours</h4>
            <div className="peak-hours-list">
              {peakHours.map((hour: number, idx: number) => (
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
        const userData = tool.arguments?.insights || insights;

        return (
          <div className="ai-component stats-summary">
            <h4>Productivity Overview</h4>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-info">
                  <div className="stat-value">{userData.total_time_today.toFixed(1)}h</div>
                  <div className="stat-label">Today</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <div className="stat-value">{userData.total_time_this_week.toFixed(1)}h</div>
                  <div className="stat-label">This Week</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <div className="stat-value">{userData.task_stats.completion_rate.toFixed(0)}%</div>
                  <div className="stat-label">Tasks Done</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📱</div>
                <div className="stat-info">
                  <div className="stat-value">{userData.most_used_apps.length}</div>
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

  // Check if user is a manager - only managers can access AI assistant
  const isManager = currentUser.role === 'manager';

  if (!isManager) {
    return (
      <div className="ai-assistant-container">
        <Sidebar
          currentPage="ai-assistant"
          onLogout={onLogout}
          onPageChange={onPageChange}
        />

        <div className="main-content">
          <div className="ai-assistant-page-container">
            <div className="access-denied-container">
              <div className="access-denied-content">
                <h1>Access Restricted</h1>
                <p>The AI Assistant is only available to team managers.</p>
                <p>Contact your team manager to request access.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <div>
              <h1>Insights</h1>
              <div className="team-subtitle">{currentTeam.name}</div>
            </div>
            <div className="status-indicator">
              <div className="status-dot"></div>
              Online
            </div>
          </div>

          <div className={`chat-container ${hasStartedConversation ? 'has-started' : ''}`}>
            {/* Welcome Screen - Show when conversation hasn't started */}
            {!hasStartedConversation ? (
              <>
                <div className="welcome-screen">
                  <div className="welcome-content">
                    <h2>Team Management Assistant</h2>
                    <p>Ask me about your team's performance, individual member progress, or get insights to help manage your {currentTeam.name}. Use @ to mention team members in your questions.</p>
                  </div>
                </div>
              </>
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
                 <div
                   ref={inputRef}
                   contentEditable
                   dir="ltr"
                   onInput={handleInputChange}
                   onKeyDown={handleKeyDown}
                   className="message-input content-editable-input"
                   data-placeholder="Message AI Assistant... (use @ to mention team members)"
                   suppressContentEditableWarning={true}
                 />
                 <button 
                  className="send-button"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isTyping || isStreaming}
                 >
                  ↑
                 </button>
               </div>

               {/* Mention Autocomplete Dropdown */}
               {showMentions && mentionSuggestions.length > 0 && (
                 <div className="mention-dropdown">
                   {mentionSuggestions.map((member) => (
                     <div
                       key={member.id}
                       className="mention-item"
                       onClick={() => handleMentionSelect(member)}
                     >
                       <div className="mention-avatar">
                         {member.name.charAt(0).toUpperCase()}
                       </div>
                       <div className="mention-info">
                         <div className="mention-name">{member.name}</div>
                         <div className="mention-role">{member.role}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
               
               {/* Quick Actions below input - Show when conversation hasn't started */}
               {!hasStartedConversation && (
                 <div className="quick-actions-container bottom-actions">
                   <div className="quick-actions-buttons">
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("Show me the team overview")}
                       disabled={isTyping || isStreaming}
                     >
                       Team Overview
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("How is @Sarah Developer doing this week?")}
                       disabled={isTyping || isStreaming}
                     >
                       Member Progress
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("Compare team member performance")}
                       disabled={isTyping || isStreaming}
                     >
                       Team Comparison
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("How's the team progress overall this week?")}
                       disabled={isTyping || isStreaming}
                     >
                       Team Progress
                     </button>
                     <button 
                       className="quick-action-btn"
                       onClick={() => handleQuickAction("Show me team insights")}
                       disabled={isTyping || isStreaming}
                     >
                       Team Insights
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
