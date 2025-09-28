# Supabase Database Setup

This document explains how to set up your Supabase database for the Macro application with the new schema.

## Prerequisites

1. A Supabase account and project
2. Your Supabase project URL and anon key

## Environment Setup

1. Create a `.env` file in your project root
2. Fill in your Supabase credentials:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   
   # Alternative Vite environment variables (for frontend)
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-key-here
   ```
   
   Note: The application will try to load environment variables in this order:
   - SUPABASE_URL / SUPABASE_ANON_KEY (for backend)
   - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (for frontend)
   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY (new default key)

## Database Schema

Create the following tables in your Supabase database:

### Default User Setup

First, create the default user that will be used throughout the application:

```sql
INSERT INTO users (id, name, email, role, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Dev User',
  'dev@example.com',
  'owner',
  now(),
  now()
);
```

### Teams Table
```sql
CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    team_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    current_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Projects Table
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    manager_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tasks Table
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Applications Table
```sql
CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    process_name TEXT NOT NULL,
    icon_path TEXT,
    category TEXT,
    is_tracked BOOLEAN DEFAULT FALSE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Time Entries Table
```sql
CREATE TABLE time_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_seconds BIGINT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Row Level Security (RLS)

Enable RLS on all tables and create policies:

### Teams Table Policies
```sql
-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to read teams
CREATE POLICY "Authenticated users can read teams" ON teams
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy to allow team owners/managers to update teams
CREATE POLICY "Team owners can update teams" ON teams
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.team_id = teams.id 
            AND users.id::text = auth.uid()::text 
            AND users.role IN ('owner', 'manager')
        )
    );
```

### Users Table Policies
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own data and team members
CREATE POLICY "Users can read own and team data" ON users
    FOR SELECT USING (
        id::text = auth.uid()::text OR 
        team_id IN (
            SELECT team_id FROM users WHERE id::text = auth.uid()::text
        )
    );

-- Policy to allow users to update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (id::text = auth.uid()::text);

-- Policy to allow team owners/managers to create users
CREATE POLICY "Team managers can create users" ON users
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id::text = auth.uid()::text 
            AND u.team_id = users.team_id 
            AND u.role IN ('owner', 'manager')
        )
    );
```

### Projects Table Policies
```sql
-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy to allow team members to read projects
CREATE POLICY "Team members can read projects" ON projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id::text = auth.uid()::text 
            AND users.team_id = projects.team_id
        )
    );

-- Policy to allow project managers to update projects
CREATE POLICY "Project managers can update projects" ON projects
    FOR UPDATE USING (
        manager_id::text = auth.uid()::text OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id::text = auth.uid()::text 
            AND users.team_id = projects.team_id 
            AND users.role IN ('owner', 'manager')
        )
    );
```

### Tasks Table Policies
```sql
-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy to allow project team members to read tasks
CREATE POLICY "Project team members can read tasks" ON tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN users u ON u.team_id = p.team_id
            WHERE p.id = tasks.project_id 
            AND u.id::text = auth.uid()::text
        )
    );

-- Policy to allow assignees and project managers to update tasks
CREATE POLICY "Assignees and managers can update tasks" ON tasks
    FOR UPDATE USING (
        assignee_id::text = auth.uid()::text OR
        EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = tasks.project_id 
            AND p.manager_id::text = auth.uid()::text
        )
    );
```

### Applications Table Policies
```sql
-- Enable RLS
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to manage their own applications
CREATE POLICY "Users can manage own applications" ON applications
    FOR ALL USING (user_id::text = auth.uid()::text);
```

### Time Entries Table Policies
```sql
-- Enable RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to manage their own time entries
CREATE POLICY "Users can manage own time entries" ON time_entries
    FOR ALL USING (user_id::text = auth.uid()::text);
