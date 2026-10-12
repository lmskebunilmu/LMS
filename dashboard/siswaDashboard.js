import { auth, db, dbSecondary } from "../firebase/firebase-config.js";
import {
  onAuthStateChanged,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDoc,
  doc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadLayout } from "../assets/js/components.js";

const CLOUDINARY_CLOUD_NAME = "djlvnubgn";
const CLOUDINARY_UPLOAD_PRESET = "lms_unsigned";

// Global cache untuk statistik
let totalCompletedCount = 0;
let totalPendingCount = 0;
let totalScoresSum = 0;

function updateStatsUI() {
  const elCompleted = document.getElementById("statCompleted");
  const elPending = document.getElementById("statPending");
  const elAvgScore = document.getElementById("statAvgScore");

  if (elCompleted) elCompleted.innerText = totalCompletedCount;
  if (elPending) elPending.innerText = totalPendingCount;

  if (elAvgScore) {
    if (totalCompletedCount > 0) {
      const avg = Math.round(totalScoresSum / totalCompletedCount);
      elAvgScore.innerText = avg;
    } else {
      elAvgScore.innerText = "0";
    }
  }
}

// ==========================
// AUTH STATE
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "../login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      alert("User tidak ditemukan");
      window.location = "../login.html";
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== "siswa") {
      alert("Akses hanya untuk siswa");
      window.location = "../login.html";
      return;
    }

    await loadLayout("siswa");
    await waitForHeader();
    await loadProfileHeader(user);
    
    listenStudentReports(user.uid);
    listenPendingExercises(user.uid);
  } catch (err) {
    console.error(err);
  }
});

function waitForHeader() {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const el = document.getElementById("headerAvatarHeader");
      if (el) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

// ==========================
// LOAD PROFILE + SEKOLAH
// ==========================
async function loadProfileHeader(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const name = data.name || user.displayName || "Siswa";
  const email = data.email || user.email;
  const avatar = data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
  const schoolId = data.schoolId || null;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if (schoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", schoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      if (schoolData.status !== "aktif") {
        alert("Sekolah nonaktif");
        lockDashboard();
        return;
      }
      schoolName = schoolData.name || "-";
      schoolLogo = schoolData.logoURL || schoolLogo;
    }
  }

  // Header Layout
  if (document.getElementById("headerNameHeader")) document.getElementById("headerNameHeader").innerText = name;
  if (document.getElementById("headerAvatarHeader")) document.getElementById("headerAvatarHeader").src = avatar;
  if (document.getElementById("headerSchoolName")) document.getElementById("headerSchoolName").innerText = schoolName;
  if (document.getElementById("headerSchoolLogo")) document.getElementById("headerSchoolLogo").src = schoolLogo;

  // Profile Card
  if (document.getElementById("headerNameCard")) document.getElementById("headerNameCard").innerText = name;
  if (document.getElementById("headerEmailCard")) document.getElementById("headerEmailCard").innerText = email;
  if (document.getElementById("headerAvatarCard")) document.getElementById("headerAvatarCard").src = avatar;
  if (document.getElementById("headerSchoolCard")) document.getElementById("headerSchoolCard").innerText = `🏫 ${schoolName}`;

  if (document.getElementById("profileName")) document.getElementById("profileName").value = name;
}

