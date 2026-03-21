import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  onAuthStateChanged, 
  signInWithPopup,
  signInAnonymously,
  linkWithPopup,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export interface GameUser {
  uid: string;
  username: string;
  territories: number;
  points: number;
  level: number;
  createdAt: Timestamp | any;
  email?: string | null;
  isAnonymous: boolean;
}

/**
 * Creates a new user document in Firestore if it doesn't exist.
 */
export const createUserData = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const userData: GameUser = {
      uid: user.uid,
      username: user.displayName || `Guest_${randomId}`,
      territories: 0,
      points: 0,
      level: 1,
      createdAt: serverTimestamp(),
      email: user.email,
      isAnonymous: user.isAnonymous
    };
    await setDoc(userRef, userData);
    return userData;
  }
  return userSnap.data() as GameUser;
};

/**
 * Fetches user data from Firestore.
 */
export const getUserData = async (uid: string): Promise<GameUser | null> => {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as GameUser;
  }
  return null;
};

/**
 * Signs in anonymously (Guest Login).
 */
export const loginAnonymously = async () => {
  try {
    const credential = await signInAnonymously(auth);
    return await createUserData(credential.user);
  } catch (error: any) {
    console.error("Anonymous Sign-In Error:", error.code, error.message);
    throw error;
  }
};

/**
 * Signs in with Google or links an existing anonymous account to Google.
 */
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      // Link anonymous account to Google
      const credential = await linkWithPopup(auth.currentUser, provider);
      
      // Update Firestore doc to reflect new info but keep game progress
      const userRef = doc(db, 'users', credential.user.uid);
      await setDoc(userRef, {
        email: credential.user.email,
        isAnonymous: false,
        // We don't overwrite username unless it's still a Guest name
        ...(credential.user.displayName && !auth.currentUser.displayName ? { username: credential.user.displayName } : {})
      }, { merge: true });
      
      return await getUserData(credential.user.uid);
    } else {
      // Normal Google Sign-In
      const credential = await signInWithPopup(auth, provider);
      return await createUserData(credential.user);
    }
  } catch (error: any) {
    console.error("Google Sign-In/Link Error:", error.code, error.message);
    
    // Fallback for blocked popups
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      console.warn("Popup blocked, falling back to redirect (Note: linking might not work via redirect as easily).");
      await signInWithRedirect(auth, provider);
    } else {
      throw error;
    }
  }
};

export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      return await createUserData(result.user);
    }
    return null;
  } catch (error: any) {
    console.error("Redirect Result Error:", error.code, error.message);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
