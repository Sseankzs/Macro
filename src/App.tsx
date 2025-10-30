import { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './Dashboard'
import TaskPage from './TaskPage'
import TeamsPage from './TeamsPage'
import RegisterAppsPage from './RegisterAppsPage'
import MetricBuilderPage from './MetricBuilderPage'
import LogsPage from './LogsPage'
import AIAssistantPage from './AIAssistantPage'
import { DashboardCacheProvider } from './contexts/DashboardCacheContext'
import { CurrentUserProvider } from './contexts/CurrentUserContext'
import { invoke } from '@tauri-apps/api/core'
import { supabase } from './lib/supabase'

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant'>('dashboard')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      console.log('Login attempt:', { email })
      
      if (isTauri()) {
        // Running in Tauri desktop app - use Supabase auth directly
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        })

        if (error) {
          console.error('Login failed:', error.message)
          alert(`Login failed: ${error.message}`)
          return
        }

        if (data.user) {
          console.log('Login successful:', data.user.email)
          
          // Initialize database connection after successful login
          const dbInitialized = await invoke<boolean>('initialize_database_and_login', {
            email,
            password,
            userId: data.user.id
          })
          
          if (dbInitialized) {
            console.log('Database initialized successfully')
            // Fetch current user info once and then mark logged in. This avoids
            // re-checking the user's role on every page change.
            try {
              const currentUser = await invoke('get_current_user') as any;
              // store in provider via passing initialUser when rendering below
              (window as any).__INITIAL_CURRENT_USER__ = currentUser ?? null;
            } catch (err) {
              console.warn('Could not fetch current user after login:', err);
              (window as any).__INITIAL_CURRENT_USER__ = null;
            }

            setIsLoggedIn(true)
          } else {
            console.error('Database initialization failed')
            alert('Login successful but database initialization failed.')
          }
        }
      } else {
        // Running in browser - development mode
        console.log('Running in browser mode - auto-login for development')
        // Simulate successful login for development
        // Provide a default dev current user so feature gating works in browser
        (window as any).__INITIAL_CURRENT_USER__ = { role: 'owner', id: 'dev', name: 'Dev User' };
        setIsLoggedIn(true)
      }
    } catch (error) {
      console.error('Login error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`Login failed: ${errorMessage}`)
    }
  }

  const handleSignUp = async (name: string, email: string, password: string) => {
    try {
      console.log('Sign up attempt:', { email })
      
      // Validate password confirmation
      if (password !== confirmPassword) {
        alert('Passwords do not match!')
        return
      }

      if (password.length < 6) {
        alert('Password must be at least 6 characters long!')
        return
      }
      
      if (isTauri()) {
        // Running in Tauri desktop app - call backend sign_up_user which will create
        // the auth user and insert the users table record (including provided name)
        const success = await invoke<boolean>('sign_up_user', {
          email,
          password,
          name
        })

        if (success) {
          alert('Account created successfully! Please log in.')
          setIsSignUp(false)
          setEmail('')
          setPassword('')
          setConfirmPassword('')
          setName('')
        } else {
          alert('Sign up failed on backend')
        }
      } else {
        // Running in browser - development mode
        console.log('Running in browser mode - simulating sign up')
        alert('Account created successfully! Please log in.')
        setIsSignUp(false)
        setEmail('')
        setPassword('')
        setConfirmPassword('')
        setName('')
      }
    } catch (error) {
      console.error('Sign up error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`Sign up failed: ${errorMessage}`)
    }
  }

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSignUp(name, email, password)
  }

  // Start activity tracking when user logs in
  useEffect(() => {
    if (isLoggedIn) {
      const startTracking = async () => {
        if (isTauri()) {
          try {
            await invoke('start_activity_tracking')
            console.log('Activity tracking started on login')
          } catch (error) {
            console.error('Failed to start activity tracking on login:', error)
          }
        } else {
          console.log('Activity tracking not available in browser mode')
        }
      }
      
      startTracking()
    }
  }, [isLoggedIn])

  const handleLogout = async () => {
    try {
      // Stop activity tracking when user logs out
      if (isTauri()) {
        try {
          await invoke('stop_activity_tracking')
          console.log('Activity tracking stopped on logout')
        } catch (error) {
          console.error('Failed to stop activity tracking on logout:', error)
        }
      } else {
        console.log('Activity tracking not available in browser mode')
      }

      // Sign out from Supabase session
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('Error signing out:', error.message)
        // Still proceed with local logout even if Supabase signout fails
      } else {
        console.log('Successfully signed out from Supabase')
      }

      // Clear local state
      setIsLoggedIn(false)
      setCurrentPage('dashboard')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      
      console.log('User logged out successfully')
    } catch (error) {
      console.error('Logout error:', error)
      // Still clear local state even if there's an error
      setIsLoggedIn(false)
      setCurrentPage('dashboard')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    }
  }

  const handlePageChange = (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => {
    setCurrentPage(page)
  }

  // Keyboard shortcuts for navigation - works across all pages
  useEffect(() => {
    if (!isLoggedIn) return; // Only enable shortcuts when logged in

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger shortcuts when Ctrl/Cmd is pressed
      if (!event.ctrlKey && !event.metaKey) return;
      
      // Prevent default browser behavior for our shortcuts
      event.preventDefault();
      
      switch (event.key.toLowerCase()) {
        case 'h':
          handlePageChange('dashboard');
          break;
        case 't':
          handlePageChange('tasks');
          break;
        case 'e':
          handlePageChange('teams');
          break;
        case 'a':
          handlePageChange('register-apps');
          break;
        case 'l':
          handlePageChange('logs');
          break;
        case 'i':
          handlePageChange('ai-assistant');
          break;
        case 'f':
          // Focus search or filter functionality (could be enhanced later)
          console.log('Search/Filter shortcut triggered');
          break;
        default:
          return; // Don't prevent default for other keys
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoggedIn, handlePageChange]);

  // Show dashboard if logged in
  if (isLoggedIn) {
    // Use the initial current user fetched after login (if any) and pass it
    // into the CurrentUserProvider so children can read role without extra calls.
    const initialUser = (window as any).__INITIAL_CURRENT_USER__ ?? null;

    return (
      <CurrentUserProvider initialUser={initialUser}>
        <DashboardCacheProvider>
          {currentPage === 'tasks' && (
            <TaskPage onLogout={handleLogout} onPageChange={handlePageChange} />
          )}
        {currentPage === 'teams' && (
          <TeamsPage onLogout={handleLogout} onPageChange={handlePageChange} />
        )}
        {currentPage === 'register-apps' && (
          <RegisterAppsPage onLogout={handleLogout} onPageChange={handlePageChange} />
        )}
        {currentPage === 'metric-builder' && (
          <MetricBuilderPage onLogout={handleLogout} onPageChange={handlePageChange} />
        )}
        {currentPage === 'logs' && (
          <LogsPage onLogout={handleLogout} onPageChange={handlePageChange} />
        )}
        {currentPage === 'ai-assistant' && (
          <AIAssistantPage onLogout={handleLogout} onPageChange={handlePageChange} />
        )}
        {currentPage === 'dashboard' && (
          <Dashboard onLogout={handleLogout} onPageChange={handlePageChange} />
        )}
      </DashboardCacheProvider>
      </CurrentUserProvider>
    )
  }

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-form-container">
          <h1 className="login-title">{isSignUp ? 'Create Account!' : 'Welcome Back!'}</h1>
          <p className="login-subtitle">{isSignUp ? 'Sign up for a new account' : 'Sign in to your account'}</p>
          
          <form onSubmit={isSignUp ? handleSignUpSubmit : handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            
            {isSignUp && (
              <div className="form-group">
                <label htmlFor="name">Full name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            {isSignUp && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                />
              </div>
            )}
            
            {!isSignUp && (
              <div className="form-options">
                <label className="checkbox-container">
                  <input type="checkbox" />
                  <span className="checkmark"></span>
                  Remember me
                </label>
                <a href="#" className="forgot-password">Forgot password?</a>
              </div>
            )}
            
            <button type="submit" className="login-button">
              {isSignUp ? 'Sign Up' : 'Log In'}
            </button>
            
            {!isSignUp && (
              <>
                <div className="divider">
                  <span>or</span>
                </div>
                
                <button type="button" className="google-button">
                  <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
              </>
            )}
          </form>
          
          <div className="login-footer">
            <p>
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <a 
                href="#" 
                className="signup-link" 
                onClick={(e) => {
                  e.preventDefault()
                  setIsSignUp(!isSignUp)
                  setEmail('')
                  setPassword('')
                  setConfirmPassword('')
                }}
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </a>
            </p>
          </div>
        </div>
      </div>
      
      <div className="login-right">
        <div className="image-container">
          <img 
            src="/src/assets/images/login-image.jpeg" 
            alt="Login background" 
            className="login-image"
          />
        </div>
      </div>
    </div>
  )
}

export default App