// ==========================
// REAL-TIME PENDING EXERCISES (TUGAS AKTIF)
// ==========================
async function listenPendingExercises(studentUid) {
  const cardSection = document.getElementById("pendingTasksCard");
  const container = document.getElementById("pendingTasksContainer");
  const badgeEl = document.getElementById("pendingBadgeCount");
  if (!container || !cardSection) return;

  try {
    const studentDocSnap = await getDoc(doc(db, "students", studentUid));
    if (!studentDocSnap.exists()) return;
    const classId = studentDocSnap.data().classId;
    const schoolId = studentDocSnap.data().schoolId;
    if (!classId || !schoolId) return;

    const subQuery = query(
      collection(dbSecondary, "student_submissions"),
      where("studentUid", "==", studentUid)
    );

    onSnapshot(subQuery, async (subSnap) => {
      const submittedExerciseIds = new Set();
      subSnap.forEach(docSnap => {
        submittedExerciseIds.add(docSnap.data().exerciseId);
      });

      const exGuruQuery = query(
        collection(db, "exerciseGuru"),
        where("classId", "==", classId),
        where("schoolId", "==", schoolId),
        where("isAssigned", "==", true)
      );
      const exGuruSnap = await getDocs(exGuruQuery);

      let pendingHtml = "";
      let pendingCount = 0;
      const sekarang = new Date();

      for (const d of exGuruSnap.docs) {
        const assign = d.data();
        const exerciseId = assign.exerciseId;

        if (submittedExerciseIds.has(exerciseId)) continue;

        let isExpired = false;
        let deadlineString = "Waktu fleksibel";
        if (assign.deadlineDate && assign.deadlineTime) {
          const deadlineTarget = new Date(`${assign.deadlineDate}T${assign.deadlineTime}:00`);
          if (sekarang > deadlineTarget) {
            isExpired = true;
          }
          const tanggalRapi = new Date(assign.deadlineDate).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
          deadlineString = `${tanggalRapi} - ${assign.deadlineTime} WIB`;
        }

        if (isExpired) continue;

        let exerciseTitle = "Latihan / Tugas";
        const exSnap = await getDoc(doc(db, "exercises", exerciseId));
        if (exSnap.exists()) {
          exerciseTitle = exSnap.data().title || exerciseTitle;
        }

        pendingCount++;
        // Menggunakan word-break & overflow-wrap agar teks judul panjang wrap rapi ke bawah
        pendingHtml += `
          <div class="task-alert-item">
            <div style="min-width: 0; flex: 1; padding-right: 8px;">
              <div style="font-weight: 700; font-size: 14px; color: var(--text-main); word-break: break-word; overflow-wrap: break-word; margin-bottom: 4px;">📝 ${exerciseTitle}</div>
              <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                <span>⏱ Batas:</span> <span style="font-weight: 500; color: var(--text-main);">${deadlineString}</span>
              </div>
            </div>
            <button class="btn-work" onclick="openExerciseFromDashboard('${exerciseId}')">Kerjakan ➔</button>
          </div>
        `;
      }

      totalPendingCount = pendingCount;
      updateStatsUI();

      if (badgeEl) badgeEl.innerText = `${pendingCount} Tugas`;

      if (pendingCount > 0) {
        cardSection.style.display = "block";
        container.innerHTML = pendingHtml;
      } else {
        cardSection.style.display = "none";
      }
    });

  } catch (err) {
    console.error("Gagal memuat tugas aktif:", err);
  }
}

window.openExerciseFromDashboard = (id) => {
  const win = window.open(`https://lmskebunilmu.github.io/LMS/modules/materials-siswa/exercise.html?id=${id}`, "_blank");
  if (!win) {
    alert("Pop-up diblokir browser! Izinkan pop-up untuk mengerjakan latihan.");
  }
};

