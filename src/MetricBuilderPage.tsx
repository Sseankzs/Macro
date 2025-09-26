import React, { useState, useRef, useEffect } from 'react';
import './MetricBuilderPage.css';
import Sidebar from './Sidebar';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  timestamp: Date;
}

interface Metric {
  id: string;
  name: string;
  goal: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  apps: string[];
  trend: number[];
  color: string;
}

interface MetricBuilderPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected') => void;
}

function MetricBuilderPage({ onLogout, onPageChange }: MetricBuilderPageProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "Hi! I'm your AI assistant. What would you like to track?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStep, setCurrentStep] = useState<'tracking' | 'apps' | 'goal' | 'complete'>('tracking');
  const [metricData, setMetricData] = useState({
    tracking: '',
    apps: [] as string[],
    goal: '',
    unit: 'hours'
  });
  const [metrics, setMetrics] = useState<Metric[]>([
    {
      id: '1',
      name: 'Coding Hours',
      goal: '20h/week',
      currentValue: 15.5,
      targetValue: 20,
      unit: 'hours',
      apps: ['VS Code', 'IntelliJ'],
      trend: [12, 14, 16, 15, 15.5],
      color: '#007aff'
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate bot response delay
    setTimeout(() => {
      const botResponse = generateBotResponse(inputValue.trim());
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: botResponse.content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);

      if (botResponse.nextStep) {
        setCurrentStep(botResponse.nextStep);
      }

      if (botResponse.metricData) {
        setMetricData(prev => ({ ...prev, ...botResponse.metricData }));
      }

      if (botResponse.createMetric) {
        createMetric();
      }
    }, 1500);
  };

  const generateBotResponse = (userInput: string) => {
    const input = userInput.toLowerCase();

    switch (currentStep) {
      case 'tracking':
        if (input.includes('time') || input.includes('hours') || input.includes('coding') || input.includes('development')) {
          return {
            content: "Great! I'll help you track your coding time. Which apps should I include in this metric?",
            nextStep: 'apps' as const,
            metricData: { tracking: userInput }
          };
        }
        return {
          content: "I can help you track various metrics like time spent, productivity, or app usage. What specifically would you like to track?"
        };

      case 'apps':
        const apps = extractAppsFromInput(userInput);
        if (apps.length > 0) {
          return {
            content: `Perfect! I'll track ${apps.join(', ')}. Do you want to set a goal for this metric? (e.g., "20 hours per week")`,
            nextStep: 'goal' as const,
            metricData: { apps }
          };
        }
        return {
          content: "Please specify which apps you'd like to include. For example: 'VS Code, IntelliJ, Terminal'"
        };

      case 'goal':
        if (input.includes('yes') || input.includes('goal') || /\d+/.test(input)) {
          const goal = extractGoalFromInput(userInput);
          return {
            content: `Excellent! I've created your metric: "${metricData.tracking}" tracking ${metricData.apps.join(', ')} with a goal of ${goal}. Your metric card is now ready!`,
            nextStep: 'complete' as const,
            metricData: { goal },
            createMetric: true
          };
        }
        return {
          content: "Would you like to set a goal? You can say something like '20 hours per week' or 'no goal'."
        };

      default:
        return {
          content: "I'm here to help you create custom metrics. What would you like to track?"
        };
    }
  };

  const extractAppsFromInput = (input: string): string[] => {
    const commonApps = ['VS Code', 'IntelliJ', 'Terminal', 'Chrome', 'Slack', 'Figma', 'Xcode', 'Sublime', 'Atom', 'WebStorm'];
    const foundApps: string[] = [];
    
    commonApps.forEach(app => {
      if (input.toLowerCase().includes(app.toLowerCase())) {
        foundApps.push(app);
      }
    });

    // If no common apps found, try to extract from the input
    if (foundApps.length === 0) {
      const words = input.split(/[,\s]+/).filter(word => word.length > 2);
      foundApps.push(...words.slice(0, 3)); // Take first 3 words as app names
    }

    return foundApps;
  };

  const extractGoalFromInput = (input: string): string => {
    const match = input.match(/(\d+)\s*(hours?|h|hrs?)/i);
    if (match) {
      return `${match[1]}h/week`;
    }
    return input.includes('no') ? 'No goal' : 'Custom goal';
  };

  const createMetric = () => {
    const newMetric: Metric = {
      id: Date.now().toString(),
      name: metricData.tracking,
      goal: metricData.goal,
      currentValue: Math.random() * 20,
      targetValue: parseInt(metricData.goal) || 20,
      unit: 'hours',
      apps: metricData.apps,
      trend: Array.from({ length: 5 }, () => Math.random() * 20),
      color: `hsl(${Math.random() * 360}, 70%, 50%)`
    };

    setMetrics(prev => [...prev, newMetric]);
  };

  const MessageBubble = ({ message }: { message: Message }) => (
    <div className={`message-bubble ${message.type}`}>
      <div className="message-content">
        {message.content}
      </div>
      <div className="message-time">
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );

  const MetricCard = ({ metric }: { metric: Metric }) => {
    const progress = (metric.currentValue / metric.targetValue) * 100;
    
    return (
      <div className="metric-card">
        <div className="metric-header">
          <h3 className="metric-name">{metric.name}</h3>
          <span className="metric-goal">Goal: {metric.goal}</span>
        </div>
        
        <div className="metric-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${Math.min(progress, 100)}%`,
                backgroundColor: metric.color
              }}
            ></div>
          </div>
          <div className="progress-text">
            {metric.currentValue.toFixed(1)} / {metric.targetValue} {metric.unit}
          </div>
        </div>
        
        <div className="metric-trend">
          <div className="trend-chart">
            {metric.trend.map((value, index) => (
              <div 
                key={index}
                className="trend-bar"
                style={{ 
                  height: `${(value / Math.max(...metric.trend)) * 100}%`,
                  backgroundColor: metric.color
                }}
              ></div>
            ))}
          </div>
          <div className="trend-label">Last 5 days</div>
        </div>
        
        <div className="metric-apps">
          <span className="apps-label">Tracking:</span>
          <div className="apps-list">
            {metric.apps.map((app, index) => (
              <span key={index} className="app-tag">{app}</span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="metric-builder" 
        onLogout={onLogout} 
        onPageChange={onPageChange || (() => {})} 
      />
      
      <div className="main-content">
        <header className="main-header">
          <div className="header-info">
            <h1>Metric Builder</h1>
            <p className="header-subtitle">
              Chat with AI to create custom metrics and track your productivity goals.
            </p>
          </div>
        </header>
        
        <div className="content-area">
          <div className="metric-builder-container">
            <div className="chat-section">
              <div className="chat-header">
                <div className="bot-avatar">🤖</div>
                <div className="bot-info">
                  <h3>AI Assistant</h3>
                  <span className="bot-status">Online</span>
                </div>
              </div>
              
              <div className="messages-container">
                {messages.map(message => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {isTyping && (
                  <div className="message-bubble bot typing">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              <form onSubmit={handleSendMessage} className="chat-input-form">
                <div className="input-container">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type your message..."
                    className="chat-input"
                    disabled={isTyping}
                  />
                  <button 
                    type="submit" 
                    className="send-button"
                    disabled={isTyping || !inputValue.trim()}
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
            
            <div className="metrics-section">
              <h2>Your Metrics</h2>
              <div className="metrics-grid">
                {metrics.map(metric => (
                  <MetricCard key={metric.id} metric={metric} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MetricBuilderPage;
