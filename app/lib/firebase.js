


// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// import { getFirestore } from "firebase/firestore"; // <-- add Firestore
// import { getAuth } from "firebase/auth"; // <-- optional if you need Auth

// const firebaseConfig = {
//   apiKey: "AIzaSyC-XP7J5-bCMCBhFo7RvQWB909HYXAD90Y",
//   authDomain: "vsystem-2d0c3.firebaseapp.com",
//   projectId: "vsystem-2d0c3",
//   storageBucket: "vsystem-2d0c3.firebasestorage.app",
//   messagingSenderId: "87982211879",
//   appId: "1:87982211879:web:07974f644611f000b81f02",
//   measurementId: "G-198CHHNLCF"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

// // Initialize services
// export const db = getFirestore(app);  // <-- export Firestore
// export const auth = getAuth(app);     // <-- export Auth if needed
// export default app;                   // optional default export




// app/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA-44DQ0o492HsxqDkH6kvy6H08OMMBNMU",
  authDomain: "axion256system.firebaseapp.com",
  projectId: "axion256system",
  storageBucket: "axion256system.firebasestorage.app",
  messagingSenderId: "718860459380",
  appId: "1:718860459380:web:275f372555ebb726f12021",
  measurementId: "G-QTBDXPXRY4"
};


// Initialize Firebase app (safe on server & client)
const app = initializeApp(firebaseConfig);

// Initialize Firestore & Auth (safe everywhere)
export const db = getFirestore(app);
export const auth = getAuth(app);

// Initialize Analytics ONLY on client
export let analytics;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    analytics = getAnalytics(app);
  });
}

export default app;