// ==========================
// REAL-TIME STUDENT REPORTS (NILAI LATIHAN)
// ==========================
function listenStudentReports(studentUid) {
  const container = document.getElementById("reportContainer");
  if (!container) return;

  const q = query(
    collection(dbSecondary, "student_submissions"),
    where("studentUid", "==", studentUid)
  );

  onSnapshot(q, async (snap) => {
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state">Belum ada latihan atau tugas yang dikerjakan.</div>`;
      totalCompletedCount = 0;
      totalScoresSum = 0;
      updateStatsUI();
      return;
    }

    let html = "";
    let completedCount = 0;
    let scoresSum = 0;

    for (const docSnap of snap.docs) {
      const sub = docSnap.data();
      completedCount++;
      
      const score = sub.score || 0;
      scoresSum += score;

      let exerciseTitle = "Latihan / Tugas";
      try {
        const exSnap = await getDoc(doc(db, "exercises", sub.exerciseId));
        if (exSnap.exists()) {
          exerciseTitle = exSnap.data().title || exerciseTitle;
        }
      } catch (e) {
        console.error(e);
      }

      const isExcellent = score >= 75;
      const isGood = score >= 60 && score < 75;
      
      const scoreColor = isExcellent ? "#059669" : isGood ? "#d97706" : "#dc2626";
      const scoreBg = isExcellent ? "#ecfdf5" : isGood ? "#fffbeb" : "#fef2f2";

      let dateStr = "-";
      if (sub.submittedAt?.toDate) {
        dateStr = sub.submittedAt.toDate().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      html += `
        <div class="report-item">
          <div style="min-width: 0; flex: 1;">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; word-break: break-word; overflow-wrap: break-word;">
              <span>📝</span> ${exerciseTitle}
            </div>
            <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
              <span>📅 ${dateStr}</span>
              <span>•</span>
              <span>Benar: <strong style="color: var(--text-main);">${sub.correctAnswers || 0}/${sub.totalQuestions || 0}</strong> soal</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="background: ${scoreBg}; color: ${scoreColor}; padding: 6px 16px; border-radius: 12px; font-weight: 800; font-size: 15px; border: 1px solid ${scoreColor}33; display: flex; align-items: center; gap: 4px;">
              <span>⭐</span> ${score}
            </div>
          </div>
        </div>
      `;
    }

    totalCompletedCount = completedCount;
    totalScoresSum = scoresSum;
    updateStatsUI();

    container.innerHTML = html;
  }, (err) => {
    console.error("Gagal memuat report nilai:", err);
    container.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px; font-size: 13px;">Gagal memuat riwayat nilai.</div>`;
  });
}

// ==========================
// MODAL PROFIL
// ==========================
window.openProfileModal = () => document.getElementById("profileModal")?.classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal")?.classList.remove("active");

window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("profileName").value.trim();
  const fileInput = document.getElementById("profileImageFile");
  const saveBtn = document.getElementById("btnSaveProfile");

  if (!name) {
    alert("Nama tidak boleh kosong!");
    return;
  }

  try {
    saveBtn.innerText = "Menyimpan...";
    saveBtn.disabled = true;

    let avatarURL = null;

    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (data.secure_url) {
        avatarURL = data.secure_url;
      } else {
        throw new Error("Gagal mengunggah foto ke Cloudinary.");
      }
    }

    const profileUpdates = { displayName: name };
    if (avatarURL) profileUpdates.photoURL = avatarURL;
    await updateProfile(user, profileUpdates);

    const userDocRef = doc(db, "users", user.uid);
    const userUpdates = { name };
    if (avatarURL) userUpdates.avatarURL = avatarURL;
    await updateDoc(userDocRef, userUpdates);

    alert("Profil berhasil diupdate!");
    closeProfileModal();
    fileInput.value = "";
    await loadProfileHeader(user);
  } catch (err) {
    console.error(err);
    alert("Gagal update profil: " + err.message);
  } finally {
    saveBtn.innerText = "Simpan Perubahan";
    saveBtn.disabled = false;
  }
};

function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="text-align:center; padding:50px;">
      <h2>🚫 Akses Ditolak</h2>
      <p>Sekolah kamu nonaktif</p>
      <button onclick="window.location='../login.html'" style="padding:10px 20px; background:#ef4444; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:600;">Logout</button>
    </div>
  `;
}

window.goMaterialsSiswa = () => window.location.href = "https://lmskebunilmu.github.io/LMS/modules/materials-siswa/materials-siswa.html";

window.logout = async () => {
  await signOut(auth);
  window.location.href = "../login.html";
};
