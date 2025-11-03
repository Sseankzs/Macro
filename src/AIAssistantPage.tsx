import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AIAssistantPage.css';
import Sidebar from './Sidebar';
import { useCurrentUser } from './contexts/CurrentUserContext';

interface WorkspaceMemberRow {
  id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  role?: string | null;
  joined_at?: string | null;
}

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
  member_id: string; // users.id
  member_name: string; // users.name
  member_email?: string; // users.email
  member_image_url?: string; // users.image_url
  workspace_role?: string; // workspace_members.role
  joined_at?: string; // workspace_members.joined_at
  
  // Time tracking data from time_entries
  total_time_today: number; // sum of duration_seconds for today
  total_time_this_week: number; // sum of duration_seconds for this week
  total_time_this_month: number; // sum of duration_seconds for this month
  
  // Application usage from time_entries + applications
  most_used_apps: Array<{
    app_id: string; // applications.id
    app_name: string; // applications.name
    process_name: string; // applications.process_name
    category?: string; // applications.category
    total_duration_seconds: number; // sum from time_entries
    hours: number; // calculated from duration_seconds
    percentage: number; // percentage of total time
    last_used?: string; // applications.last_used
  }>;
  
  // Current activity from active time_entries
  current_activity?: {
    time_entry_id: string; // time_entries.id
    app_id?: string; // time_entries.app_id
    app_name?: string; // applications.name
    task_id?: string; // time_entries.task_id
    task_title?: string; // tasks.title
    start_time: string; // time_entries.start_time
    duration_seconds: number; // calculated from start_time to now
    is_active: boolean; // time_entries.is_active
  };
  
  // Task statistics from tasks table
  task_stats: {
    total: number; // count of all tasks for user
    todo: number; // count where status = 'todo'
    in_progress: number; // count where status = 'in_progress'
    done: number; // count where status = 'done'
    completion_rate: number; // done / total * 100
    overdue_tasks: number; // count where due_date < now() and status != 'done'
    high_priority_tasks: number; // count where priority = 'high'
    assigned_by_others: number; // count where created_by != user_id
  };
  
  // Productivity trend from time_entries aggregation
  productivity_trend: {
    daily_hours: Array<{
      date: string; // date from time_entries.start_time
      hours: number; // sum of duration_seconds for that date
      active_time_entries: number; // count of entries for that date
    }>;
    peak_hours: number[]; // hours of day with highest activity (0-23)
    most_productive_day: string; // day of week with highest activity
  };
}

type AppUsage = {
  app_id: string; // applications.id
  app_name: string; // applications.name
  process_name: string; // applications.process_name
  category?: string; // applications.category
  total_duration_seconds: number; // sum from time_entries
  hours: number; // calculated from duration_seconds
  percentage: number; // percentage of total user time
  last_used?: string; // applications.last_used
  is_tracked: boolean; // applications.is_tracked
};

interface WorkspaceData {
  workspace_id: string; // workspaces.id
  workspace_name: string; // workspaces.name
  workspace_description?: string; // workspaces.description
  created_by: string; // workspaces.created_by
  created_at: string; // workspaces.created_at
  member_count: number; // count from workspace_members
  owner_name?: string; // users.name where users.id = workspaces.created_by
}

interface TaskData {
  task_id: string; // tasks.id
  title: string; // tasks.title
  description?: string; // tasks.description
  status: 'todo' | 'in_progress' | 'done'; // tasks.status (USER-DEFINED enum)
  priority?: 'low' | 'medium' | 'high'; // tasks.priority (USER-DEFINED enum)
  due_date?: string; // tasks.due_date
  created_at: string; // tasks.created_at
  updated_at: string; // tasks.updated_at
  created_by?: string; // tasks.created_by
  workspace_id?: string; // tasks.workspace_id
  assigned_to: string[]; // tasks.assigned_to (uuid array)
  assignee_names?: string[]; // resolved names from users table
  time_spent_seconds?: number; // sum from time_entries where task_id matches
}

// Enhanced ProductivityInsights interface based on actual database schema
// This represents the target structure when real database integration is implemented
// Currently, the backend uses simplified mock data (see BackendProductivityInsights below)
interface ProductivityInsights {
  // User information
  user_id: string; // users.id
  user_name: string; // users.name
  user_email?: string; // users.email
  user_image_url?: string; // users.image_url
  
  // Workspace context
  current_workspace?: WorkspaceData;
  user_workspaces: WorkspaceData[]; // all workspaces user is member of
  
  // Individual time tracking insights
  total_time_today: number; // sum of duration_seconds from time_entries for today
  total_time_this_week: number; // sum for this week
  total_time_this_month: number; // sum for this month
  total_time_all_time: number; // sum of all time_entries for user
  
  // Application usage analysis
  most_used_apps: Array<AppUsage>; // aggregated from time_entries + applications
  app_categories: Array<{
    category: string; // applications.category
    total_hours: number;
    app_count: number;
    percentage: number;
  }>;
  
