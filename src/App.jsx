import { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  onAuthStateChanged, 
  signOut 
} from "firebase/auth";
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
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]); // Store all users for availability tracking
  
  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    // Get initial state from localStorage or default to false (light mode)
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : false;
  });
  
  // Authentication state
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  
  // Form state
  const [userName, setUserName] = useState("");
  const [originalUserName, setOriginalUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isNameChecking, setIsNameChecking] = useState(false);
  const [isNameAvailable, setIsNameAvailable] = useState(true);
  
  // Add this utility function to check if a user is already in local state
  const isUserProfileLoaded = () => {
    return user && userName && userName !== "";
  };
  
  // Apply dark mode to the document
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    // Save preference to localStorage
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);
  
  // Format date to YYYY-MM-DD
  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  // Get days in current month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(prevMode => !prevMode);
  };
  
  // Fetch all users from Firebase
  const fetchAllUsers = async () => {
    try {
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      
      const users = [];
      snapshot.forEach(doc => {
        users.push({
          uid: doc.id,
          ...doc.data()
        });
      });
      
      console.log(`Fetched ${users.length} users from database`);
      setAllUsers(users);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };
  
  // Fetch all users when logged in
  useEffect(() => {
    if (isLoggedIn) {
      fetchAllUsers();
    }
  }, [isLoggedIn]);
  
  // Check if username is available
  const checkUsernameAvailability = async (name, excludeUid = null) => {
    if (!name.trim()) return true; // Empty names are "available" but will be caught by validation
    
    setIsNameChecking(true);
    
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("displayName", "==", name.trim()));
      const snapshot = await getDocs(q);
      
      let isAvailable = true;
      
      // If we found any users with this name, check if it's our own account
      if (!snapshot.empty) {
        snapshot.forEach((doc) => {
          // If this is a different user with the same name
          if (doc.id !== excludeUid) {
            isAvailable = false;
          }
        });
      }
      
      setIsNameAvailable(isAvailable);
      setIsNameChecking(false);
      return isAvailable;
    } catch (error) {
      console.error("Error checking username:", error);
      setIsNameChecking(false);
      return false;
    }
  };
  
  // Handle username change with debounce
  useEffect(() => {
    if (userName !== originalUserName && authMode === 'register') {
      const timeoutId = setTimeout(() => {
        checkUsernameAvailability(userName);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [userName, authMode, originalUserName]);
  
  // Handle user authentication state
  useEffect(() => {
    console.log("Setting up authentication listener");
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("User is signed in:", user.uid);
        setUser(user);
        setIsLoggedIn(true);
        setShowAuth(false);
        
        // Always fetch the user profile when signing in
        getUserProfile(user.uid);
      } else {
        console.log("No user signed in");
        setUser(null);
        setIsLoggedIn(false);
        setLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, []);
  
  // Get user profile from Firestore - IMPROVED to fix cross-device username issue
  const getUserProfile = async (userId) => {
    try {
      setLoading(true); // Show loading while fetching profile
      console.log(`Fetching user profile for ID: ${userId}`);
      
      // First, try to get profile directly from Firestore with no caching
      const userRef = doc(db, "users", userId);
      const docSnap = await getDoc(userRef);
      
      if (docSnap.exists()) {
        const userData = docSnap.data();
        
        // Verify profile has required fields
        if (userData.displayName) {
          console.log("Profile found with name:", userData.displayName);
          setUserName(userData.displayName);
          setOriginalUserName(userData.displayName);
          
          // Load dark mode preference if it exists
          if (userData.darkMode !== undefined) {
            setDarkMode(userData.darkMode);
          }
          
          setLoading(false);
          return; // Successfully loaded profile, exit function
        }
        
        // If we got here, profile exists but missing displayName
        console.warn("User profile exists but has no displayName, attempting to repair");
        
        // Try to find this user in the all users collection
        // This helps if the user has logged in from other devices before
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", userId));
        const usersSnapshot = await getDocs(q);
        
        if (!usersSnapshot.empty) {
          // If we found any profile data in other documents
          let foundName = null;
          
          usersSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.displayName) {
              foundName = data.displayName;
            }
          });
          
          if (foundName) {
            console.log("Found name in other documents:", foundName);
            await setDoc(userRef, { displayName: foundName }, { merge: true });
            setUserName(foundName);
            setOriginalUserName(foundName);
            setLoading(false);
            return; // Successfully repaired, exit function
          }
        }
        
        // Last resort: create a more stable default name
        const defaultName = `User_${userId.slice(0, 8)}`;
        console.log("Creating new default name:", defaultName);
        
        await setDoc(userRef, { displayName: defaultName }, { merge: true });
        setUserName(defaultName);
        setOriginalUserName(defaultName);
        
      } else {
        // Handle missing profile document - this shouldn't happen for existing users
        console.warn("No user profile document found, creating one");
        
        // Search for any existing profile data first
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", userId));
        const usersSnapshot = await getDocs(q);
        
        let defaultName = `User_${userId.slice(0, 8)}`;
        let foundProfile = false;
        
        if (!usersSnapshot.empty) {
          usersSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.displayName) {
              defaultName = data.displayName;
              foundProfile = true;
            }
          });
        }
        
        if (foundProfile) {
          console.log("Found existing profile data:", defaultName);
        } else {
          console.log("Creating entirely new profile");
        }
        
        // Create a new user profile document
        await setDoc(userRef, {
          uid: userId,
          displayName: defaultName,
          createdAt: new Date().toISOString(),
          darkMode: darkMode
        });
        
        setUserName(defaultName);
        setOriginalUserName(defaultName);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Subscribe to calendar data for current month
  useEffect(() => {
    if (!user) {
      console.log("No user yet, skipping calendar data subscription");
      return;
    }
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    console.log(`Setting up listener for month: ${month + 1}/${year}`);
    
    // Format date range for current month
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = getDaysInMonth(year, month);
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    
    console.log(`Watching for availability from ${startDate} to ${endDate}`);
    
    const availabilityRef = collection(db, "availability");
    
    try {
      const unsubscribe = onSnapshot(
        availabilityRef, 
        { includeMetadataChanges: true },
        (snapshot) => {
          console.log(`Got snapshot with ${snapshot.size} documents, fromCache: ${snapshot.metadata.fromCache}`);
          
          // Process all documents in the collection
          const newData = {};
          
          snapshot.forEach((doc) => {
            const dateId = doc.id;
            // Only include dates within our range
            if (dateId >= startDate && dateId <= endDate) {
              newData[dateId] = doc.data().users || {};
            }
          });
          
          console.log("Updated calendar data with new snapshot");
          setCalendarData(newData);
          setLoading(false);
        },
        (error) => {
          console.error("Error in snapshot listener:", error);
          setLoading(false);
        }
      );
      
      return () => {
        console.log("Cleaning up calendar data listener");
        unsubscribe();
      };
    } catch (error) {
      console.error("Failed to set up snapshot listener:", error);
      setLoading(false);
    }
  }, [currentDate, user]);
  
  // Register new user
  const registerUser = async (e) => {
    e.preventDefault();
    setAuthError("");
    
    if (!email || !password || !userName.trim()) {
      setAuthError("Please fill in all fields");
      return;
    }
    
    // Check for username availability
    setIsNameChecking(true);
    const isAvailable = await checkUsernameAvailability(userName);
    setIsNameChecking(false);
    
    if (!isAvailable) {
      setAuthError("This username is already taken. Please choose another.");
      return;
    }
    
    try {
      setLoading(true); // Show loading state
      
      // Create account with email/password
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      
      // Store user profile in Firestore
      await setDoc(doc(db, "users", newUser.uid), {
        uid: newUser.uid,
        email: email,
        displayName: userName.trim(),
        createdAt: new Date().toISOString(),
        darkMode: darkMode
      });
      
      console.log("User registered successfully:", newUser.uid);
      setEmail("");
      setPassword("");
      setOriginalUserName(userName);
      
      // Explicitly set the user name in state
      setUserName(userName.trim());
    } catch (error) {
      console.error("Error registering user:", error);
      setAuthError(error.message);
      setLoading(false);
    }
  };
  
  // Login existing user
  const loginUser = async (e) => {
    e.preventDefault();
    setAuthError("");
    
    if (!email || !password) {
      setAuthError("Please enter both email and password");
      return;
    }
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("User logged in successfully");
      setEmail("");
      setPassword("");
    } catch (error) {
      console.error("Error logging in:", error);
      setAuthError(error.message);
    }
  };
  
  // Logout user
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      console.log("User signed out");
      setShowAuth(true);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  
  // Toggle availability for a date
  const toggleAvailability = async (date) => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    
    const dateStr = formatDate(date);
    console.log(`Toggling availability for ${dateStr}`);
    
    try {
      const dateRef = doc(db, "availability", dateStr);
      
      const docSnap = await getDoc(dateRef);
      
      let dateData = { users: {} };
      if (docSnap.exists()) {
        dateData = docSnap.data();
        if (!dateData.users) dateData.users = {};
      }
      
      const currentUserData = dateData.users[user.uid];
      const isCurrentlyAvailable = currentUserData?.isAvailable === true;
      
      console.log(`Current availability: ${isCurrentlyAvailable}`);
      
      dateData.users[user.uid] = {
        userId: user.uid,
        userName: userName,
        isAvailable: !isCurrentlyAvailable,
        updatedAt: new Date().toISOString()
      };
      
      console.log("Saving to Firestore:", dateData);
      await setDoc(dateRef, dateData);
      
      console.log("Availability toggled successfully");
      
      // Optimistic update for immediate feedback
      setCalendarData(prev => {
        const updated = {...prev};
        if (!updated[dateStr]) updated[dateStr] = {};
        
        updated[dateStr] = {
          ...updated[dateStr],
          [user.uid]: {
            userId: user.uid,
            userName: userName,
            isAvailable: !isCurrentlyAvailable,
            updatedAt: new Date().toISOString()
          }
        };
        
        return updated;
      });
    } catch (error) {
      console.error("Error toggling availability:", error);
      alert("Failed to update availability. See console for details.");
    }
  };
  
  // Update user name
  const updateUserName = async () => {
    if (!user || !userName.trim()) return;
    
    if (userName === originalUserName) {
      console.log("Name unchanged, skipping update");
      return;
    }
    
    console.log(`Updating user name to: ${userName}`);
    
    // Check if username is already taken
    setIsNameChecking(true);
    const isAvailable = await checkUsernameAvailability(userName, user.uid);
    setIsNameChecking(false);
    
    if (!isAvailable) {
      alert("This username is already taken. Please choose another.");
      setUserName(originalUserName);
      return;
    }
    
    try {
      // Update user profile in Firestore
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { displayName: userName.trim() }, { merge: true });
      
      // Update username in all calendar entries
      for (const dateStr in calendarData) {
        const dateData = calendarData[dateStr];
        
        if (dateData[user.uid]) {
          try {
            const dateRef = doc(db, "availability", dateStr);
            const docSnap = await getDoc(dateRef);
            
            if (docSnap.exists()) {
              const updatedData = docSnap.data();
              
              if (updatedData.users && updatedData.users[user.uid]) {
                updatedData.users[user.uid].userName = userName.trim();
                await setDoc(dateRef, updatedData);
                console.log(`Updated name in date: ${dateStr}`);
              }
            }
          } catch (error) {
            console.error(`Error updating name for date ${dateStr}:`, error);
          }
        }
      }
      
      setOriginalUserName(userName.trim());
      alert("Name updated successfully!");
    } catch (error) {
      console.error("Error updating user name:", error);
      alert("Failed to update name. See console for details.");
    }
  };
  
  // Save dark mode preference to user profile
  const saveDarkModePreference = async () => {
    if (!user) return;
    
    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { darkMode: darkMode }, { merge: true });
      console.log("Dark mode preference saved");
    } catch (error) {
      console.error("Error saving dark mode preference:", error);
    }
  };
  
  // Save dark mode preference when it changes
  useEffect(() => {
    if (user) {
      saveDarkModePreference();
    }
  }, [darkMode, user]);
  
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
          {/* UPDATED: Only show available count, not total */}
          {availableCount > 0 && (
            <div className="availability-count">
              {availableCount} available
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
    
    // Get all users who explicitly marked their status
    const markedUsers = Object.values(dateData);
    
    // Filter to get available users
    const availableUsers = markedUsers.filter(u => u.isAvailable);
    
    // Create the unavailable users list - include all users who either:
    // 1. Explicitly marked unavailable
    // 2. Did not mark their status at all
    let unavailableUsers = [];
    
    // First, add users who explicitly marked as unavailable
    const explicitlyUnavailableUsers = markedUsers.filter(u => !u.isAvailable);
    unavailableUsers = [...explicitlyUnavailableUsers];
    
    // Then, add users who didn't mark anything for this date
    if (allUsers.length > 0) {
      const markedUserIds = markedUsers.map(u => u.userId);
      
      // Find all users who haven't marked this date
      const unmarkedUsers = allUsers
        .filter(u => !markedUserIds.includes(u.uid))
        .map(u => ({
          userId: u.uid,
          userName: u.displayName || `User_${u.uid.slice(0, 8)}`,
          isAvailable: false,
          updatedAt: null
        }));
      
      unavailableUsers = [...unavailableUsers, ...unmarkedUsers];
    }
    
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
                  {!user.updatedAt && <span className="not-responded"> (not responded)</span>}
                </div>
              ))
            ) : (
              <p>Everyone is available!</p>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Dark mode toggle switch component
  const DarkModeToggle = () => {
    return (
      <div className="dark-mode-toggle">
        <span className="toggle-icon light">☀️</span>
        <label className="switch">
          <input 
            type="checkbox" 
            checked={darkMode} 
            onChange={toggleDarkMode}
          />
          <span className="slider round"></span>
        </label>
        <span className="toggle-icon dark">🌙</span>
      </div>
    );
  };
  
  // Render authentication forms
  const renderAuthForms = () => {
    if (!showAuth) return null;
    
    return (
      <div className="auth-overlay">
        <div className="auth-container">
          <div className="auth-tabs">
            <button 
              className={authMode === 'login' ? 'active' : ''} 
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button 
              className={authMode === 'register' ? 'active' : ''} 
              onClick={() => {
                setAuthMode('register');
                setIsNameAvailable(true); // Reset name check on tab change
              }}
            >
              Register
            </button>
            <button 
              className="close-button"
              onClick={() => setShowAuth(false)}
            >
              ✕
            </button>
          </div>
          
          <div className="auth-form-container">
            {authError && <div className="auth-error">{authError}</div>}
            
            {authMode === 'login' ? (
              <form onSubmit={loginUser} className="auth-form">
                <h2>Login</h2>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                
                <button type="submit" className="auth-button">Login</button>
              </form>
            ) : (
              <form onSubmit={registerUser} className="auth-form">
                <h2>Register</h2>
                <div className="form-group">
                  <label htmlFor="reg-name">
                    Username
                    {isNameChecking && <span className="checking-name"> (checking...)</span>}
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Choose a unique username"
                    className={!isNameAvailable ? 'input-error' : ''}
                  />
                  {!isNameAvailable && (
                    <div className="input-error-message">
                      Username is already taken
                    </div>
                  )}
                </div>
                
                <div className="form-group">
                  <label htmlFor="reg-email">Email</label>
                  <input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="reg-password">Password</label>
                  <input
                    id="reg-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                  />
                </div>
                
                <div className="form-group preference-group">
                  <label>Display Mode</label>
                  <DarkModeToggle />
                </div>
                
                <button 
                  type="submit" 
                  className="auth-button"
                  disabled={isNameChecking || !isNameAvailable}
                >
                  Register
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`app ${darkMode ? 'dark-mode' : 'light-mode'}`}>
      <header>
        <h1>Group Availability Calendar</h1>
        <div className="header-controls">
          <DarkModeToggle />
          
          {isLoggedIn ? (
            loading && !isUserProfileLoaded() ? (
              <div className="loading-profile">Loading profile...</div>
            ) : (
              <div className="user-controls">
                <div className="username-field">
                  <input 
                    type="text" 
                    value={userName} 
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Your name" 
                    className={!isNameAvailable ? 'input-error' : ''}
                  />
                  {userName !== originalUserName && (
                    <div className="name-status">
                      {isNameChecking ? (
                        <span className="checking">Checking...</span>
                      ) : !isNameAvailable ? (
                        <span className="taken">Username already taken</span>
                      ) : (
                        <span className="available">Username available</span>
                      )}
                    </div>
                  )}
                </div>
                <button 
                  onClick={updateUserName}
                  disabled={userName === originalUserName || isNameChecking || !isNameAvailable}
                >
                  Update Name
                </button>
                <button onClick={handleSignOut}>Sign Out</button>
              </div>
            )
          ) : (
            <button onClick={() => setShowAuth(true)} className="login-button">
              Login / Register
            </button>
          )}
        </div>
      </header>
      
      <main>
        {loading && isLoggedIn ? (
          <div className="loading">
            <p>Loading calendar data...</p>
            <p><small>This may take a moment if this is your first time using the app.</small></p>
          </div>
        ) : (
          <>
            {!isLoggedIn && !showAuth && (
              <div className="login-prompt">
                <p>Please <button onClick={() => setShowAuth(true)}>login or register</button> to interact with the calendar.</p>
              </div>
            )}
            
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
            
            {isLoggedIn && renderSelectedDateDetails()}
          </>
        )}
      </main>
      
      {renderAuthForms()}
      
      <footer>
        <p>
          Made with Firebase & React • 
          {isLoggedIn ? `Signed in as ${userName}` : 'Not signed in'} • 
          Current date: {new Date().toLocaleDateString()}
        </p>
      </footer>
    </div>
  );
}

export default App;