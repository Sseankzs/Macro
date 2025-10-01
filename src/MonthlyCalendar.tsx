import React, { useState, useEffect } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import { ResponsivePie } from '@nivo/pie';
import { motion, AnimatePresence } from 'framer-motion';
import './MonthlyCalendar.css';

interface DayData {
  date: Date;
  hours: number;
  breakdown: {
    id: string;
    label: string;
    value: number;
    color: string;
  }[];
}

interface MonthlyCalendarProps {
  timeEntries: any[];
  applications: any[];
  maxHoursPerDay?: number;
}

const MonthlyCalendar: React.FC<MonthlyCalendarProps> = ({
  timeEntries,
  applications,
  maxHoursPerDay = 12
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayData, setDayData] = useState<DayData[]>([]);

  // Calendar navigation hotkeys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger when not holding Ctrl/Cmd (to avoid conflicts with other shortcuts)
      if (event.ctrlKey || event.metaKey) return;
      
      // Only trigger for arrow keys
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPreviousMonth();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNextMonth();
          break;
        case 'Escape':
          event.preventDefault();
          closePieChart();
          break;
        default:
          return;
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentDate]);

  // Generate calendar data for the current month
  useEffect(() => {
    const generateCalendarData = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      // Get first day of month and number of days
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      
      // Get starting day of week (0 = Sunday, 1 = Monday, etc.)
      const startDayOfWeek = firstDay.getDay();
      
      const calendarData: DayData[] = [];
      
      // Add empty cells for days before the first day of the month
      for (let i = 0; i < startDayOfWeek; i++) {
        calendarData.push({
          date: new Date(year, month, -startDayOfWeek + i + 1),
          hours: 0,
          breakdown: []
        });
      }
      
      // Add days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayHours = calculateHoursForDate(timeEntries, date);
        const breakdown = getDayBreakdown(timeEntries, applications, date);
        
        calendarData.push({
          date,
          hours: dayHours,
          breakdown
        });
      }
      
      setDayData(calendarData);
    };

    generateCalendarData();
  }, [currentDate, timeEntries, applications]);

  // Calculate hours tracked for a specific date
  const calculateHoursForDate = (entries: any[], targetDate: Date): number => {
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = entries.filter(entry => {
      const startTime = new Date(entry.start_time);
      return startTime >= dayStart && startTime <= dayEnd;
    });

    // Calculate total time without double counting overlapping periods
    let totalSeconds = 0;
    const timePeriods: { start: Date; end: Date }[] = [];

    for (const entry of dayEntries) {
      const startTime = new Date(entry.start_time);
      const endTime = entry.end_time ? new Date(entry.end_time) : new Date();
      
      const entryStart = startTime < dayStart ? dayStart : startTime;
      const entryEnd = endTime > dayEnd ? dayEnd : endTime;

      if (entryStart < entryEnd) {
        timePeriods.push({ start: entryStart, end: entryEnd });
      }
    }

    // Merge overlapping periods
    const mergedPeriods: { start: Date; end: Date }[] = [];
    
    for (const period of timePeriods) {
      if (mergedPeriods.length === 0) {
        mergedPeriods.push(period);
      } else {
        const lastPeriod = mergedPeriods[mergedPeriods.length - 1];
        
        if (period.start <= lastPeriod.end) {
          lastPeriod.end = new Date(Math.max(lastPeriod.end.getTime(), period.end.getTime()));
        } else {
          mergedPeriods.push(period);
        }
      }
    }

    // Calculate total seconds from merged periods
    for (const period of mergedPeriods) {
      totalSeconds += (period.end.getTime() - period.start.getTime()) / 1000;
    }

    return totalSeconds / 3600; // Convert to hours
  };

  // Get breakdown data for a specific day
  const getDayBreakdown = (entries: any[], apps: any[], targetDate: Date) => {
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = entries.filter(entry => {
      const startTime = new Date(entry.start_time);
      return startTime >= dayStart && startTime <= dayEnd && entry.app_id;
    });

    // Create app map
    const appMap = new Map();
    apps.forEach(app => {
      appMap.set(app.id, app);
    });

    // Aggregate time by category
    const categoryTimeMap = new Map<string, number>();
    const colors = ['#5DADE2', '#48C9B0', '#52BE80', '#F4D03F', '#EB984E', '#E74C3C'];

    dayEntries.forEach(entry => {
      const app = appMap.get(entry.app_id);
      if (app && app.category) {
        const startTime = new Date(entry.start_time);
        const endTime = entry.end_time ? new Date(entry.end_time) : new Date();
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        
        const currentTime = categoryTimeMap.get(app.category) || 0;
        categoryTimeMap.set(app.category, currentTime + durationHours);
      }
    });

    // Convert to array format for pie chart
    const breakdown = Array.from(categoryTimeMap.entries()).map(([category, hours], index) => ({
      id: category,
      label: category,
      value: Math.round(hours * 100) / 100, // Round to 2 decimal places
      color: colors[index % colors.length]
    }));

    return breakdown.sort((a, b) => b.value - a.value);
  };

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Handle day click
  const handleDayClick = (day: DayData) => {
    if (day.hours > 0) {
      setSelectedDay(day.date);
    }
  };

  // Close pie chart
  const closePieChart = () => {
    setSelectedDay(null);
  };

  // Get progress percentage
  const getProgressPercentage = (hours: number): number => {
    return Math.min((hours / maxHoursPerDay) * 100, 100);
  };

  // Get progress color based on hours
  const getProgressColor = (hours: number): string => {
    if (hours === 0) return '#E5E5E7';
    if (hours < 2) return '#FF3B30';
    if (hours < 4) return '#FF9500';
    if (hours < 8) return '#FFCC00';
    return '#34C759';
  };

  // Format hours for display
  const formatHours = (hours: number): string => {
    if (hours === 0) return '';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${Math.round(hours * 10) / 10}h`;
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="monthly-calendar">
      {/* Calendar Header */}
      <div className="calendar-header">
        <button className="nav-button" onClick={goToPreviousMonth} title="Press ← for Previous Month">
          <div className="nav-button-content">
            <span className="nav-hotkey">←</span>
            <span className="nav-month-indicator">
              {monthNames[(currentDate.getMonth() - 1 + 12) % 12]}
            </span>
          </div>
        </button>
        
        <h2 className="calendar-title">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        
        <button className="nav-button" onClick={goToNextMonth} title="Press → for Next Month">
          <div className="nav-button-content">
            <span className="nav-month-indicator">
              {monthNames[(currentDate.getMonth() + 1) % 12]}
            </span>
            <span className="nav-hotkey">→</span>
          </div>
        </button>
      </div>

      {/* Day Names Header */}
      <div className="day-names">
        {dayNames.map(day => (
          <div key={day} className="day-name">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {dayData.map((day, index) => (
          <motion.div
            key={`${day.date.getMonth()}-${day.date.getDate()}`}
            className={`calendar-day ${day.hours > 0 ? 'has-data' : ''} ${selectedDay && selectedDay.getTime() === day.date.getTime() ? 'selected' : ''}`}
            onClick={() => handleDayClick(day)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.01 }}
          >
            <div className="day-number">
              {day.date.getDate()}
            </div>
            
            <div className="progress-container">
              <CircularProgressbar
                value={getProgressPercentage(day.hours)}
                styles={buildStyles({
                  pathColor: getProgressColor(day.hours),
                  trailColor: '#E5E5E7',
                  pathTransitionDuration: 0.5,
                })}
              />
              <div className="hours-text">
                {formatHours(day.hours)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pie Chart Modal */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            className="pie-chart-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePieChart}
          >
            <motion.div
              className="pie-chart-modal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pie-chart-header">
                <h3>
                  {selectedDay.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </h3>
                <button className="close-button" onClick={closePieChart}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
              <div className="pie-chart-content">
                {(() => {
                  const selectedDayData = dayData.find(d => d.date.getTime() === selectedDay.getTime());
                  if (!selectedDayData || selectedDayData.breakdown.length === 0) {
                    return (
                      <div className="no-data-message">
                        No tracked applications for this day
                      </div>
                    );
                  }
                  
                  return (
                    <div className="pie-chart-container">
                      <ResponsivePie
                        data={selectedDayData.breakdown}
                        margin={{ top: 20, right: 80, bottom: 20, left: 20 }}
                        innerRadius={0.4}
                        padAngle={0.7}
                        cornerRadius={3}
                        colors={{ datum: 'data.color' }}
                        borderWidth={1}
                        borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                        arcLabelsSkipAngle={10}
                        arcLabelsTextColor="#333333"
                        animate={true}
                        enableArcLabels={false}
                        tooltip={({ datum }) => (
                          <div className="pie-tooltip">
                            <strong>{datum.label}</strong><br />
                            {datum.value}h
                          </div>
                        )}
                      />
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MonthlyCalendar;