  // Current activity tracking
  current_activity?: {
    time_entry_id: string; // time_entries.id
    app_id?: string; // time_entries.app_id
    app_name?: string; // applications.name
    task_id?: string; // time_entries.task_id
    task_title?: string; // tasks.title
    start_time: string; // time_entries.start_time
    duration_seconds: number; // calculated duration
    is_active: boolean; // time_entries.is_active
  };
  
  // Task management insights
  task_stats: {
    total: number; // count of tasks assigned to user
    todo: number; // status = 'todo'
    in_progress: number; // status = 'in_progress'
    done: number; // status = 'done'
    completion_rate: number; // done / total * 100
    overdue_tasks: number; // due_date < now() and status != 'done'
    high_priority_tasks: number; // priority = 'high'
    created_by_user: number; // tasks where created_by = user_id
    assigned_by_others: number; // tasks where created_by != user_id
  };
  
  // Recent tasks with time tracking
  recent_tasks: TaskData[];
  active_tasks: TaskData[]; // tasks with status = 'in_progress'
  
  // Productivity patterns
  productivity_trend: {
    daily_hours: Array<{
      date: string; // aggregated by date from time_entries
      hours: number; // total hours for that date
      task_completions: number; // tasks completed that date
      app_switches: number; // distinct apps used that date
    }>;
    weekly_pattern: Array<{
      day_of_week: string; // Monday, Tuesday, etc.
      average_hours: number;
      average_productivity_score: number;
    }>;
    peak_hours: number[]; // hours (0-23) with highest activity
    most_productive_day: string;
    focus_score: number; // calculated metric based on app switching frequency
  };

  // Team insights (for owners only - from workspace_members with role = 'owner')
  team_members?: TeamMemberInsights[]; // all members in user's workspaces
  team_summary?: {
    workspace_id: string;
    workspace_name: string;
    total_members: number; // count from workspace_members
    active_members: number; // members with recent time_entries
    average_hours_today: number; // avg duration_seconds for today
    average_hours_this_week: number; // avg for this week
    total_team_hours_today: number; // sum for all members today
    total_team_hours_this_week: number; // sum for all members this week
    top_performers: Array<{
      member_id: string; // users.id
      member_name: string; // users.name
      role: string; // workspace_members.role
      hours: number; // total hours for time period
      task_completions: number; // completed tasks count
      productivity_score: number; // calculated metric
    }>;
    team_app_usage: Array<{
      app_name: string; // applications.name
      category: string; // applications.category
      total_team_hours: number;
      member_count: number; // how many team members use this app
    }>;
    workspace_tasks: {
      total: number; // all tasks in workspace
      active: number; // in_progress status
      completed_this_week: number;
      overdue: number;
    };
  };
}

// Current backend interface (simplified structure used by mock data)
// This matches the actual Rust ProductivityInsights struct in ai_assistant.rs
// TODO: Replace with enhanced ProductivityInsights when real database integration is complete
interface BackendProductivityInsights {
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
  team_members?: Array<{
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
  }>;
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
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

// Mock team data - will be replaced with real backend data
interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  isActive: boolean;
  workspaceId?: string; // Added to filter by team/workspace
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  managerId: string; // Current user's ID if they are a manager
}

