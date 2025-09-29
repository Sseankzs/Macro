/**
 * Utility functions for formatting timestamps to local time
 */

/**
 * Formats an ISO timestamp string to a readable local time format
 * @param timestamp - ISO timestamp string (e.g., "2024-01-15T10:30:00Z")
 * @param format - Format type: 'date', 'time', 'datetime', 'relative'
 * @returns Formatted time string
 */
export function formatTimestamp(
  timestamp: string, 
  format: 'date' | 'time' | 'datetime' | 'relative' = 'datetime'
): string {
  try {
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    switch (format) {
      case 'date':
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        }); // dd-mm-yy format

      case 'time':
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }); // hh:mm AM/PM format

      case 'datetime':
        return date.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }); // dd-mm-yy, hh:mm AM/PM format

      case 'relative':
        return getRelativeTime(date);

      default:
        return date.toLocaleString();
    }
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Invalid date';
  }
}

/**
 * Gets relative time (e.g., "2 hours ago", "yesterday")
 * @param date - Date object
 * @returns Relative time string
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) {
    return 'Yesterday';
  }

  if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  }

  // For older dates, show the actual date
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

/**
 * Formats duration in seconds to a readable format
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

/**
 * Formats a timestamp for display in tables/lists
 * Shows relative time for recent dates, absolute date for older ones
 * @param timestamp - ISO timestamp string
 * @returns Formatted time string optimized for table display
 */
export function formatForTable(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    // Show relative time for dates within the last 7 days
    if (diffInDays < 7 && diffInDays >= 0) {
      return getRelativeTime(date);
    }

    // Show absolute date for older dates
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting timestamp for table:', error);
    return 'Invalid date';
  }
}