```

## Available Tauri Commands

The backend now provides the following commands organized by entity:

### User Management
- `create_user(name: string, email: string, team_id: string | null, role: string)` - Create a new user
- `get_user(user_id: string)` - Get user by ID
- `get_users_by_team(team_id: string)` - Get all users in a team
- `update_user(user_id: string, name: string | null, email: string | null, team_id: string | null, current_project_id: string | null, role: string | null)` - Update user

### Team Management
- `create_team(team_name: string)` - Create a new team
- `get_team(team_id: string)` - Get team by ID
- `get_all_teams()` - Get all teams

### Project Management
- `create_project(name: string, team_id: string, manager_id: string, description: string | null)` - Create a new project
- `get_projects_by_team(team_id: string)` - Get all projects for a team
- `get_project(project_id: string)` - Get project by ID

### Task Management
- `create_task(title: string, project_id: string, assignee_id: string | null, description: string | null, status: string | null, priority: string | null, due_date: string | null)` - Create a new task
- `get_tasks_by_project(project_id: string)` - Get all tasks for a project
- `get_tasks_by_assignee(assignee_id: string)` - Get all tasks assigned to a user
- `update_task(task_id: string, title: string | null, description: string | null, assignee_id: string | null, status: string | null, priority: string | null, due_date: string | null)` - Update task

### Application Management
- `create_application(name: string, process_name: string, user_id: string, icon_path: string | null, category: string | null, is_tracked: boolean | null)` - Create a new application
- `get_applications_by_user(user_id: string)` - Get all applications for a user
- `update_application(app_id: string, name: string | null, process_name: string | null, icon_path: string | null, category: string | null, is_tracked: boolean | null)` - Update application

### Time Entry Management
- `create_time_entry(user_id: string, app_id: string | null, task_id: string | null, start_time: string, end_time: string | null, duration_seconds: number | null, is_active: boolean | null)` - Create a new time entry
- `get_time_entries_by_user(user_id: string, limit: number | null)` - Get time entries for a user
- `get_time_entries_by_task(task_id: string)` - Get time entries for a task
- `get_time_entries_by_app(app_id: string)` - Get time entries for an application
- `update_time_entry(entry_id: string, end_time: string | null, duration_seconds: number | null, is_active: boolean | null)` - Update time entry

### Default User Convenience Commands
- `get_current_user()` - Get the hardcoded default user
- `get_current_user_id()` - Get the default user ID
- `get_my_applications()` - Get applications for the default user
- `get_my_tasks()` - Get tasks assigned to the default user
- `get_my_time_entries(limit: number | null)` - Get time entries for the default user
- `create_my_application(name: string, process_name: string, icon_path: string | null, category: string | null, is_tracked: boolean | null)` - Create application for default user
- `create_my_time_entry(app_id: string | null, task_id: string | null, start_time: string, end_time: string | null, duration_seconds: number | null, is_active: boolean | null)` - Create time entry for default user

### Utility
- `test_database_connection()` - Test database connection

## Usage Examples

```typescript
// In your frontend code
import { invoke } from '@tauri-apps/api/core';

// Create a team
const team = await invoke('create_team', { team_name: 'Development Team' });

// Create a user
const user = await invoke('create_user', {
  name: 'John Doe',
  email: 'john@example.com',
  team_id: team.id,
  role: 'manager'
});

// Create a project
const project = await invoke('create_project', {
  name: 'Mobile App',
  team_id: team.id,
  manager_id: user.id,
  description: 'Building a mobile application'
});

// Create a task
const task = await invoke('create_task', {
  title: 'Design UI',
  project_id: project.id,
  assignee_id: user.id,
  description: 'Create wireframes and mockups',
  status: 'todo',
  priority: 'high'
});

// Create an application
const app = await invoke('create_application', {
  name: 'VS Code',
  process_name: 'Code.exe',
  user_id: user.id,
  category: 'Development',
  is_tracked: true
});

// Create a time entry
const timeEntry = await invoke('create_time_entry', {
  user_id: user.id,
  task_id: task.id,
  app_id: app.id,
  start_time: new Date().toISOString(),
  is_active: true
});

// Using convenience commands (no need to pass user_id)
const currentUser = await invoke('get_current_user');
const myApps = await invoke('get_my_applications');
const myTasks = await invoke('get_my_tasks');
const myTimeEntries = await invoke('get_my_time_entries', { limit: 10 });

// Create application for current user
const myApp = await invoke('create_my_application', {
  name: 'VS Code',
  process_name: 'Code.exe',
  category: 'Development',
  is_tracked: true
});

// Create time entry for current user
const myTimeEntry = await invoke('create_my_time_entry', {
  app_id: myApp.id,
  task_id: task.id,
  start_time: new Date().toISOString(),
  is_active: true
});
```

## Data Relationships

The schema supports the following relationships:

- **Team** → has many **Users** and **Projects**
- **Project** → belongs to **Team**, has **Manager** (User), has many **Tasks**
- **Task** → belongs to **Project**, may be assigned to **User**, has many **TimeEntries**
- **Application** → belongs to **User**
- **TimeEntry** → belongs to **User**, may be linked to **Application** and/or **Task**

## Notes

- All IDs are generated as UUID strings
- Timestamps are handled automatically by PostgreSQL
- The application will log connection status on startup
- Make sure to replace the placeholder values in `env.example` with your actual Supabase credentials
- Date/time values should be passed as ISO 8601 strings (e.g., `new Date().toISOString()`)
- Enums are validated on the backend (role, status, priority)