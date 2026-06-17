import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAfr7FpTsryoepVT-KGPG9BaXH6rNWnljk",
  authDomain: "zoom-react-90783.firebaseapp.com",
  projectId: "zoom-react-90783",
  storageBucket: "zoom-react-90783.firebasestorage.app",
  messagingSenderId: "96229273583",
  appId: "1:96229273583:web:b708aecc9e79670c83501a",
  measurementId: "G-T759RYWQ86",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
