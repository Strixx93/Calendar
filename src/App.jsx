// FIXED: Get user profile from Firestore without unnecessary error messages
const getUserProfile = async (userId) => {
  try {
    console.log(`Fetching user profile for ID: ${userId}`);
    setLoading(true);
    setProfileError(null); // Clear any previous errors
    
    // Try to get session-stored username first for immediate display
    const sessionUserName = sessionStorage.getItem(`userName_${userId}`);
    if (sessionUserName) {
      console.log("Using session-stored username while loading from database:", sessionUserName);
      setUserName(sessionUserName);
      setOriginalUserName(sessionUserName);
    }
    
    // Get user profile directly from Firestore (primary source)
    const userRef = doc(db, "users", userId);
    
    const docSnap = await getDoc(userRef).catch(error => {
      console.error("Error getting document:", error);
      // Don't show error to user if we have session data
      if (!sessionUserName) {
        throw new Error("Failed to fetch profile from database");
      }
      return null;
    });
    
    // If we couldn't get the document but have session data, just use that
    if (!docSnap && sessionUserName) {
      return true;
    }
    
    if (docSnap && docSnap.exists()) {
      const userData = docSnap.data();
      console.log("Loaded user data:", userData);
      
      // If we have a displayName in the profile, use it
      if (userData && userData.displayName) {
        // Store displayName in sessionStorage for quick access after refreshes
        sessionStorage.setItem(`userName_${userId}`, userData.displayName);
        
        console.log("Using profile name from database:", userData.displayName);
        setUserName(userData.displayName);
        setOriginalUserName(userData.displayName);
        
        // Load dark mode preference
        if (userData.darkMode !== undefined) {
          setDarkMode(userData.darkMode);
        }
        
        return true; // Successfully loaded profile
      }
      
      // Even if displayName is missing, if we have session data, use it
      if (sessionUserName) {
        console.log("Profile missing displayName, using session data instead");
        return true;
      }
    }
    
    // If we get here with session data, just use that
    if (sessionUserName) {
      return true;
    }
    
    // Only show an error if we have no data at all
    console.error("Could not load profile data from any source");
    setProfileError("Unable to load your profile. Please sign out and back in.");
    return false;
  } catch (error) {
    console.error("Error loading user profile:", error);
    
    // If we have a session-stored username, keep using it despite the error
    const sessionUserName = sessionStorage.getItem(`userName_${userId}`);
    if (sessionUserName) {
      console.log("Using session-stored username after error:", sessionUserName);
      setUserName(sessionUserName);
      setOriginalUserName(sessionUserName);
      return true;
    }
    
    // Only show an error if we couldn't recover
    setProfileError("Failed to load your profile. Please try refreshing the page.");
    return false;
  } finally {
    setLoading(false);
  }
};