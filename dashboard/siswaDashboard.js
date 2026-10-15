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
    listenSimulationReports(user.uid);
    listenPendingExercises(user.uid);
    listenActiveSimulations(user.uid);
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

  if (document.getElementById("headerNameHeader")) document.getElementById("headerNameHeader").innerText = name;
  if (document.getElementById("headerAvatarHeader")) document.getElementById("headerAvatarHeader").src = avatar;
  if (document.getElementById("headerSchoolName")) document.getElementById("headerSchoolName").innerText = schoolName;
  if (document.getElementById("headerSchoolLogo")) document.getElementById("headerSchoolLogo").src = schoolLogo;

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
      const fullySubmittedExerciseIds = new Set();
      const inProgressExerciseIds = new Set();

      subSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.submittedAt) {
          fullySubmittedExerciseIds.add(data.exerciseId);
        } else {
          inProgressExerciseIds.add(data.exerciseId);
        }
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

        if (fullySubmittedExerciseIds.has(exerciseId)) continue;

        let isExpired = false;
        let deadlineString = "Waktu fleksibel";
        if (assign.deadlineDate && assign.deadlineTime) {
          const deadlineTarget = new Date(`${assign.deadlineDate}T${assign.deadlineTime}:00`);
          if (sekarang > deadlineTarget) isExpired = true;
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
        const statusLabel = inProgressExerciseIds.has(exerciseId) 
          ? `<span style="color: var(--warning); font-weight: 600;">⚠️ Sedang Dikerjakan</span>` 
          : `<span style="color: var(--primary); font-weight: 600;">📌 Belum Dikerjakan</span>`;

        pendingHtml += `
          <div class="task-alert-item">
            <div style="min-width: 0; flex: 1; padding-right: 8px;">
              <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">📝 ${exerciseTitle}</div>
              <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                ${statusLabel}
                <span>•</span>
                <span>⏱ Batas: <strong style="color: var(--text-main);">${deadlineString}</strong></span>
              </div>
            </div>
            <button class="btn-work" onclick="openExerciseFromDashboard('${exerciseId}')">Lanjutkan ➔</button>
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

// ==========================
// REAL-TIME ACTIVE SIMULATIONS (SIMULASI UJIAN)
// ==========================
async function listenActiveSimulations(studentUid) {
  const cardSection = document.getElementById("pendingSimulationsCard");
  const container = document.getElementById("pendingSimulationsContainer");
  const badgeEl = document.getElementById("pendingSimulationBadgeCount");
  if (!container || !cardSection) return;

  try {
    const studentDocSnap = await getDoc(doc(db, "students", studentUid));
    if (!studentDocSnap.exists()) return;
    const studentData = studentDocSnap.data();
    const classId = studentData.classId;
    const schoolId = studentData.schoolId;
    if (!classId || !schoolId) return;

    const subQuery = query(
      collection(dbSecondary, "student_simulation_submissions"),
      where("studentUid", "==", studentUid)
    );

    onSnapshot(subQuery, async (subSnap) => {
      const completedSimulationIds = new Set();
      subSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.submittedAt) {
          completedSimulationIds.add(data.simulationId);
        }
      });

      const simGuruQuery = query(
        collection(db, "simulationGuru"),
        where("classId", "==", classId),
        where("schoolId", "==", schoolId),
        where("isAssigned", "==", true)
      );
      const simGuruSnap = await getDocs(simGuruQuery);

      let simulationHtml = "";
      let activeCount = 0;

      for (const d of simGuruSnap.docs) {
        const assign = d.data();
        const simulationId = assign.simulationId;

        if (completedSimulationIds.has(simulationId)) continue;

        let simTitle = "Simulasi Ujian";
        let simSubject = "-";
        let simDuration = 60;
        let simQuestionsCount = 0;

        const simSnap = await getDoc(doc(db, "simulations", simulationId));
        if (simSnap.exists()) {
          const simData = simSnap.data();
          simTitle = simData.title || simTitle;
          simSubject = simData.subject || simSubject;
          simDuration = simData.durationMinutes || 60;
          simQuestionsCount = (simData.questions || []).length;
        }

        activeCount++;
        simulationHtml += `
          <div class="task-alert-item" style="border-left-color: #2563eb;">
            <div style="min-width: 0; flex: 1; padding-right: 8px;">
              <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">🎯 ${simTitle}</div>
              <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                <span style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${simSubject}</span>
                <span>•</span>
                <span>⏱ Durasi: <strong>${simDuration} Menit</strong></span>
                <span>•</span>
                <span>📝 <strong>${simQuestionsCount} Soal</strong></span>
              </div>
            </div>
            <button class="btn-work" style="background: #dbeafe; color: #1e40af;" onclick="openSimulationFromDashboard('${simulationId}')">Mulai Ujian ➔</button>
          </div>
        `;
      }

      if (badgeEl) badgeEl.innerText = `${activeCount} Simulasi`;

      if (activeCount > 0) {
        cardSection.style.display = "block";
        container.innerHTML = simulationHtml;
      } else {
        cardSection.style.display = "none";
      }
    });

  } catch (err) {
    console.error("Gagal memuat daftar simulasi siswa:", err);
  }
}

window.openExerciseFromDashboard = (id) => {
  const win = window.open(`https://lmskebunilmu.github.io/LMS/modules/materials-siswa/exercise.html?id=${id}`, "_blank");
  if (!win) alert("Pop-up diblokir browser!");
};

