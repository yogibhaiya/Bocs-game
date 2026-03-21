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
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBP3agQnwfoW3sqbByqt9ubEMIhHWDtijU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-3860950835-47901.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studio-3860950835-47901",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studio-3860950835-47901.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "326892559750",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:326892559750:web:889b19a7ce0b52730e6007",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://studio-3860950835-47901-default-rtdb.asia-southeast1.firebasedatabase.app"
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
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
  }

  if (!userSnap?.exists()) {
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

    try {
      await setDoc(userRef, userData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
    }
    return userData;
  }

  return userSnap.data() as GameUser;
};

export const getUserData = async (uid: string): Promise<GameUser | null> => {
  const userRef = doc(db, 'users', uid);
  try {
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as GameUser;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
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

      try {
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
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${credential.user.uid}`);
      }

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