const AIAssistantPage: React.FC<AIAssistantPageProps> = ({ onLogout, onPageChange }) => {
  // Get current user from context
  const { currentUser } = useCurrentUser();
  
  // State for workspace members
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  
  // State for real team members (derived from workspace members + user data)
  const [realTeamMembers, setRealTeamMembers] = useState<TeamMember[]>([]);
  
  // State for team selection
  const [availableTeams, setAvailableTeams] = useState<Array<{id: string, team_name: string}>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  
  // Load workspace members on component mount
  useEffect(() => {
    const loadWorkspaceMembers = async () => {
      if (currentUser?.id && !membersLoaded) {
        try {
          const members = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
          setWorkspaceMembers(members || []);
          
          // Convert workspace members to team members with user details
          const teamMembers: TeamMember[] = [];
          
          for (const member of (members || [])) {
            if (member.user_id) {
              try {
                // Fetch user details for each member
                const user = await invoke('get_user', { userId: member.user_id }) as any;
                if (user) {
                  teamMembers.push({
                    id: member.user_id,
                    name: user.name || 'Unknown User',
                    role: member.role || 'member',
                    isActive: true, // Assume all workspace members are active
                    workspaceId: member.workspace_id || undefined // Store workspace ID for filtering
                  });
                }
              } catch (error) {
                console.warn(`Failed to load user details for ${member.user_id}:`, error);
                // Add member with minimal info if user fetch fails
                teamMembers.push({
                  id: member.user_id,
                  name: `User ${member.user_id?.substring(0, 8)}`,
                  role: member.role || 'member',
                  isActive: true,
                  workspaceId: member.workspace_id || undefined
                });
              }
            }
          }
          
          setRealTeamMembers(teamMembers);
          setMembersLoaded(true);
        } catch (error) {
          console.error('Failed to load workspace members:', error);
          setMembersLoaded(true); // Set as loaded to prevent retries
        }
      }
    };
    
    loadWorkspaceMembers();
  }, [currentUser?.id, membersLoaded]);

  // Load teams where user is an owner
  useEffect(() => {
    const loadUserTeams = async () => {
      if (currentUser?.id) {
        try {
          console.log('[Team Dropdown] Loading teams for user:', currentUser.id);
          
          // Get all workspaces user is a member of
          const userWorkspaces = await invoke('get_my_workspaces') as Array<{id: string, team_name: string}>;
          console.log('[Team Dropdown] User workspaces:', userWorkspaces);
          
          // Get workspace members to check roles
          const allMembers = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
          console.log('[Team Dropdown] All workspace members:', allMembers);
          
          // Filter for teams where user has owner role
          const ownerTeams = userWorkspaces.filter(workspace => {
            const membership = allMembers?.find(member => 
              member.workspace_id === workspace.id && 
              member.user_id === currentUser.id &&
              member.role?.toLowerCase() === 'owner'
            );
            console.log(`[Team Dropdown] Workspace ${workspace.team_name} (${workspace.id}):`, {
              membership,
              hasOwnerRole: !!membership
            });
            return !!membership;
          });
          
          console.log('[Team Dropdown] Owner teams found:', ownerTeams);
          
          // For debugging: if no owner teams found, show all teams with debug info
          if (ownerTeams.length === 0) {
            console.log('[Team Dropdown] No owner teams found, showing all user workspaces for debugging');
            setAvailableTeams(userWorkspaces.map(workspace => ({
              ...workspace,
              team_name: `${workspace.team_name} (Debug)`
            })));
          } else {
            setAvailableTeams(ownerTeams);
          }
          
          // Set the first team as selected if none is selected yet
          const teamsToUse = ownerTeams.length > 0 ? ownerTeams : userWorkspaces;
          if (teamsToUse.length > 0 && !selectedTeamId) {
            console.log('[Team Dropdown] Setting default team:', teamsToUse[0]);
            setSelectedTeamId(teamsToUse[0].id);
          }
        } catch (error) {
          console.error('[Team Dropdown] Failed to load user teams:', error);
        }
      }
    };
    
    loadUserTeams();
  }, [currentUser?.id, membersLoaded]);
  
  // Helper function to replace member IDs with names in text content
  const replaceMemberIdsInText = (text: string): string => {
    if (!text || realTeamMembers.length === 0) {
      return text;
    }

    let processedText = text;

    // Replace patterns like "member with ID `uuid`" or "team member with ID `uuid`"
    const memberIdPattern = /(?:team\s+)?member\s+with\s+ID\s+`([a-f0-9\-]{36})`/gi;
    processedText = processedText.replace(memberIdPattern, (match, memberId) => {
      const memberName = getMemberNameById(memberId);
      return memberName !== 'Unknown Member' ? `team member ${memberName}` : match;
    });

    // Replace patterns like "for member `uuid`" or "member `uuid`"
    const memberDirectPattern = /(?:for\s+)?member\s+`([a-f0-9\-]{36})`/gi;
    processedText = processedText.replace(memberDirectPattern, (match, memberId) => {
      const memberName = getMemberNameById(memberId);
      return memberName !== 'Unknown Member' ? 
        (match.startsWith('for') ? `for ${memberName}` : memberName) : 
        match;
    });

    // Replace standalone UUIDs in backticks
    const uuidPattern = /`([a-f0-9\-]{36})`/g;
    processedText = processedText.replace(uuidPattern, (match, memberId) => {
      const memberName = getMemberNameById(memberId);
      return memberName !== 'Unknown Member' ? `${memberName}` : match;
    });

    console.log('[replaceMemberIdsInText] Processed text:', { original: text, processed: processedText });
    return processedText;
  };

  // Helper function to get member name by ID from realTeamMembers
  const getMemberNameById = (memberId: string): string => {
    // If memberId is empty or null, return fallback
    if (!memberId) {
      console.log('[getMemberNameById] Empty memberId provided');
      return 'Unknown Member';
    }
    
    console.log('[getMemberNameById] Looking up member:', { 
      memberId, 
      totalMembers: realTeamMembers.length,
      memberNames: realTeamMembers.map(m => ({ id: m.id, name: m.name }))
    });
    
    // If it already looks like a proper name (not a UUID), return it
    if (memberId && !memberId.includes('-') && memberId.length < 30 && !memberId.startsWith('user-') && memberId !== 'Unknown Member') {
      console.log('[getMemberNameById] Using memberId as name (looks like proper name):', memberId);
      return memberId;
    }
    
    // Try to find the member in our loaded team members
    const member = realTeamMembers.find(m => m.id === memberId);
    if (member && member.name) {
      console.log('[getMemberNameById] Found member in realTeamMembers:', { id: member.id, name: member.name });
      return member.name;
    }
    
    // Fallback: try to clean up the member name if it looks like an ID
    if (memberId.length > 20 && memberId.includes('-')) {
      // Looks like a UUID, try to get a shorter representation
      const shortName = `User ${memberId.substring(0, 8)}`;
      console.log('[getMemberNameById] Using UUID fallback:', { original: memberId, shortened: shortName });
      return shortName;
    }
    
    // Last resort: return the ID as-is or Unknown Member
    console.log('[getMemberNameById] Using fallback for:', memberId);
    return memberId || 'Unknown Member';
  };

  // Helper function to get current team members based on selected team
  const getCurrentTeamMembers = (): TeamMember[] => {
    if (!selectedTeamId) {
      console.log('[Mentions] No team selected, returning all members:', realTeamMembers.length);
      return realTeamMembers; // If no team selected, return all members
    }
    
    // Filter members by selected team/workspace ID
    const filteredMembers = realTeamMembers.filter(member => 
      member.workspaceId === selectedTeamId
    );
    
    console.log(`[Mentions] Filtered members for team ${selectedTeamId}:`, {
      totalMembers: realTeamMembers.length,
      filteredMembers: filteredMembers.length,
      memberNames: filteredMembers.map(m => m.name)
    });
    
    return filteredMembers;
  };

  // Helper function to check if user has owner role in workspace_members
  const hasOwnerAccess = (): boolean => {
    if (!currentUser?.id || !membersLoaded) return false;
    
    // Check if any workspace_members row for this user has 'owner' role
    return workspaceMembers.some(member => 
      member.user_id === currentUser.id && 
      member.role?.toLowerCase() === 'owner'
    );
  };
  
  // Helper function to check team access for specific features
  const canAccessTeamData = (): boolean => {
    return hasOwnerAccess() && Boolean(currentUser?.team_id || currentUser?.workspace_id);
  };

  // Dynamic team data based on current user and selected team
  const [currentTeam, setCurrentTeam] = useState<Team>(() => {
    const teamId = currentUser?.team_id || currentUser?.workspace_id || 'team-1';
    const teamName = hasOwnerAccess() ? 
      `Loading Teams...` : 
      'Product Development Team';
    
    return {
      id: teamId,
      name: teamName,
      managerId: currentUser?.id || 'user-1',
      members: [] // Will be updated with real members when loaded
    };
  });

  // Update current team when selected team changes
  useEffect(() => {
    if (selectedTeamId && availableTeams.length > 0) {
      const selectedTeam = availableTeams.find(team => team.id === selectedTeamId);
      if (selectedTeam) {
        setCurrentTeam({
          id: selectedTeam.id,
          name: selectedTeam.team_name,
          managerId: currentUser?.id || 'user-1',
          members: realTeamMembers // Use current real team members
        });
      }
    }
  }, [selectedTeamId, availableTeams, currentUser?.id, realTeamMembers]);

  // Update team members when real data is loaded
  useEffect(() => {
    if (realTeamMembers.length > 0) {
      setCurrentTeam(prev => ({
        ...prev,
        members: realTeamMembers
      }));
    }
  }, [realTeamMembers]);

  // Function to handle team selection change
  const handleTeamChange = async (teamId: string) => {
    setSelectedTeamId(teamId);
    setShowTeamDropdown(false);
    
    // Clear all messages and reset conversation state
    setMessages([]);
    setHasStartedConversation(false);
    setIsTyping(false);
    setIsStreaming(false);
    setStreamingMessage('');
    
    // Clear input
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.textContent = '\u00A0';
    }
    
    // Hide mention suggestions
    setShowMentions(false);
    setMentionSuggestions([]);
    
    // Reload team members for the selected team
    try {
      const members = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
      const filteredMembers = (members || []).filter(member => member.workspace_id === teamId);
      
      // Convert workspace members to team members with user details
      const teamMembers: TeamMember[] = [];
      
      for (const member of filteredMembers) {
        if (member.user_id) {
          try {
            const user = await invoke('get_user', { userId: member.user_id }) as any;
            if (user) {
              teamMembers.push({
                id: member.user_id,
                name: user.name || 'Unknown User',
                role: member.role || 'member',
                isActive: true
              });
            }
          } catch (error) {
            console.warn(`Failed to load user details for ${member.user_id}:`, error);
            teamMembers.push({
              id: member.user_id,
              name: `User ${member.user_id?.substring(0, 8)}`,
              role: member.role || 'member',
              isActive: true
            });
          }
        }
      }
      
      setRealTeamMembers(teamMembers);
    } catch (error) {
      console.error('Failed to reload team members:', error);
    }
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);

  // Mention autocomplete state
  const [mentionSuggestions, setMentionSuggestions] = useState<TeamMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setShowTeamDropdown(false);
      }
    };

    if (showTeamDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTeamDropdown]);

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
      const currentTeamMembers = getCurrentTeamMembers();
      const member = currentTeamMembers.find(m =>
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
      // @ is at the cursor, show all team members from current team
      const currentTeamMembers = getCurrentTeamMembers();
      setMentionSuggestions(currentTeamMembers.filter(m => m.isActive));
      setShowMentions(true);
    } else if (atIndex !== -1) {
      // There's text after @, filter suggestions from current team
      const query = textBeforeCursor.substring(atIndex + 1);
      const currentTeamMembers = getCurrentTeamMembers();
      if (query.length > 0) {
        const filtered = currentTeamMembers.filter(m =>
          m.isActive &&
          (m.name.toLowerCase().includes(query.toLowerCase()) ||
           m.role.toLowerCase().includes(query.toLowerCase()))
        );
        setMentionSuggestions(filtered);
        setShowMentions(filtered.length > 0);
      } else {
        setMentionSuggestions(currentTeamMembers.filter(m => m.isActive));
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

  // Handle thinking state - disable input and animate thinking message
  const thinkingDotsRef = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    if (!inputRef.current) return;

    if (isTyping) {
      // Disable editing
      inputRef.current.contentEditable = 'false';
    } else {
      // Re-enable editing
      inputRef.current.contentEditable = 'true';
    }
  }, [isTyping]);

  // Animate thinking dots
  useEffect(() => {
    if (!isTyping || !thinkingDotsRef.current) return;

    let dotCount = 0;
    let isActive = true;
  let currentTimer: ReturnType<typeof setTimeout> | null = null;
    
    const updateDots = () => {
      if (!thinkingDotsRef.current || !isActive) return;
      const dots = '.'.repeat((dotCount % 3) + 1);
      thinkingDotsRef.current.textContent = dots;
      dotCount++;
      currentTimer = setTimeout(updateDots, 500);
    };
    
    updateDots();
    
    return () => {
      isActive = false;
      if (currentTimer) {
        clearTimeout(currentTimer);
      }
    };
  }, [isTyping]);

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
      const member = realTeamMembers.find(m =>
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
        conversationHistory: conversationHistory,
        workspaceId: selectedTeamId || null
      });
      
      setIsTyping(false);
      
      // If there are tools, don't stream - just show the message with components
      if (aiResponse.tools && aiResponse.tools.length > 0) {
        const processedContent = replaceMemberIdsInText(aiResponse.content || "Here's the information:");
        const message: Message = {
          id: (Date.now() + 1).toString(),
          content: processedContent,
          isUser: false,
          timestamp: new Date(),
          tools: aiResponse.tools
        };
        setMessages(prev => [...prev, message]);
      } else {
        // No tools, stream the text response
        setIsStreaming(true);
        setStreamingMessage('');
        
        const text = replaceMemberIdsInText(aiResponse.content || "");
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
      const member = realTeamMembers.find(m =>
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
        conversationHistory: conversationHistory,
        workspaceId: selectedTeamId || null
      });
      
      setIsTyping(false);
      
      // If there are tools, don't stream - just show the message with components
      if (aiResponse.tools && aiResponse.tools.length > 0) {
        const processedContent = replaceMemberIdsInText(aiResponse.content || "Here's the information:");
        const message: Message = {
          id: (Date.now() + 1).toString(),
          content: processedContent,
          isUser: false,
          timestamp: new Date(),
          tools: aiResponse.tools
        };
        setMessages(prev => [...prev, message]);
      } else {
        // No tools, stream the text response
        setIsStreaming(true);
        setStreamingMessage('');
        
        const text = replaceMemberIdsInText(aiResponse.content || "");
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
        // Check if user has access to team data
        if (!canAccessTeamData()) {
          return (
            <div className="ai-component access-denied">
              <h4>Team Overview</h4>
              <div className="access-message">
                <div className="access-icon">🔒</div>
                <p><strong>Access Restricted</strong></p>
                <p>You need owner permissions to view team overview data.</p>
                <small>Contact your workspace owner for access.</small>
              </div>
            </div>
          );
        }

        const teamSummary = tool.arguments?.team_summary;
        if (!teamSummary) {
          return <div className="component-loading">Team data not available</div>;
        }

        return (
          <div className="ai-component team-overview">
            <h4>Team Overview - {currentTeam.name}</h4>
            <div className="access-badge">
              <span className="role-badge">Owner Access</span>
            </div>
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
        // Check if user has access to team member data
        if (!canAccessTeamData()) {
          return (
            <div className="ai-component access-denied">
              <h4>Member Performance</h4>
              <div className="access-message">
                <div className="access-icon">🔒</div>
                <p><strong>Access Restricted</strong></p>
                <p>You need owner permissions to view team member performance data.</p>
                <small>This feature is available to workspace owners only.</small>
              </div>
            </div>
          );
        }

        const memberInsights = tool.arguments?.member_insights;

        if (!memberInsights) {
          return <div className="component-loading">Member data not available</div>;
        }

        return (
          <div className="ai-component member-performance">
            <h4>{getMemberNameById(memberInsights.member_id || memberInsights.member_name)}'s Performance</h4>
            <div className="access-badge">
              <span className="role-badge">Owner Access</span>
            </div>
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
        // Check if user has access to team comparison data
        if (!canAccessTeamData()) {
          return (
            <div className="ai-component access-denied">
              <h4>Team Member Comparison</h4>
              <div className="access-message">
                <div className="access-icon">🔒</div>
                <p><strong>Access Restricted</strong></p>
                <p>You need owner permissions to compare team member performance.</p>
                <small>This sensitive data is only available to workspace owners.</small>
              </div>
            </div>
          );
        }

        const teamMembers = tool.arguments?.team_members || [];
        if (teamMembers.length === 0) {
          return <div className="component-loading">Team member data not available</div>;
        }

        return (
          <div className="ai-component team-comparison">
            <h4>Team Member Comparison</h4>
            <div className="access-badge">
              <span className="role-badge">Owner Access</span>
            </div>
            <div className="comparison-list">
              {teamMembers
                .sort((a: TeamMemberInsights, b: TeamMemberInsights) => b.total_time_today - a.total_time_today)
                .map((member: TeamMemberInsights, idx: number) => (
                <div key={member.member_id} className="comparison-item">
                  <div className="member-rank">#{idx + 1}</div>
                  <div className="member-info">
                    <div className="member-name">{getMemberNameById(member.member_id || member.member_name)}</div>
                    <div className="member-role">{realTeamMembers.find((m: TeamMember) => m.id === member.member_id)?.role}</div>
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
        // Check if user has access to team insights
        if (!canAccessTeamData()) {
          return (
            <div className="ai-component access-denied">
              <h4>Team Insights & Recommendations</h4>
              <div className="access-message">
                <div className="access-icon">🔒</div>
                <p><strong>Access Restricted</strong></p>
                <p>You need owner permissions to view team insights and recommendations.</p>
                <small>Team insights contain sensitive performance data for owners only.</small>
              </div>
            </div>
          );
        }

        const insights_data = tool.arguments?.insights || [];

        return (
          <div className="ai-component team-insights">
            <h4>Team Insights & Recommendations</h4>
            <div className="access-badge">
              <span className="role-badge">Owner Access</span>
            </div>
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
                      <p>Your team shows good productivity distribution with consistent performance across members.</p>
                    </div>
                  </div>
                  <div className="insight-item">
                    <div className="insight-icon">🎯</div>
                    <div className="insight-content">
                      <h5>Focus Areas</h5>
                      <p>Consider increasing collaboration time - team members are working well individually.</p>
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
        const userData = tool.arguments?.insights;
        const apps = userData?.most_used_apps || [];
        
        // Handle empty data gracefully
        if (apps.length === 0) {
          return (
            <div className="ai-component app-usage-breakdown">
              <h4>App Usage Breakdown ({period})</h4>
              <div className="no-data-message">
                <div className="no-data-icon">📱</div>
                <p>No app usage data available for this {period}.</p>
                <small>Start tracking apps to see your usage breakdown.</small>
              </div>
            </div>
          );
        }
        
        return (
          <div className="ai-component app-usage-breakdown">
            <h4>App Usage Breakdown ({period})</h4>
            {chartType === 'pie' ? (
              <div className="simple-pie-chart">
                {apps.slice(0, 8).map((app: AppUsage, idx: number) => (
                  <div key={idx} className="app-item" style={{ 
                    width: `${Math.max(app.percentage, 5)}%`,
                    backgroundColor: `hsl(${idx * 45}, 70%, 60%)`
                  }}>
                    <span>{app.app_name}: {app.hours.toFixed(1)}h ({app.percentage.toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="simple-bar-chart">
                {apps.slice(0, 10).map((app: AppUsage, idx: number) => (
                  <div key={idx} className="bar-item">
                    <div className="bar-label">{app.app_name}</div>
                    <div className="bar-wrapper">
                      <div className="bar-container">
                        <div
                          className="bar-fill"
                          style={{ 
                            width: `${Math.max(app.percentage, 2)}%`, 
                            backgroundColor: `hsl(${idx * 36}, 65%, 55%)` 
                          }}
                        />
                      </div>
                      <span className="bar-value">{app.hours.toFixed(1)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="chart-summary">
              <small>Showing top {Math.min(apps.length, chartType === 'pie' ? 8 : 10)} apps</small>
            </div>
          </div>
        );
      }
      
      case 'show_time_tracking_stats': {
        const userData = tool.arguments?.insights;

        // Default values if no data available
        const timeToday = userData?.total_time_today || 0;
        const timeWeek = userData?.total_time_this_week || 0;
        const timeMonth = userData?.total_time_this_month || 0;

        return (
          <div className="ai-component time-stats">
            <h4>Time Tracking Statistics</h4>
            <div className="stat-card-large">
              <div className="stat-value">{timeToday.toFixed(1)}</div>
              <div className="stat-label">Hours Today</div>
              {timeToday === 0 && (
                <div className="stat-note">No time tracked yet today</div>
              )}
            </div>
            <div className="stats-breakdown">
              <div className="stat-item">
                <span className="stat-label-small">This Week</span>
                <span className="stat-value-small">{timeWeek.toFixed(1)}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label-small">This Month</span>
                <span className="stat-value-small">{timeMonth.toFixed(1)}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label-small">Daily Average</span>
                <span className="stat-value-small">{timeWeek > 0 ? (timeWeek / 7).toFixed(1) : '0.0'}h</span>
              </div>
            </div>
            {(timeToday === 0 && timeWeek === 0) && (
              <div className="time-tracking-help">
                <small>💡 Start using tracked applications to see your time statistics</small>
              </div>
            )}
          </div>
        );
      }
      
      case 'show_task_status': {
        const userData = tool.arguments?.insights;
        const stats = userData?.task_stats;
        
        // Default values if no task data available
        const total = stats?.total || 0;
        const todo = stats?.todo || 0;
        const inProgress = stats?.in_progress || 0;
        const done = stats?.done || 0;
        const completionRate = stats?.completion_rate || 0;
        
        return (
          <div className="ai-component task-status">
            <h4>Task Status Overview</h4>
            
            {total === 0 ? (
              <div className="no-data-message">
                <div className="no-data-icon">📝</div>
                <p>No tasks found.</p>
                <small>Create your first task to start tracking progress.</small>
              </div>
            ) : (
              <>
                <div className="task-stats-grid">
                  <div className="task-stat-card">
                    <div className="task-stat-value">{total}</div>
                    <div className="task-stat-label">Total Tasks</div>
                  </div>
                  <div className="task-stat-card">
                    <div className="task-stat-value">{todo}</div>
                    <div className="task-stat-label">To Do</div>
                  </div>
                  <div className="task-stat-card">
                    <div className="task-stat-value">{inProgress}</div>
                    <div className="task-stat-label">In Progress</div>
                  </div>
                  <div className="task-stat-card">
                    <div className="task-stat-value">{done}</div>
                    <div className="task-stat-label">Done</div>
                  </div>
                </div>
                
                <div className="completion-progress">
                  <div className="progress-label">Completion Rate</div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${Math.max(completionRate, 0)}%` }}
                    />
                  </div>
                  <div className="progress-value">{completionRate.toFixed(1)}%</div>
                </div>
                
                {completionRate > 0 && (
                  <div className="task-insight">
                    <small>
                      {completionRate >= 80 ? '🎉 Great job! High completion rate!' : 
                       completionRate >= 50 ? '📈 Good progress on your tasks!' : 
                       '💪 Keep working on those tasks!'}
                    </small>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }
      
      case 'show_peak_hours': {
        const userData = tool.arguments?.insights;
        const peakHours = userData?.productivity_trend?.peak_hours || [];
        
        return (
          <div className="ai-component peak-hours">
            <h4>Peak Productivity Hours</h4>
            
            {peakHours.length === 0 ? (
              <div className="no-data-message">
                <div className="no-data-icon">⏰</div>
                <p>No peak hours data available yet.</p>
                <small>Use the app longer to discover your peak productivity patterns.</small>
              </div>
            ) : (
              <>
                <div className="peak-hours-list">
                  {peakHours.map((hour: number, idx: number) => (
                    <div key={idx} className="peak-hour-badge">
                      {hour < 12 ? 
                        `${hour === 0 ? 12 : hour}:00 AM` : 
                        `${hour === 12 ? 12 : hour - 12}:00 PM`
                      }
                    </div>
                  ))}
                </div>
                <div className="peak-hours-insight">
                  <p className="peak-hours-note">
                    {peakHours.length === 1 ? 
                      "Your most productive hour" : 
                      "You're most productive during these hours"
                    }
                  </p>
                  <small>
                    💡 Try scheduling important work during these times for better focus.
                  </small>
                </div>
              </>
            )}
          </div>
        );
      }
      
      case 'show_stats_summary': {
        const userData = tool.arguments?.insights;

        // Default values if no data available
        const timeToday = userData?.total_time_today || 0;
        const timeWeek = userData?.total_time_this_week || 0;
        const completionRate = userData?.task_stats?.completion_rate || 0;
        const totalTasks = userData?.task_stats?.total || 0;
        const appCount = userData?.most_used_apps?.length || 0;

        return (
          <div className="ai-component stats-summary">
            <h4>Productivity Overview</h4>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-info">
                  <div className="stat-value">{timeToday.toFixed(1)}h</div>
                  <div className="stat-label">Today</div>
                  {timeToday === 0 && <div className="stat-note">Not started</div>}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <div className="stat-value">{timeWeek.toFixed(1)}h</div>
                  <div className="stat-label">This Week</div>
                  {timeWeek > 0 && <div className="stat-note">Avg: {(timeWeek / 7).toFixed(1)}h/day</div>}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <div className="stat-value">
                    {totalTasks > 0 ? `${completionRate.toFixed(0)}%` : '--'}
                  </div>
                  <div className="stat-label">Tasks Done</div>
                  {totalTasks > 0 && <div className="stat-note">{totalTasks} total tasks</div>}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📱</div>
                <div className="stat-info">
                  <div className="stat-value">{appCount}</div>
                  <div className="stat-label">Tracked Apps</div>
                  {appCount === 0 && <div className="stat-note">Start tracking</div>}
                </div>
              </div>
            </div>
            
            {(timeToday === 0 && timeWeek === 0 && totalTasks === 0) && (
              <div className="overview-help">
                <div className="help-content">
                  <div className="help-icon">🚀</div>
                  <div className="help-text">
                    <p><strong>Get started with productivity tracking:</strong></p>
                    <ul>
                      <li>Use tracked applications to log time</li>
                      <li>Create and manage tasks</li>
                      <li>Check back for insights and patterns</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
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

  // Require the user to belong to a workspace before enabling the assistant
  const hasWorkspaceAccess = Boolean(currentUser?.team_id || currentUser?.workspace_id);

  if (!hasWorkspaceAccess) {
    return (
      <div className="ai-assistant-container">
        <Sidebar
          currentPage="ai-assistant"
          onLogout={onLogout}
          onPageChange={onPageChange || (() => {})}
        />

        <div className="main-content">
          <div className="ai-assistant-page-container">
            <div className="access-denied-container">
              <div className="access-denied-content">
                <h1>Access Restricted</h1>
                <p>The AI Assistant is available once you&apos;re assigned to a workspace.</p>
                <p>Please contact an administrator if you need access.</p>
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
        onPageChange={onPageChange || (() => {})} 
      />
      
      <div className="main-content">
        <div className="ai-assistant-page-container">
          <div className="ai-assistant-header">
            <div>
              <h1>Insights</h1>
              <div className="team-selector" ref={teamDropdownRef}>
                <button 
                  className="team-dropdown-button"
                  onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                  disabled={availableTeams.length <= 1 && hasOwnerAccess()}
                  title={availableTeams.length > 0 ? `Available teams: ${availableTeams.length}` : 'Loading teams...'}
                >
                  <span className="team-name">
                    {availableTeams.length > 0 ? 
                      (selectedTeamId ? 
                        availableTeams.find(team => team.id === selectedTeamId)?.team_name || currentTeam.name :
                        availableTeams[0]?.team_name || currentTeam.name
                      ) : 
                      (hasOwnerAccess() ? 'Loading Teams...' : 'No Owner Access')
                    }
                  </span>
                  {availableTeams.length > 1 && (
                    <span className={`dropdown-arrow ${showTeamDropdown ? 'open' : ''}`}>▼</span>
                  )}
                  {availableTeams.length === 0 && hasOwnerAccess() && (
                    <span className="loading-spinner">⟲</span>
                  )}
                </button>
                
                {showTeamDropdown && availableTeams.length > 1 && (
                  <div className="team-dropdown-menu">
                    {availableTeams.map((team) => (
                      <button
                        key={team.id}
                        className={`team-dropdown-item ${selectedTeamId === team.id ? 'selected' : ''}`}
                        onClick={() => handleTeamChange(team.id)}
                        title={`Team ID: ${team.id}`}
                      >
                        <span className="team-item-name">{team.team_name}</span>
                        {selectedTeamId === team.id && <span className="checkmark">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              
              {isTyping && (
                 <div className="message ai-message thinking-message">
                   <div className="message-avatar">
                     <div className="ai-avatar"></div>
                   </div>
                   <div className="message-content">
                     <div className="message-text thinking-text-message">
                       <span className="thinking-word">Thinking</span><span ref={thinkingDotsRef} className="thinking-dots-animated">.</span>
                     </div>
                   </div>
                 </div>
               )}
              
              {isStreaming && (
                 <div className="message ai-message">
                   <div className="message-avatar">
                     <div className="ai-avatar"></div>
                   </div>
                   <div className="message-content">
                     <div className="message-text">
                       {streamingMessage.split('\n').map((line, index) => (
                         <div key={index}>{line}</div>
                       ))}
                       <span className="streaming-cursor">|</span>
                     </div>
                   </div>
                 </div>
               )}
              
              <div ref={messagesEndRef} />
              </div>
            )}

            {/* Quick Actions - Show after first conversation starts */}
            {hasStartedConversation && (
              <div className="quick-actions-container persistent-actions">
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
                    onClick={() => {
                      const firstMember = realTeamMembers.find(m => m.id !== currentUser?.id);
                      const memberName = firstMember ? firstMember.name : "team member";
                      handleQuickAction(`How is @${memberName} doing this week?`);
                    }}
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

             <div className="input-container">
               <div className="input-wrapper">
                 <div
                   ref={inputRef}
                   contentEditable
                   dir="ltr"
                   onInput={handleInputChange}
                   onKeyDown={handleKeyDown}
                   className={`message-input content-editable-input ${isTyping ? 'thinking-state' : ''}`}
                   data-placeholder={isTyping ? '' : "Message AI Assistant... (use @ to mention team members)"}
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
                       onClick={() => {
                         const firstMember = realTeamMembers.find(m => m.id !== currentUser?.id);
                         const memberName = firstMember ? firstMember.name : "team member";
                         handleQuickAction(`How is @${memberName} doing this week?`);
                       }}
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
