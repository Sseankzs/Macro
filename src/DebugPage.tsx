import { useEffect, useState } from 'react';
import './Dashboard.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';
import { supabase } from './lib/supabase';
import { BYPASS_LOGIN } from './config';

interface DebugPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

interface DebugUser {
  id: string;
  name: string;
  email?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  image_url?: string | null;
  team_id?: string | null;
  workspace_id?: string | null;
  membership_role?: string | null;
}

interface WorkspaceRecord {
  id: string;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  description?: string | null;
  member_count?: number;
  created_by_name?: string | null;
}

interface BackendWorkspace {
  id: string;
  name?: string | null;
  team_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  description?: string | null;
}

interface WorkspaceMemberRow {
  id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  role?: string | null;
  joined_at?: string | null;
}

const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

function DebugPage({ onLogout, onPageChange }: DebugPageProps) {
  const [users, setUsers] = useState<DebugUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<DebugUser | null>(null);
  const [currentUserError, setCurrentUserError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState<boolean>(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const fetchWorkspaceMembers = async () => {
    try {
      setMembersLoading(true);
      setMembersError(null);

      if (isTauri()) {
        const members = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
        console.log('✅ Workspace members loaded:', members);
        
        // Enrich with user and workspace names
        const enrichedMembers = await Promise.all(
          (members ?? []).map(async (member) => {
            let enrichedMember = { ...member };
            
            // Try to get user name
            if (member.user_id) {
              try {
                const user = await invoke('get_user', { userId: member.user_id }) as DebugUser | null;
                if (user) {
                  (enrichedMember as any).user_name = user.name;
                  (enrichedMember as any).user_email = user.email;
                }
              } catch (userErr) {
                console.warn(`Failed to get user for ${member.user_id}:`, userErr);
              }
            }
            
            // Try to get workspace name
            if (member.workspace_id) {
              const workspace = workspaces.find(w => w.id === member.workspace_id);
              if (workspace) {
                (enrichedMember as any).workspace_name = workspace.name;
              }
            }
            
            return enrichedMember;
          })
        );
        
        setWorkspaceMembers(enrichedMembers);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setWorkspaceMembers([]);
          return;
        }

        const { data: members, error: membersError } = await supabase
          .from('workspace_members')
          .select('id, user_id, workspace_id, role, joined_at');
        
        if (membersError) throw membersError;
        setWorkspaceMembers(members ?? []);
        return;
      }

      // Mock data for bypass mode
      setWorkspaceMembers([
        {
          id: 'mock-member-1',
          user_id: 'mock-user-1',
          workspace_id: 'mock-workspace-1',
          role: 'owner',
          joined_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch workspace members:', err);
      const message = err instanceof Error ? err.message : String(err);
      setMembersError(message);
      setWorkspaceMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      setWorkspaceLoading(true);
      setWorkspaceError(null);

      if (isTauri()) {
        const userWorkspaces = await invoke<BackendWorkspace[]>('get_my_workspaces');
        const workspaceRows = (userWorkspaces ?? []).map((row) => ({
          id: row.id,
          name: row.name ?? row.team_name ?? 'Untitled workspace',
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
          created_by: row.created_by ?? null,
          description: row.description ?? null,
        }));

  const workspaceIds = workspaceRows.map((w) => w.id);
  const workspaceIdSet = new Set(workspaceIds);
        const memberCounts: Record<string, number> = {};
        const creatorNames: Record<string, string | null> = {};

        if (workspaceIds.length > 0) {
          try {
            const memberships = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
            (memberships ?? []).forEach((row) => {
              const workspaceId = row.workspace_id ?? undefined;
              if (!workspaceId || !workspaceIdSet.has(workspaceId)) return;
              memberCounts[workspaceId] = (memberCounts[workspaceId] ?? 0) + 1;
            });
          } catch (membershipErr) {
            console.warn('Failed to load workspace member counts via Tauri command:', membershipErr);
          }

          try {
            const users = await invoke<DebugUser[]>('get_all_users');
            const userMap = new Map<string, string>();
            (users ?? []).forEach((user) => {
              if (user?.id) {
                userMap.set(user.id, user.name ?? user.email ?? 'Unknown user');
              }
            });
            workspaceRows.forEach((workspace) => {
              if (workspace.created_by) {
                creatorNames[workspace.id] = userMap.get(workspace.created_by) ?? 'Unknown user';
              }
            });
          } catch (creatorErr) {
            console.warn('Failed to load creator names via Tauri command:', creatorErr);
          }
        }

        const mapped: WorkspaceRecord[] = workspaceRows.map((workspace) => ({
          ...workspace,
          member_count: memberCounts[workspace.id] ?? 0,
          created_by_name: workspace.created_by ? creatorNames[workspace.id] ?? null : null,
        }));
        setWorkspaces(mapped);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setWorkspaces([]);
          return;
        }

        const workspaceMap = new Map<string, WorkspaceRecord>();

        try {
          const { data: createdRows, error: createdError } = await supabase
            .from('workspaces')
            .select('id, name, created_at, updated_at, created_by, description')
            .eq('created_by', userId);
          if (createdError) throw createdError;
          (createdRows ?? []).forEach((row: any) => {
            if (!row?.id) return;
            workspaceMap.set(row.id, {
              id: row.id,
              name: row.name ?? 'Untitled workspace',
              created_at: row.created_at ?? null,
              updated_at: row.updated_at ?? null,
              created_by: row.created_by ?? null,
              description: row.description ?? null,
            });
          });
        } catch (createdErr) {
          console.warn('Failed to fetch workspaces created by user:', createdErr);
        }

        let membershipWorkspaceIds: string[] = [];
        try {
          const { data: membershipRows, error: membershipError } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', userId);
          if (membershipError) throw membershipError;
          const ids = new Set<string>();
          (membershipRows ?? []).forEach((row: any) => {
            if (row?.workspace_id) {
              ids.add(row.workspace_id);
            }
          });
          membershipWorkspaceIds = Array.from(ids);
        } catch (membershipErr) {
          console.warn('Failed to fetch workspace memberships for user:', membershipErr);
        }

        if (membershipWorkspaceIds.length > 0) {
          try {
            const { data: memberWorkspaces, error: memberWorkspaceError } = await supabase
              .from('workspaces')
              .select('id, name, created_at, updated_at, created_by, description')
              .in('id', membershipWorkspaceIds);
            if (memberWorkspaceError) throw memberWorkspaceError;
            (memberWorkspaces ?? []).forEach((row: any) => {
              if (!row?.id) return;
              workspaceMap.set(row.id, {
                id: row.id,
                name: row.name ?? 'Untitled workspace',
                created_at: row.created_at ?? null,
                updated_at: row.updated_at ?? null,
                created_by: row.created_by ?? null,
                description: row.description ?? null,
              });
            });
          } catch (memberWorkspaceErr) {
            console.warn('Failed to fetch workspace records for memberships:', memberWorkspaceErr);
          }
        }

        const workspaceRows = Array.from(workspaceMap.values());
        const workspaceIds = workspaceRows.map((w) => w.id);

        if (workspaceIds.length > 0) {
          try {
            const { data: membershipData, error: membershipError } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .in('workspace_id', workspaceIds);
            if (membershipError) throw membershipError;
            const counts = new Map<string, number>();
            (membershipData ?? []).forEach((row: any) => {
              const workspaceId = row?.workspace_id;
              if (!workspaceId) return;
              counts.set(workspaceId, (counts.get(workspaceId) ?? 0) + 1);
            });
            workspaceRows.forEach((row) => {
              row.member_count = counts.get(row.id) ?? 0;
            });
          } catch (membershipErr) {
            console.warn('Failed to load workspace member counts via Supabase:', membershipErr);
          }

          try {
            const creatorIds = workspaceRows
              .map((row) => row.created_by)
              .filter((id): id is string => Boolean(id));
            if (creatorIds.length > 0) {
              const { data: creators, error: creatorError } = await supabase
                .from('users')
                .select('id, name, email')
                .in('id', creatorIds);
              if (creatorError) throw creatorError;
              const creatorMap = new Map<string, string>();
              (creators ?? []).forEach((user: any) => {
                creatorMap.set(user.id, user.name ?? user.email ?? 'Unknown user');
              });
              workspaceRows.forEach((row) => {
                if (row.created_by) {
                  row.created_by_name = creatorMap.get(row.created_by) ?? 'Unknown user';
                }
              });
            }
          } catch (creatorErr) {
            console.warn('Failed to load workspace creator names via Supabase:', creatorErr);
          }
        }

        setWorkspaces(workspaceRows);
        return;
      }

      setWorkspaces([
        {
          id: 'mock-workspace-1',
          name: 'Demo Workspace',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'mock-user-1',
          description: 'Static workspace for debug mode',
          member_count: 1,
          created_by_name: 'Dev User',
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch workspaces for debug page:', err);
      const message = err instanceof Error ? err.message : String(err);
      setWorkspaceError(message);
      setWorkspaces([]);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isTauri()) {
        const data = await invoke<DebugUser[]>('get_all_users');
        const normalized = data.map((user) => ({
          ...user,
          membership_role: (user as any)?.membership_role ?? null,
        }));
        setUsers(normalized);
        return;
      }

      // Browser/dev mode: attempt Supabase direct query if login isn't bypassed.
      if (!BYPASS_LOGIN) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, created_at, updated_at, image_url');
        if (error) throw error;

        const { data: membershipRows, error: membershipError } = await supabase
          .from('workspace_members')
          .select('user_id, workspace_id, role');

        if (membershipError) {
          console.warn('Failed to load workspace memberships for debug users:', membershipError);
        }

        const membershipMap = new Map<string, { workspace_id: string | null; membership_role: string | null }>();
        (membershipRows ?? []).forEach((row: any) => {
          if (row?.user_id) {
            membershipMap.set(row.user_id, {
              workspace_id: row.workspace_id ?? null,
              membership_role: row.role ?? null,
            });
          }
        });

        const enriched = (data ?? []).map((user) => {
          const membership = membershipMap.get(user.id);
          return {
            ...user,
            team_id: membership?.workspace_id ?? null,
            workspace_id: membership?.workspace_id ?? null,
            membership_role: membership?.membership_role ?? null,
          } as DebugUser;
        });

        setUsers(enriched);
        return;
      }

      // Fallback mock data for pure dev mode
      setUsers([
        {
          id: 'mock-user-1',
          name: 'Dev User',
          email: 'dev@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          image_url: null,
          team_id: 'mock-team-1',
          workspace_id: 'mock-team-1',
          membership_role: 'owner',
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch users for debug page:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      setCurrentUserError(null);

      if (isTauri()) {
        const data = await invoke<DebugUser>('get_current_user');
        setCurrentUser({
          ...data,
          membership_role: (data as any)?.membership_role ?? null,
        });
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data?.user;
        if (user) {
          let membershipRole: string | null = null;
          let membershipTeam: string | null = null;

          try {
            const { data: membershipRows, error: membershipError } = await supabase
              .from('workspace_members')
              .select('workspace_id, role')
              .eq('user_id', user.id)
              .limit(1);

            if (membershipError) {
              console.warn('Failed to load membership for current user:', membershipError);
            } else if (membershipRows && membershipRows.length > 0) {
              membershipRole = (membershipRows[0] as any)?.role ?? null;
              membershipTeam = (membershipRows[0] as any)?.workspace_id ?? null;
            }
          } catch (membershipErr) {
            console.warn('Membership lookup failed for current user:', membershipErr);
          }

          setCurrentUser({
            id: user.id,
            name: user.user_metadata?.name || user.email || 'Unknown',
            email: user.email,
            created_at: user.created_at ?? null,
            updated_at: (user as any)?.updated_at ?? user.last_sign_in_at ?? null,
            image_url: (user.user_metadata as any)?.avatar_url ?? null,
            membership_role: membershipRole,
            team_id: membershipTeam,
            workspace_id: membershipTeam,
          });
        } else {
          setCurrentUser(null);
        }
        return;
      }

      const fallback = (window as any).__INITIAL_CURRENT_USER__ ?? { id: 'dev', name: 'Dev User', membership_role: 'owner' };
      setCurrentUser({
        id: fallback.id ?? 'dev',
        name: fallback.name ?? 'Dev User',
        email: fallback.email ?? 'dev@example.com',
        created_at: null,
        updated_at: null,
        image_url: fallback.image_url ?? null,
        membership_role: fallback.membership_role ?? 'owner',
        team_id: fallback.team_id ?? null,
        workspace_id: fallback.workspace_id ?? fallback.team_id ?? null,
      });
    } catch (err) {
      console.error('Failed to fetch current user for debug page:', err);
      const message = err instanceof Error ? err.message : String(err);
      setCurrentUser(null);
      setCurrentUserError(message);
    }
  };

  const handleRefresh = () => {
    fetchUsers();
    fetchCurrentUser();
    fetchWorkspaces();
  };

  useEffect(() => {
    fetchUsers();
    fetchCurrentUser();
    fetchWorkspaces();
  }, []);

  // Fetch workspace members after workspaces are loaded
  useEffect(() => {
    if (workspaces.length > 0) {
      fetchWorkspaceMembers();
    }
  }, [workspaces]);

  return (
    <div className="dashboard-container">
      <Sidebar
        currentPage="debug"
        onLogout={onLogout}
        onPageChange={onPageChange || (() => {})}
      />
      <div className="main-content debug-main-content">
        <div className="tasks-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="tasks-header">
            <h1>Debug Utilities</h1>
            <div className="header-actions">
              <button className="btn-text" onClick={handleRefresh} disabled={loading || workspaceLoading}>
                Refresh
              </button>
            </div>
          </div>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Current User</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Resolved identity for the active session.</p>
              </div>
              <button className="btn-text" onClick={fetchCurrentUser} style={{ minWidth: 90 }}>
                Reload
              </button>
            </header>

            {currentUserError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load current user: {currentUserError}
              </div>
            )}

            {currentUser ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Field</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['ID', currentUser.id],
                      ['Name', currentUser.name || '—'],
                      ['Email', currentUser.email || '—'],
                      ['Created', currentUser.created_at ? new Date(currentUser.created_at).toLocaleString() : '—'],
                      ['Updated', currentUser.updated_at ? new Date(currentUser.updated_at).toLocaleString() : '—'],
                      ['Image URL', currentUser.image_url || '—'],
                      ['Membership Role', currentUser.membership_role || '—'],
                      ['Workspace ID', currentUser.workspace_id || currentUser.team_id || '—'],
                    ].map(([label, value]) => (
                      <tr key={label as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', width: '30%', fontWeight: 500 }}>{label}</td>
                        <td style={{ padding: '12px 16px', color: label === 'Email' ? '#2563eb' : undefined }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
                No current user detected.
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Workspaces</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Live snapshot of workspaces from Supabase.</p>
              </div>
              <button className="btn-text" onClick={fetchWorkspaces} disabled={workspaceLoading} style={{ minWidth: 90 }}>
                Reload
              </button>
            </header>

            {workspaceError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load workspaces: {workspaceError}
              </div>
            )}

            {workspaces.length === 0 && !workspaceLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No workspaces found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Members</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created By</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Creator Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaces.map((workspace) => (
                      <tr key={workspace.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px' }}>{workspace.name || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.member_count ?? 0}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.created_at ? new Date(workspace.created_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.updated_at ? new Date(workspace.updated_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px', color: workspace.created_by ? '#2563eb' : undefined }}>{workspace.created_by || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.created_by_name || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Workspace Members</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>All workspace membership records from the backend.</p>
              </div>
              {membersLoading && <span style={{ color: '#6b7280', fontSize: 14 }}>Loading…</span>}
            </header>

            {membersError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load workspace members: {membersError}
              </div>
            )}

            {workspaceMembers.length === 0 && !membersLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No workspace members found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User Email</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaceMembers.map((member, index) => (
                      <tr key={member.id || `member-${index}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>{member.id || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#2563eb' }}>{member.user_id || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{(member as any).user_name || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb' }}>{(member as any).user_email || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#2563eb' }}>{member.workspace_id || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{(member as any).workspace_name || '—'}</td>
                        <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: '6px', 
                            fontSize: '12px', 
                            fontWeight: 500,
                            background: member.role === 'owner' ? '#dbeafe' : member.role === 'admin' ? '#fef3c7' : '#f3f4f6',
                            color: member.role === 'owner' ? '#1d4ed8' : member.role === 'admin' ? '#d97706' : '#6b7280'
                          }}>
                            {member.role || 'member'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{member.joined_at ? new Date(member.joined_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Users</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Live snapshot of users from the backend.</p>
              </div>
              {loading && <span style={{ color: '#6b7280', fontSize: 14 }}>Loading…</span>}
            </header>

            {error && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load users: {error}
              </div>
            )}

            {users.length === 0 && !loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No users found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Image URL</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Membership Role</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px' }}>{user.name || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb' }}>{user.email || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{user.created_at ? new Date(user.created_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{user.updated_at ? new Date(user.updated_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px', color: user.image_url ? '#2563eb' : undefined }}>{user.image_url || '—'}</td>
                        <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{user.membership_role || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{user.workspace_id || user.team_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default DebugPage;
