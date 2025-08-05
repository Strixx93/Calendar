import { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import './App.css';

// Replace with your Firebase config
const firebaseConfig = {

  apiKey: "AIzaSyBBOpAC4GH531hVexJHKWK7LqAWSaj6Uqc",

  authDomain: "calendar-f064a.firebaseapp.com",

  projectId: "calendar-f064a",

  storageBucket: "calendar-f064a.firebasestorage.app",

  messagingSenderId: "904299594",

  appId: "1:904299594:web:26a395a6d4a73f635792b3",

  measurementId: "G-7RXFJ1V686"

};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  
  // Format date to YYYY-MM-DD
  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  // Get days in current month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  // Auto-authenticate anonymously
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("User is signed in:", user.uid);
        setUser(user);
        setUserName(user.displayName || `User_${user.uid.slice(0, 5)}`);
      } else {
        console.log("No user, signing in anonymously...");
        signInAnonymously(auth);
      }
    });
    
    return () => unsubscribe();
  }, []);
  
  // Subscribe to calendar data for current month
  useEffect(() => {
    if (!user) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Format date range for current month
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = getDaysInMonth(year, month);
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    
    console.log(`Fetching availability from ${startDate} to ${endDate}`);
    
    const availabilityRef = collection(db, "availability");
    
    const unsubscribe = onSnapshot(availabilityRef, (snapshot) => {
      const data = {};
      snapshot.forEach(doc => {
        const dateId = doc.id;
        // Only include dates within our range
        if (dateId >= startDate && dateId <= endDate) {
          data[dateId] = doc.data().users || {};
        }
      });
      
      setCalendarData(data);
      setLoading(false);
      console.log("Calendar data updated:", data);
    });
    
    return () => unsubscribe();
  }, [currentDate, user]);
  
  // Toggle availability for a date
  const toggleAvailability = async (date) => {
    if (!user) return;
    
    const dateStr = formatDate(date);
    const dateRef = doc(db, "availability", dateStr);
    
    try {
      // Get current data
      const docSnap = await getDoc(dateRef);
      const dateData = docSnap.exists() ? docSnap.data() : { users: {} };
      
      // Toggle availability
      const isCurrentlyAvailable = dateData.users[user.uid]?.isAvailable === true;
      dateData.users[user.uid] = {
        userId: user.uid,
        userName: userName,
        isAvailable: !isCurrentlyAvailable,
        updatedAt: new Date().toISOString()
      };
      
      // Save to Firestore
      await setDoc(dateRef, dateData);
      console.log(`Availability for ${dateStr} toggled successfully`);
    } catch (error) {
      console.error("Error toggling availability:", error);
    }
  };

  // Update user name
  const updateUserName = () => {
    if (!user || !userName.trim()) return;
    
    // Update any existing availability entries
    Object.keys(calendarData).forEach(async (dateStr) => {
      if (calendarData[dateStr][user.uid]) {
        const dateRef = doc(db, "availability", dateStr);
        const docSnap = await getDoc(dateRef);
        
        if (docSnap.exists()) {
          const dateData = docSnap.data();
          if (dateData.users[user.uid]) {
            dateData.users[user.uid].userName = userName;
            await setDoc(dateRef, dateData);
          }
        }
      }
    });
  };

  // Sign out current user
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Go to previous month
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // Go to next month
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Generate calendar grid
  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of month (0-6, where 0 is Sunday)
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = getDaysInMonth(year, month);
    
    const calendar = [];
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      calendar.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDate(date);
      const dayData = calendarData[dateStr] || {};
      const dayUsers = Object.values(dayData);
      
      // Count available users
      const availableCount = dayUsers.filter(u => u.isAvailable).length;
      
      // Check if current user marked this day
      const isMarkedByUser = user && dayData[user.uid];
      const isUserAvailable = isMarkedByUser && dayData[user.uid].isAvailable;
      
      // Check if this is the selected date
      const isSelected = selectedDate && formatDate(selectedDate) === dateStr;
      
      // Check if this is today
      const isToday = new Date().toISOString().split('T')[0] === dateStr;
      
      calendar.push(
        <div 
          key={day} 
          className={`calendar-day ${isUserAvailable ? 'available' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
          onClick={() => {
            setSelectedDate(date);
            toggleAvailability(date);
          }}
        >
          <div className="day-number">{day}</div>
          {dayUsers.length > 0 && (
            <div className="availability-count">
              {availableCount}/{dayUsers.length} available
            </div>
          )}
        </div>
      );
    }
    
    return calendar;
  };

  // Show details for selected date
  const renderSelectedDateDetails = () => {
    if (!selectedDate) return null;
    
    const dateStr = formatDate(selectedDate);
    const dateData = calendarData[dateStr] || {};
    const users = Object.values(dateData);
    
    const availableUsers = users.filter(u => u.isAvailable);
    const unavailableUsers = users.filter(u => !u.isAvailable);
    
    return (
      <div className="selected-date-details">
        <h3>{selectedDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</h3>
        
        <div className="user-lists">
          <div className="available-users">
            <h4>Available ({availableUsers.length})</h4>
            {availableUsers.length > 0 ? (
              availableUsers.map(user => (
                <div key={user.userId} className="user-item available">
                  {user.userName}
                </div>
              ))
            ) : (
              <p>No one is available</p>
            )}
          </div>
          
          <div className="unavailable-users">
            <h4>Unavailable ({unavailableUsers.length})</h4>
            {unavailableUsers.length > 0 ? (
              unavailableUsers.map(user => (
                <div key={user.userId} className="user-item unavailable">
                  {user.userName}
                </div>
              ))
            ) : (
              <p>No one is unavailable</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header>
        <h1>Group Availability Calendar</h1>
        {user && (
          <div className="user-controls">
            <input 
              type="text" 
              value={userName} 
              onChange={(e) => setUserName(e.target.value)} 
              placeholder="Your name" 
            />
            <button onClick={updateUserName}>Update Name</button>
            <button onClick={handleSignOut}>Sign Out</button>
          </div>
        )}
      </header>
      
      <main>
        {loading ? (
          <div className="loading">Loading calendar data...</div>
        ) : (
          <>
            <div className="calendar">
              <div className="calendar-header">
                <button onClick={prevMonth}>&lt; Prev</button>
                <h2>
                  {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={nextMonth}>Next &gt;</button>
              </div>
              
              <div className="weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="weekday">{day}</div>
                ))}
              </div>
              
              <div className="calendar-grid">
                {generateCalendar()}
              </div>
            </div>
            
            {renderSelectedDateDetails()}
          </>
        )}
      </main>
      
      <footer>
        <p>
          Made with Firebase & React • 
          {user ? `Signed in as ${userName}` : 'Connecting...'}
        </p>
      </footer>
    </div>
  );
}

export default App;