window.openSimulationFromDashboard = (id) => {
  const win = window.open(`https://lmskebunilmu.github.io/LMS/modules/materials-siswa/simulation-runner.html?id=${id}`, "_blank");
  if (!win) alert("Pop-up diblokir browser!");
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
    let html = "";
    let completedCount = 0;
    let scoresSum = 0;

    snap.forEach(docSnap => {
      const sub = docSnap.data();
      if (sub.submittedAt) {
        completedCount++;
        scoresSum += (sub.score || 0);
      }
    });

    if (completedCount === 0) {
      container.innerHTML = `<div class="empty-state">Belum ada latihan atau tugas yang dikirim ke guru.</div>`;
      totalCompletedCount = 0;
      totalScoresSum = 0;
      updateStatsUI();
      return;
    }

    for (const docSnap of snap.docs) {
      const sub = docSnap.data();
      if (!sub.submittedAt) continue;

      const score = sub.score || 0;
      let exerciseTitle = "Latihan / Tugas";
      try {
        const exSnap = await getDoc(doc(db, "exercises", sub.exerciseId));
        if (exSnap.exists()) exerciseTitle = exSnap.data().title || exerciseTitle;
      } catch (e) { console.error(e); }

      const isExcellent = score >= 75;
      const isGood = score >= 60 && score < 75;
      const scoreColor = isExcellent ? "#059669" : isGood ? "#d97706" : "#dc2626";
      const scoreBg = isExcellent ? "#ecfdf5" : isGood ? "#fffbeb" : "#fef2f2";

      let dateStr = "-";
      if (sub.submittedAt?.toDate) {
        dateStr = sub.submittedAt.toDate().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      html += `
        <div class="report-item" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:16px; margin-bottom:12px;">
          <div>
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">📝 ${exerciseTitle}</div>
            <div style="font-size: 12px; color: var(--text-muted);">📅 ${dateStr} • Benar: <strong>${sub.correctAnswers || 0}/${sub.totalQuestions || 0}</strong> soal</div>
          </div>
          <div style="background: ${scoreBg}; color: ${scoreColor}; padding: 6px 16px; border-radius: 12px; font-weight: 800; font-size: 15px; border: 1px solid ${scoreColor}33;">
            ⭐ ${score}
          </div>
        </div>
      `;
    }

    totalCompletedCount = completedCount;
    totalScoresSum = scoresSum;
    updateStatsUI();
    container.innerHTML = html;
  });
}

