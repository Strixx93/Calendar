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
  const [selectedDateTaps, setSelectedDateTaps] = useState([]);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Function to handle a user tapping on a day
  const handleDayTap = async (day) => {
    if (!userName.trim()) {
      alert("Please enter your name first!");
      return;
    }
    if (!db || !userId) {
      console.error("Firestore not ready.");
      return;
    }
    
    const dayString = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${day}`;
    const calendarDocRef = doc(db, `/artifacts/${APP_ID}/public/data/calendars`, userId);

    try {
      // Get the current state of the document
      const currentDocData = calendarData || {};
      const currentTaps = currentDocData[dayString]?.taps || [];
      
      const newTaps = [...currentTaps, { name: userName, userId: auth.currentUser.uid }];
      
      // Update the document with the new tap data for the specific day
      await setDoc(calendarDocRef, {
        ...currentDocData,
        [dayString]: {
            taps: newTaps,
        }
      }, { merge: true });

    } catch (error) {
      console.error("Error updating document:", error);
    }
  };

  // Function to open the modal and show who tapped on a date
  const handleOpenModal = (day) => {
    const dayString = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${day}`;
    const taps = (calendarData[dayString]?.taps || []);
    setSelectedDateTaps(taps);
    setShowModal(true);
  };

  // Function to close the modal
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedDateTaps([]);
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
      const taps = calendarData[dayString]?.taps || [];
      const tapCount = taps.length;
      
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      
      days.push(
        <div 
          key={day} 
          className={`relative p-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 rounded-lg shadow-md hover:bg-gray-200 dark:hover:bg-gray-700
            ${isToday ? 'bg-blue-200 dark:bg-blue-600' : 'bg-gray-100 dark:bg-gray-800'}`
          }
          onClick={() => handleOpenModal(day)}
          onContextMenu={(e) => {
            e.preventDefault();
            handleDayTap(day);
          }}
          title="Left-click to view taps, right-click to add yours"
        >
          <span className="text-xl font-bold">{day}</span>
          {tapCount > 0 && (
            <span className="absolute top-1 right-1 text-xs font-semibold text-white bg-blue-500 rounded-full px-2 py-0.5">
              {tapCount}
            </span>
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
      
      <div className="w-full max-w-4xl p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex flex-col gap-6">

        {/* Header and User ID display */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-3xl font-extrabold text-center sm:text-left text-gray-900 dark:text-white">
            Collaborative Calendar
          </h1>
          {userId && (
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg truncate w-full sm:w-auto text-center sm:text-right">
              Share this ID: <span className="font-bold text-blue-600 dark:text-blue-400">{userId}</span>
            </div>
          )}
        </div>

        {/* User Name Input */}
        <div className="flex items-center gap-2">
          <label htmlFor="userName" className="font-semibold text-lg">Your Name:</label>
          <input
            id="userName"
            type="text"
            className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name to tap"
          />
        </div>
        
        {/* Calendar Navigation */}
        <div className="flex justify-between items-center px-2">
          <button 
            onClick={handlePrevMonth}
            className="p-2 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-colors duration-200"
          >
            &#9664; Prev
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <button 
            onClick={handleNextMonth}
            className="p-2 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-colors duration-200"
          >
            Next &#9654;
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-4 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="font-bold text-gray-500 dark:text-gray-400">{day}</div>
          ))}
          {renderCalendarDays()}
        </div>

      </div>

      {/* Modal for displaying taps */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl max-w-sm w-full">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">People who tapped</h3>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-3xl leading-none">&times;</button>
            </div>
            {selectedDateTaps.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {selectedDateTaps.map((tap, index) => (
                  <li key={index} className="text-lg">
                    {tap.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No one has tapped this day yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
