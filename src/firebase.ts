import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
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

const firebaseConfig = {
  apiKey: "AIzaSyBp3agQnwfoW3sqbByqt9ubEMIHwDtiJUs",
  authDomain: "studio-3860950835-47901.firebaseapp.com",
  projectId: "studio-3860950835-47901",
  storageBucket: "studio-3860950835-47901.firebasestorage.app",
  messagingSenderId: "326892559750",
  appId: "1:326892559750:web:889b19a7ce0b52730e6007",
  databaseURL: "https://studio-3860950835-47901-default-rtdb.firebaseio.com"
};

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔥 Auth (IMPORTANT: pass app)
export const auth = getAuth(app);

// 🔥 Firestore (FIXED ❗ no databaseId)
export const db = getFirestore(app);

// ================= TYPES =================

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

// ================= USER DATA =================

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

export const getUserData = async (uid: string): Promise<GameUser | null> => {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as GameUser;
  }

  return null;
};

// ================= AUTH =================

// 🎮 Guest Login
export const loginAnonymously = async () => {
  try {
    const credential = await signInAnonymously(auth);
    return await createUserData(credential.user);
  } catch (error: any) {
    console.error("Anonymous Login Error:", error.code, error.message);
    throw error;
  }
};

// 🔐 Google Login + Link
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      // 🔗 Link guest → Google
      const credential = await linkWithPopup(auth.currentUser, provider);

      const userRef = doc(db, 'users', credential.user.uid);

      await setDoc(
        userRef,
        {
          email: credential.user.email,
          isAnonymous: false,
          ...(credential.user.displayName &&
          !auth.currentUser.displayName
            ? { username: credential.user.displayName }
            : {})
        },
        { merge: true }
      );

      return await getUserData(credential.user.uid);
    } else {
      // Normal login
      const credential = await signInWithPopup(auth, provider);
      return await createUserData(credential.user);
    }
  } catch (error: any) {
    console.error("Google Login Error:", error.code, error.message);

    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, provider);
    } else {
      throw error;
    }
  }
};

// 🔁 Redirect handler
export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);

    if (result) {
      return await createUserData(result.user);
    }

    return null;
  } catch (error: any) {
    console.error("Redirect Error:", error.code, error.message);
    throw error;
  }
};

// 🚪 Logout
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
};