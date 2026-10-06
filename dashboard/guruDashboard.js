import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged, updateProfile, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { loadLayout } from "/LMS/assets/js/components.js";
window.loadLayout = loadLayout;

let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "/LMS/assets/images/default-logo.png";

// Variabel Global Data Laporan
let globalMasterData = [];
let globalClassesMap = {};
let globalExercisesMap = {};
let currentStatusFilter = 'all';

// ==========================
// AUTH + INITIALIZATION
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "/LMS/login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      alert("User tidak ditemukan");
      window.location = "/LMS/login.html";
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== "guru") {
      alert("Akses ditolak! Halaman ini khusus peran Guru.");
      window.location = "/LMS/login.html";
      return;
    }

    const teacherSnap = await getDoc(doc(db, "teachers", user.uid));
    if (teacherSnap.exists() && teacherSnap.data().status === "nonaktif") {
      document.querySelector(".main").innerHTML = `
        <div style="text-align:center; margin-top:100px;">
          <h1 style="color:red;">🚫 Akun Dinonaktifkan</h1>
          <p>Hubungi admin sekolah untuk mengaktifkan kembali akun Anda.</p>
          <button onclick="window.location='/LMS/login.html'" class="btn-edit" style="margin-top:15px;">Kembali ke Login</button>
        </div>
      `;
      return;
    }

    currentSchoolId = userData.schoolId || null;
    window.role = userData.role;

    if (window.loadLayout) {
      await window.loadLayout(window.role);
    }

    await loadProfileHeader(userData);
    await loadExerciseReports(user);
    await loadClassWithStudents(user);

  } catch (err) {
    console.error("Gagal melakukan inisialisasi dashboard guru:", err);
  }
});

// ==========================
// LOAD PROFILE HEADER & CARD
// ==========================
async function loadProfileHeader(userData) {
  const name = userData.name || "Guru";
  const email = userData.email || "";
  const avatar = userData.avatarURL || "/LMS/assets/images/default-avatar.png";

  const nameEl = document.getElementById("headerNameHeader");
  if (nameEl) nameEl.innerText = name;

  const avatarEl = document.getElementById("headerAvatarHeader");
  if (avatarEl) avatarEl.src = avatar;

  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      
      if (schoolData.status !== "aktif") {
        lockDashboard();
        return;
      }

      currentSchoolRef = schoolSnap.ref;
      currentSchoolName = schoolData.name || "-";
      currentSchoolLogo = schoolData.logoURL || "/LMS/assets/images/default-logo.png";
    }
  }

  const schoolNameEl = document.getElementById("headerSchoolName");
  if (schoolNameEl) schoolNameEl.innerText = currentSchoolName;

  const schoolLogoEl = document.getElementById("headerSchoolLogo");
  if (schoolLogoEl) schoolLogoEl.src = currentSchoolLogo;

  const nameCard = document.getElementById("headerNameCard");
  if (nameCard) nameCard.innerText = name;

  const emailCard = document.getElementById("headerEmailCard");
  if (emailCard) emailCard.innerText = email;

  const avatarCard = document.getElementById("headerAvatarCard");
  if (avatarCard) avatarCard.src = avatar;

  const schoolCard = document.getElementById("headerSchoolCard");
  if (schoolCard) schoolCard.innerText = currentSchoolName;

  const profileName = document.getElementById("profileName");
  if (profileName) profileName.value = name;

  const profileEmail = document.getElementById("profileEmail");
  if (profileEmail) profileEmail.value = email;
}

// ========================================================
// LOAD EXERCISE REPORTS (KHUSUS DITUGASKAN OLEH GURU INI)
// ========================================================
async function loadExerciseReports(user) {
  try {
    if (!currentSchoolId) return;

    // 1. Ambil daftar kelas yang diampu guru ini
    const qClasses = query(
      collection(db, "classes"),
      where("teacherIds", "array-contains", user.uid),
      where("schoolId", "==", currentSchoolId)
    );
    const snapClasses = await getDocs(qClasses);
    const teacherClassIds = [];
    
    const filterClassSelect = document.getElementById("filterClass");
    filterClassSelect.innerHTML = `<option value="">-- Semua Kelas yang Diampu --</option>`;

    snapClasses.forEach(cDoc => {
      const cData = cDoc.data();
      teacherClassIds.push(cDoc.id);
      globalClassesMap[cDoc.id] = cData.name || "Kelas";
      filterClassSelect.innerHTML += `<option value="${cDoc.id}">${cData.name}</option>`;
    });

    if (teacherClassIds.length === 0) {
      document.getElementById("reportTableBody").innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8;">Belum ada kelas yang diampu.</td></tr>`;
      return;
    }

    // 2. Ambil HANYA exercises yang dibuat/ditugaskan oleh guru ini (berdasarkan field teacherUid atau creatorUid, disesuaikan dengan struktur database Anda)
    // Mencoba query berdasarkan teacherUid atau creatorUid, fallback ambil semua jika field belum ada
    let qExercises = query(collection(db, "exercises"), where("teacherUid", "==", user.uid));
    let exSnap = await getDocs(qExercises);
    
    if (exSnap.empty) {
      // Coba opsi field 'creatorUid' jika 'teacherUid' kosong
      qExercises = query(collection(db, "exercises"), where("creatorUid", "==", user.uid));
      exSnap = await getDocs(qExercises);
    }

    const teacherExerciseIds = [];
    const filterExSelect = document.getElementById("filterExercise");
    filterExSelect.innerHTML = `<option value="">-- Semua Latihan --</option>`;

    exSnap.forEach(eDoc => {
      const eData = eDoc.data();
      teacherExerciseIds.push(eDoc.id);
      globalExercisesMap[eDoc.id] = eData.title || "Latihan";
      filterExSelect.innerHTML += `<option value="${eDoc.id}">${eData.title}</option>`;
    });

    if (teacherExerciseIds.length === 0) {
      document.getElementById("reportTableBody").innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8;">📭 Belum ada exercise/latihan yang Anda buat atau tugaskan.</td></tr>`;
      return;
    }

    // 3. Ambil data siswa di kelas yang diampu
    const studentsSnap = await getDocs(query(collection(db, "students"), where("schoolId", "==", currentSchoolId)));
    const studentsList = [];
    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      if (teacherClassIds.includes(sData.classId)) {
        studentsList.push({ uid: sDoc.id, name: sData.name || "Siswa", classId: sData.classId });
      }