// ==========================
// REAL-TIME SIMULATION REPORTS (REKAP NILAI SIMULASI)
// ==========================
function listenSimulationReports(studentUid) {
  const container = document.getElementById("simulationReportContainer");
  if (!container) return;

  const q = query(
    collection(dbSecondary, "student_simulation_submissions"),
    where("studentUid", "==", studentUid)
  );

  onSnapshot(q, async (snap) => {
    let html = "";
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state">Belum ada simulasi ujian yang diselesaikan.</div>`;
      return;
    }

    snap.forEach(docSnap => {
      const sub = docSnap.data();
      if (!sub.submittedAt) return;

      const score = sub.score || 0;
      const title = sub.simulationTitle || "Simulasi Ujian";
      const subject = sub.subject || "-";
      
      const isExcellent = score >= 75;
      const isGood = score >= 60 && score < 75;
      const scoreColor = isExcellent ? "#059669" : isGood ? "#d97706" : "#dc2626";
      const scoreBg = isExcellent ? "#ecfdf5" : isGood ? "#fffbeb" : "#fef2f2";

      let dateStr = "-";
      if (sub.submittedAt?.toDate) {
        dateStr = sub.submittedAt.toDate().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      html += `
        <div class="report-item" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:16px; margin-bottom:12px;">
          <div>
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">🎯 ${title}</div>
            <div style="font-size: 12px; color: var(--text-muted); display:flex; gap:6px; align-items:center;">
              <span style="background:#eff6ff; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-weight:600;">${subject}</span>
              <span>•</span>
              <span>📅 ${dateStr}</span>
              <span>•</span>
              <span>Benar: <strong>${sub.correctAnswers || 0}/${sub.totalQuestions || 0}</strong></span>
            </div>
          </div>
          <div style="background: ${scoreBg}; color: ${scoreColor}; padding: 6px 16px; border-radius: 12px; font-weight: 800; font-size: 15px; border: 1px solid ${scoreColor}33;">
            ⭐ ${score}
          </div>
        </div>
      `;
    });

    if (html === "") {
      container.innerHTML = `<div class="empty-state">Belum ada simulasi ujian yang diselesaikan.</div>`;
    } else {
      container.innerHTML = html;
    }
  });
}

// ==========================
// MODAL PROFIL & AUTH ACTIONS
// ==========================
window.openProfileModal = () => {
  const modal = document.getElementById("profileModal");
  if (modal) modal.style.display = "flex";
};

window.closeProfileModal = () => {
  const modal = document.getElementById("profileModal");
  if (modal) modal.style.display = "none";
};

// Menutup modal otomatis jika area luar kotak putih diklik
window.addEventListener("click", (e) => {
  const modal = document.getElementById("profileModal");
  if (e.target === modal) {
    window.closeProfileModal();
  }
});

window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;
  const nameInput = document.getElementById("profileName");
  const fileInput = document.getElementById("profileImageFile");
  const saveBtn = document.getElementById("btnSaveProfile");

  const name = nameInput ? nameInput.value.trim() : "";
  if (!name) return alert("Nama tidak boleh kosong!");

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
      if (data.secure_url) avatarURL = data.secure_url;
    }

    const profileUpdates = { displayName: name };
    if (avatarURL) profileUpdates.photoURL = avatarURL;
    await updateProfile(user, profileUpdates);

    const userUpdates = { name };
    if (avatarURL) userUpdates.avatarURL = avatarURL;
    await updateDoc(doc(db, "users", user.uid), userUpdates);

    alert("Profil berhasil diupdate!");
    window.closeProfileModal();
    if (fileInput) fileInput.value = "";
    await loadProfileHeader(user);
  } catch (err) {
    alert("Gagal update profil: " + err.message);
  } finally {
    saveBtn.innerText = "Simpan Perubahan";
    saveBtn.disabled = false;
  }
};

function lockDashboard() {
  document.querySelector(".main").innerHTML = `
    <div style="text-align:center; padding:50px;">
      <h2>🚫 Akses Ditolak</h2>
      <p>Sekolah kamu nonaktif</p>
      <button onclick="window.location='../login.html'" style="padding:10px 20px; background:#ef4444; color:white; border:none; border-radius:10px; cursor:pointer;">Logout</button>
    </div>
  `;
}

window.goMaterialsSiswa = () => window.location.href = "https://lmskebunilmu.github.io/LMS/modules/materials-siswa/materials-siswa.html";
window.logout = async () => {
  await signOut(auth);
  window.location.href = "../login.html";
};
