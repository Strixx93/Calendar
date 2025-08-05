import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Define the Firebase configuration
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBBOpAC4GH531hVexJHKWK7LqAWSaj6Uqc",
    authDomain: "calendar-f064a.firebaseapp.com",
    projectId: "calendar-f064a",
    storageBucket: "calendar-f064a.firebasestorage.app",
    messagingSenderId: "904299594",
    appId: "1:904299594:web:26a395a6d4a73f635792b3"
};

// Define a static app ID for your deployed app
const APP_ID = 'calendar_app_strixx';

const App = () => {
  const [userName, setUserName] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateAvailability, setSelectedDateAvailability] = useState([]);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingDates, setSavingDates] = useState(new Set()); // Track which dates are being saved

  // Initialize Firebase and handle authentication
  useEffect(() => {
    // We're using a single, static config for deployment
    const firebaseConfig = FIREBASE_CONFIG;
    const appId = APP_ID;
    
    if (Object.keys(firebaseConfig).length === 0) {
      console.error("Firebase config is missing. Please provide it.");
      setIsLoading(false);
      return;
    }

    const app = initializeApp(firebaseConfig);
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setDb(firestoreDb);
    setAuth(firebaseAuth);

    // This listener will handle both initial sign-in and state changes
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        console.log("Signing in anonymously...");
        try {
          await signInAnonymously(firebaseAuth);
        } catch (error) {
          console.error("Failed to sign in anonymously:", error);
        }
      }
      setIsLoading(false);
    });

    // Clean up the auth listener
    return () => unsubscribe();
  }, []); // Empty dependency array means this runs once on mount

  // Set up Firestore real-time listener for the calendar data
  useEffect(() => {
    if (!db || !userId) return;

    // The document ID for the public calendar is the userId
    // This allows different users to have separate shared calendars
    const calendarDocRef = doc(db, `/artifacts/${APP_ID}/public/data/calendars`, userId);
    
    // We are listening to a single document which will hold the entire month's data
    const unsubscribe = onSnapshot(calendarDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setCalendarData(docSnap.data());
        } else {
            setCalendarData({}); // Reset data if the calendar doesn't exist
        }
    }, (error) => {
        console.error("Error fetching calendar data:", error);
    });

    // Clean up the listener
    return () => unsubscribe();
  }, [db, userId]);

  // Function to toggle user availability on a date
  const toggleAvailability = async (day) => {
    if (!userName.trim()) {
      alert("Please enter your name first!");
      return;
    }
    if (!db || !userId) {
      console.error("Firestore not ready.");
      return;
    }
    
    const dayString = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${day}`;
    
    // Add to saving state
    setSavingDates(prev => new Set([...prev, dayString]));
    
    try {
      // Get the current state of the document
      const currentDocData = calendarData || {};
      const currentAvailability = currentDocData[dayString]?.availability || [];
      
      // Check if user is already available on this date
      const userIndex = currentAvailability.findIndex(person => 
        person.name.toLowerCase() === userName.trim().toLowerCase()
      );
      
      let newAvailability;
      if (userIndex >= 0) {
        // User is already available, remove them
        newAvailability = currentAvailability.filter((_, index) => index !== userIndex);
      } else {
        // User is not available, add them
        newAvailability = [...currentAvailability, { 
          name: userName.trim(), 
          userId: auth.currentUser.uid,
          addedAt: new Date().toISOString()
        }];
      }
      
      // Update the document with the new availability data for the specific day
      await setDoc(calendarDocRef, {
        ...currentDocData,
        [dayString]: {
            availability: newAvailability,
        }
      }, { merge: true });

    } catch (error) {
      console.error("Error updating document:", error);
      alert("Failed to update availability. Please try again.");
    } finally {
      // Remove from saving state
      setSavingDates(prev => {
        const newSet = new Set(prev);
        newSet.delete(dayString);
        return newSet;
      });
    }
  };

  // Function to open the modal and show who's available on a date
  const handleOpenModal = (day) => {
    const dayString = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${day}`;
    const availability = (calendarData[dayString]?.availability || []);
    setSelectedDate(day);
    setSelectedDateAvailability(availability);
    setShowModal(true);
  };

  // Function to close the modal
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setSelectedDateAvailability([]);
  };

  // Check if current user is available on a specific date
  const isUserAvailable = (day) => {
    if (!userName.trim()) return false;
    const dayString = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${day}`;
    const availability = calendarData[dayString]?.availability || [];
    return availability.some(person => 
      person.name.toLowerCase() === userName.trim().toLowerCase()
    );
  };

  // Utility function to get the number of days in a month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Utility function to get the first day of the month
  const getFirstDayOfMonth = (year, month) => {
    // getDay() returns 0 for Sunday, 1 for Monday, etc.
    return new Date(year, month, 1).getDay();
  };

  // Generate the days of the calendar
  const renderCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    const today = new Date();

    // Fill in leading empty days
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }

    // Fill in the days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayString = `${year}-${month + 1}-${day}`;
      const availability = calendarData[dayString]?.availability || [];
      const availableCount = availability.length;
      const userIsAvailable = isUserAvailable(day);
      const isSaving = savingDates.has(dayString);
      
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const isPastDate = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      days.push(
        <div 
          key={day} 
          className={`relative p-3 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 rounded-lg shadow-md min-h-[80px] border-2
            ${isToday ? 'bg-blue-100 border-blue-400 dark:bg-blue-900 dark:border-blue-500' : 
              userIsAvailable ? 'bg-green-100 border-green-400 dark:bg-green-900 dark:border-green-500' :
              'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600'}
            ${isPastDate ? 'opacity-60' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}
            ${isSaving ? 'opacity-50' : ''}
          `}
          onClick={() => handleOpenModal(day)}
          title={`${availableCount} people available. Click to view details.`}
        >
          <span className="text-xl font-bold mb-1">{day}</span>
          
          {/* Availability count badge */}
          {availableCount > 0 && (
            <span className="text-xs font-semibold text-white bg-blue-500 rounded-full px-2 py-0.5 mb-1">
              {availableCount}
            </span>
          )}
          
          {/* User's availability indicator */}
          {userIsAvailable && (
            <div className="absolute top-1 right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="You are available"></div>
          )}
          
          {/* Loading indicator */}
          {isSaving && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      );
    }
    
    return days;
  };

  // Navigate to the previous month
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // Navigate to the next month
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
        <div className="text-2xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="font-sans antialiased text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col items-center p-4">
      
      <div className="w-full max-w-6xl p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex flex-col gap-6">

        {/* Header and User ID display */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-3xl font-extrabold text-center sm:text-left text-gray-900 dark:text-white">
            Availability Calendar
          </h1>
          {userId && (
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg truncate w-full sm:w-auto text-center sm:text-right">
              Share this ID: <span className="font-bold text-blue-600 dark:text-blue-400">{userId}</span>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">How to use:</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Enter your name below and click on dates you're available</li>
            <li>• Green dates show you're available, numbers show total people available</li>
            <li>• Click any date to see who else is available</li>
            <li>• Click your available dates again to remove your availability</li>
          </ul>
        </div>

        {/* User Name Input */}
        <div className="flex items-center gap-2">
          <label htmlFor="userName" className="font-semibold text-lg">Your Name:</label>
          <input
            id="userName"
            type="text"
            className="flex-grow p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name to mark availability"
          />
        </div>
        
        {/* Calendar Navigation */}
        <div className="flex justify-between items-center px-2">
          <button 
            onClick={handlePrevMonth}
            className="p-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
          >
            ← Previous
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <button 
            onClick={handleNextMonth}
            className="p-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
          >
            Next →
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-3 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="font-bold text-gray-500 dark:text-gray-400 py-2">{day}</div>
          ))}
          {renderCalendarDays()}
        </div>

      </div>

      {/* Modal for displaying availability */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {currentDate.toLocaleString('default', { month: 'long' })} {selectedDate}
              </h3>
              <button 
                onClick={handleCloseModal} 
                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-3xl leading-none"
              >
                ×
              </button>
            </div>
            
            {/* Toggle availability button */}
            {userName.trim() && (
              <div className="mb-4">
                <button
                  onClick={() => {
                    toggleAvailability(selectedDate);
                    handleCloseModal();
                  }}
                  className={`w-full p-3 rounded-lg font-semibold transition-colors duration-200 ${
                    isUserAvailable(selectedDate)
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  {isUserAvailable(selectedDate) ? 'Remove My Availability' : 'Mark Me as Available'}
                </button>
              </div>
            )}
            
            <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">
              Available People ({selectedDateAvailability.length}):
            </h4>
            
            {selectedDateAvailability.length > 0 ? (
              <ul className="space-y-2">
                {selectedDateAvailability.map((person, index) => (
                  <li key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-lg">{person.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-center py-4">No one is available on this date yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;