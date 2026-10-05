import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithRedirect,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail,
    onAuthStateChanged, 
    signOut 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    addDoc, 
    serverTimestamp, 
    updateDoc, 
    increment, 
    limit, 
    deleteDoc 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

// Configuration from firebase-applet-config.json
const firebaseConfig = {
    projectId: "learnlynk1",
    appId: "1:507980129773:web:06532e31b0a7dbf6e173e4",
    apiKey: "AIzaSyBxnfxEw__3WptO44bWVzhenUVGc26wkG0",
    authDomain: "learnlynk1.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-c1a91b6b-aa1d-490b-9fb7-d1e935b671c1",
    messagingSenderId: "507980129773"
};

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Email & Password Auth Helpers
export const loginWithEmail = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email.trim(), password);
};

export const signupWithEmail = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName && cred.user) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    return cred;
};

export const resetPassword = async (email) => {
    return await sendPasswordResetEmail(auth, email.trim());
};

// Google Auth Helper with Popup Block Fallback
export const loginWithGoogle = async () => {
    try {
        return await signInWithPopup(auth, googleProvider);
    } catch (error) {
        const isPopupBlocked = error?.code === 'auth/popup-blocked' ||
            error?.message?.includes('popup-blocked') ||
            error?.message?.includes('popup');
            
        if (isPopupBlocked) {
            console.warn('Popup blocked, attempting redirect sign-in...');
            try {
                return await signInWithRedirect(auth, googleProvider);
            } catch (redirErr) {
                console.warn('Redirect sign-in failed:', redirErr);
            }
        }
        throw error;
    }
};

export const logout = () => signOut(auth);

export { 
    onAuthStateChanged,
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    addDoc, 
    serverTimestamp, 
    updateDoc, 
    increment, 
    limit, 
    deleteDoc 
};
