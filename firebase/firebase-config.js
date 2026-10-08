// firebase/firebase-config.js

// Import Firebase (versi CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// 1. Konfigurasi Firebase UTAMA (lms-kebun-ilmu-2026) -> Tempat Ambil Soal & Auth Siswa
const firebaseConfig = {
  apiKey: "AIzaSyC-HzamjP9H8bZbTbsiYjdXutpx9Y6AbQM",
  authDomain: "lms-kebun-ilmu-2026.firebaseapp.com",
  projectId: "lms-kebun-ilmu-2026",
  storageBucket: "lms-kebun-ilmu-2026.firebasestorage.app",
  messagingSenderId: "921557086874",
  appId: "1:921557086874:web:91a67a58044ca02e3a2523",
  measurementId: "G-EZ12LWMZF8"
};

// 2. Konfigurasi Firebase KEDUA (ulangansains2025) -> Tempat Kirim Nilai / Submission
const secondaryFirebaseConfig = {
  apiKey: "AIzaSyAREhPCc4WaFVecQN2_Lu4eoK0oXohZ7Fg",
  authDomain: "ulangansains2025.firebaseapp.com",
  databaseURL: "https://ulangansains2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ulangansains2025",
  storageBucket: "ulangansains2025.firebasestorage.app",
  messagingSenderId: "514614164498",
  appId: "1:514614164498:web:324090f888d301e831accb",
  measurementId: "G-Y7027DY382"
};

// Inisialisasi Firebase Utama
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Inisialisasi Firebase Kedua (Wajib pakai nama unik "secondaryApp")
const secondaryApp = initializeApp(secondaryFirebaseConfig, "secondaryApp");
const dbSecondary = getFirestore(secondaryApp);

// Export supaya bisa dipakai file lain secara bersamaan
export { auth, db, storage, dbSecondary };
