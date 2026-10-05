import { auth, db } from "../firebase/firebase-config.js";
import {
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDoc,
  doc,
  updateDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadLayout } from "../assets/js/components.js";

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
    await loadStudentReports(user.uid);
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

  // Isi form modal edit
  if (document.getElementById("profileName")) document.getElementById("profileName").value = name;
  if (document.getElementById("profileEmail")) document.getElementById("profileEmail").value = email;
}

// ==========================
// LOAD STUDENT REPORTS (NILAI LATIHAN)
// ==========================
async function loadStudentReports(studentUid) {
  const container = document.getElementById("reportContainer");
  if (!container) return;

  try {
    const q = query(
      collection(db, "student_submissions"),
      where("studentUid", "==", studentUid)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 13px;">Belum ada latihan atau tugas yang dikerjakan.</div>`;
      return;
    }

    let html = "";
    for (const docSnap of snap.docs) {
      const sub = docSnap.data();
      
      // Ambil judul exercise berdasarkan exerciseId
      let exerciseTitle = "Latihan / Tugas";
      try {
        const exSnap = await getDoc(doc(db, "exercises", sub.exerciseId));
        if (exSnap.exists()) {
          exerciseTitle = exSnap.data().title || exerciseTitle;
        }
      } catch (e) {
        console.error(e);
      }

      const score = sub.score || 0;
      const scoreColor = score >= 75 ? "#059669" : score >= 60 ? "#d97706" : "#dc2626";
      const scoreBg = score >= 75 ? "#ecfdf5" : score >= 60 ? "#fffbeb" : "#fef2f2";

      let dateStr = "-";
      if (sub.submittedAt?.toDate) {
        dateStr = sub.submittedAt.toDate().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      html += `
        <div class="report-item">
          <div>
            <div style="font-weight: 600; font-size: 14px; color: var(--text-main); margin-bottom: 2px;">📝 ${exerciseTitle}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Dikumpulkan: ${dateStr} • Benar: ${sub.correctAnswers || 0}/${sub.totalQuestions || 0} soal</div>
          </div>
          <div style="background: ${scoreBg}; color: ${scoreColor}; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 14px; border: 1px solid ${scoreColor}22;">
            ${score}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error("Gagal memuat report nilai:", err);
    container.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px; font-size: 13px;">Gagal memuat riwayat nilai.</div>`;
  }
}

// ==========================
// MODAL PROFIL & PASSWORD
// ==========================
window.openProfileModal = () => document.getElementById("profileModal")?.classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal")?.classList.remove("active");

window.openPasswordModal = () => document.getElementById("passwordModal")?.classList.add("active");
window.closePasswordModal = () => document.getElementById("passwordModal")?.classList.remove("active");

window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();

  if (!name || !email) {
    alert("Isi semua data!");
    return;
  }

  try {
    await updateProfile(user, { displayName: name });
    if (email !== user.email) {
      await updateEmail(user, email);
    }
    await updateDoc(doc(db, "users", user.uid), { name, email });

    alert("Profil berhasil diupdate!");
    closeProfileModal();
    loadProfileHeader(user);
  } catch (err) {
    console.error(err);
    alert("Gagal update profil: " + err.message);
  }
};

window.updatePasswordAccount = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const newPass = document.getElementById("newPassword").value.trim();
  if (!newPass || newPass.length < 6) {
    alert("Password minimal 6 karakter!");
    return;
  }

  try {
    await updatePassword(user, newPass);
    alert("Password berhasil diubah!");
    document.getElementById("newPassword").value = "";
    closePasswordModal();
  } catch (err) {
    console.error(err);
    alert("Gagal mengubah password (silakan login ulang jika sesi habis): " + err.message);
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

window.goMaterialsSiswa = () => window.location.href = "./materials-siswa.html";
window.logout = async () => {
  await signOut(auth);
  window.location.href = "../login.html";
};
