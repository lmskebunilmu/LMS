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

let currentSchoolName = "-";
let currentSchoolLogo = "../assets/images/default-logo.png";

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
    await loadStats(user);
    await loadClassAndSubjects(user);
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

  currentSchoolName = schoolName;
  currentSchoolLogo = schoolLogo;

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
// LOAD STATS
// ==========================
async function loadStats(user) {
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const data = userSnap.data();
    const classId = data.classId;
    const schoolId = data.schoolId;

    if (!classId) return;

    const qMaterials = query(collection(db, "materialGuru"), where("classId", "==", classId), where("schoolId", "==", schoolId));
    const snapMaterials = await getDocs(qMaterials);
    if (document.getElementById("totalMaterials")) document.getElementById("totalMaterials").innerText = snapMaterials.size;

    const qAssignments = query(collection(db, "exerciseGuru"), where("classId", "==", classId), where("schoolId", "==", schoolId));
    const snapAssignments = await getDocs(qAssignments);
    if (document.getElementById("totalAssignments")) document.getElementById("totalAssignments").innerText = snapAssignments.size;
  } catch (err) {
    console.error(err);
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
    alert("Gagal mengubah password (silakan login ulang terlebih dahulu jika sesi habis): " + err.message);
  }
};

// ==========================
// KELAS & MAPEL
// ==========================
async function loadClassAndSubjects(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();
  const classId = userData.classId;
  const schoolId = userData.schoolId;

  if (!classId) {
    document.getElementById("classContainer").innerHTML = `<p style="color:#64748b; font-size:13px;">Belum terdaftar di kelas manapun.</p>`;
    return;
  }

  const classSnap = await getDoc(doc(db, "classes", classId));
  if (!classSnap.exists()) return;
  const classData = classSnap.data();

  let html = `<div style="font-size:15px; font-weight:700; color:#1e293b; margin-bottom:14px;">🏫 Kelas: ${classData.name}</div>`;
  const teacherIds = classData.teacherIds || [];

  if (teacherIds.length === 0) {
    html += `<p style="color:#64748b; font-size:13px;">Belum ada guru di kelas ini</p>`;
    document.getElementById("classContainer").innerHTML = html;
    return;
  }

  const subjectsSet = new Set();
  for (const teacherId of teacherIds) {
    const q = query(collection(db, "teachers"), where("teacherId", "==", teacherId), where("schoolId", "==", schoolId));
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.subject) subjectsSet.add(data.subject);
    });
  }

  const subjects = [...subjectsSet];
  if (subjects.length === 0) {
    html += `<p style="color:#64748b; font-size:13px;">Belum ada mata pelajaran</p>`;
  } else {
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;">`;
    subjects.forEach(subject => {
      html += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; cursor: pointer; transition: all 0.2s;"
             onmouseover="this.style.borderColor='#4f46e5'; this.style.background='#eef2ff';"
             onmouseout="this.style.borderColor='#e2e8f0'; this.style.background='#f8fafc';"
             onclick="loadSubjectDetail('${subject}','${classId}','${schoolId}')">
          <div style="font-size: 20px; margin-bottom: 6px;">📘</div>
          <div style="font-weight: 600; color: #0f172a; font-size: 14px;">${subject}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  document.getElementById("classContainer").innerHTML = html;
}

window.loadSubjectDetail = async (subjectName, classId, schoolId) => {
  const schoolSnap = await getDoc(doc(db, "schools", schoolId));
  const schoolData = schoolSnap.data();
  const curriculum = schoolData.curriculum;
  const level = schoolData.level;

  const q = query(
    collection(db, "materials"),
    where("subject", "==", subjectName),
    where("classId", "==", classId),
    where("schoolId", "==", schoolId),
    where("curriculum", "==", curriculum),
    where("level", "==", level)
  );

  const snap = await getDocs(q);
  let html = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
      <h3 style="margin: 0; color: #1e293b; font-size: 16px;">📘 Materi: ${subjectName}</h3>
      <button onclick="location.reload()" style="background:#f1f5f9; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600; font-size:12px;">← Kembali</button>
    </div>
  `;

  if (snap.empty) {
    html += `<p style="color:#64748b; font-size:13px;">Belum ada materi untuk mata pelajaran ini.</p>`;
    document.getElementById("classContainer").innerHTML = html;
    return;
  }

  let grouped = {};
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const chapter = d.chapter || "Tanpa Bab";
    const sub = d.subChapter || "Tanpa Sub Bab";

    if (!grouped[chapter]) grouped[chapter] = {};
    if (!grouped[chapter][sub]) grouped[chapter][sub] = [];
    grouped[chapter][sub].push({ id: docSnap.id, ...d });
  });

  for (const chapter in grouped) {
    html += `<div style="font-weight: 700; color: #334155; margin: 16px 0 8px 0; font-size: 14px;">📚 ${chapter}</div>`;

    for (const sub in grouped[chapter]) {
      html += `<div style="font-weight: 600; color: #64748b; margin: 8px 0 8px 12px; font-size: 13px;">📖 ${sub}</div>`;

      grouped[chapter][sub].forEach(item => {
        html += `
          <div style="margin-left: 24px; margin-bottom: 8px; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;"
               onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)'" onmouseout="this.style.boxShadow='none'"
               onclick="openMaterial('${item.id}')">
            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">📄 ${item.title}</span>
            <span style="font-size: 12px; color: #4f46e5; font-weight: 600;">Buka Materi →</span>
          </div>
        `;
      });
    }
  }

  document.getElementById("classContainer").innerHTML = html;
};

window.openMaterial = async (id) => {
  const snap = await getDoc(doc(db, "materials", id));
  if (!snap.exists()) {
    alert("Materi tidak ditemukan");
    return;
  }
  const data = snap.data();
  document.getElementById("classContainer").innerHTML = `
    <div style="margin-bottom: 16px;">
      <button onclick="location.reload()" style="background:#f1f5f9; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px;">← Kembali ke Daftar Mapel</button>
    </div>
    <div style="background: white; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0; line-height: 1.8;">
      <h2 style="color: #4f46e5; margin-top:0; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px;">${data.title}</h2>
      <div>${data.content}</div>
    </div>
  `;
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
window.goAssignmentsSiswa = () => window.location.href = "./materials-siswa.html";
window.logout = async () => {
  await signOut(auth);
  window.location.href = "../login.html";
};
