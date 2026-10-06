import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged, updateProfile, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { loadLayout } from "/LMS/assets/js/components.js";
window.loadLayout = loadLayout;

let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "/LMS/assets/images/default-logo.png";

// Variabel Global Data Laporan
let globalSubmissions = [];
let globalClassesMap = {};
let globalExercisesMap = {};
let globalStudentsMap = {};

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

// ==========================================
// LOAD EXERCISE REPORTS (LAPORAN HASIL BELAJAR)
// ==========================================
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
      globalClassesMap[cDoc.id] = cData.name || "Kelas Tanpa Nama";
      
      // Tambahkan ke dropdown filter kelas
      filterClassSelect.innerHTML += `<option value="${cDoc.id}">${cData.name}</option>`;
    });

    if (teacherClassIds.length === 0) {
      document.getElementById("reportTableBody").innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8;">Belum ada kelas yang diampu.</td></tr>`;
      return;
    }

    // 2. Ambil referensi data exercises (Judul latihan/sub-bab)
    const exSnap = await getDocs(collection(db, "exercises"));
    exSnap.forEach(eDoc => {
      globalExercisesMap[eDoc.id] = eDoc.data().title || "Latihan Tanpa Judul";
    });

    // Populate dropdown filter exercise
    const filterExSelect = document.getElementById("filterExercise");
    filterExSelect.innerHTML = `<option value="">-- Semua Latihan --</option>`;
    Object.keys(globalExercisesMap).forEach(exId => {
      filterExSelect.innerHTML += `<option value="${exId}">${globalExercisesMap[exId]}</option>`;
    });

    // 3. Ambil data siswa berdasarkan kelas yang diampu
    const studentsSnap = await getDocs(query(collection(db, "students"), where("schoolId", "==", currentSchoolId)));
    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      if (teacherClassIds.includes(sData.classId)) {
        globalStudentsMap[sDoc.id] = sData.name || "Siswa";
      }
    });

    // 4. Ambil submissions siswa
    const subSnap = await getDocs(query(collection(db, "student_submissions"), where("schoolId", "==", currentSchoolId)));
    globalSubmissions = [];

    subSnap.forEach(subDoc => {
      const subData = subDoc.data();
      // Filter hanya submission dari siswa di kelas yang diampu guru ini
      if (teacherClassIds.includes(subData.classId) && globalStudentsMap[subData.studentUid]) {
        globalSubmissions.push(subData);
      }
    });

    renderReportTable(globalSubmissions);

  } catch (err) {
    console.error("Gagal memuat laporan hasil belajar:", err);
    document.getElementById("reportTableBody").innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Gagal memuat laporan.</td></tr>`;
  }
}

window.filterReports = () => {
  const selectedClass = document.getElementById("filterClass").value;
  const selectedEx = document.getElementById("filterExercise").value;
  const keyword = document.getElementById("searchStudent").value.toLowerCase();

  const filtered = globalSubmissions.filter(sub => {
    const studentName = (globalStudentsMap[sub.studentUid] || "").toLowerCase();
    const matchClass = selectedClass ? sub.classId === selectedClass : true;
    const matchEx = selectedEx ? sub.exerciseId === selectedEx : true;
    const matchName = studentName.includes(keyword);

    return matchClass && matchEx && matchName;
  });

  renderReportTable(filtered);
};

function renderReportTable(dataList) {
  const tbody = document.getElementById("reportTableBody");
  if (!tbody) return;

  if (dataList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8;">📭 Belum ada riwayat pengerjaan latihan siswa yang sesuai.</td></tr>`;
    return;
  }

  // Urutkan berdasarkan waktu pengumpulan terbaru
  dataList.sort((a, b) => {
    const timeA = a.submittedAt?.toDate?.()?.getTime() || new Date(a.submittedAt).getTime() || 0;
    const timeB = b.submittedAt?.toDate?.()?.getTime() || new Date(b.submittedAt).getTime() || 0;
    return timeB - timeA;
  });

  let html = "";
  dataList.forEach((item, index) => {
    const studentName = globalStudentsMap[item.studentUid] || "Siswa Tidak Dikenal";
    const className = globalClassesMap[item.classId] || "-";
    const exerciseTitle = globalExercisesMap[item.exerciseId] || "Latihan";
    const score = item.score ?? 0;
    const correct = item.correctAnswers ?? 0;
    const total = item.totalQuestions ?? 0;

    let timeFormatted = "-";
    if (item.submittedAt) {
      const dateObj = item.submittedAt.toDate ? item.submittedAt.toDate() : new Date(item.submittedAt);
      timeFormatted = dateObj.toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Warna badge skor
    let scoreColor = "#059669"; // Hijau
    if (score < 60) scoreColor = "#dc2626"; // Merah
    else if (score < 75) scoreColor = "#d97706"; // Kuning/Oranye

    html += `
      <tr>
        <td>${index + 1}</td>
        <td><b>👤 ${studentName}</b></td>
        <td>${className}</td>
        <td><span style="color: #4f46e5; font-weight: 500;">📖 ${exerciseTitle}</span></td>
        <td><span style="background: ${scoreColor}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">${score}</span></td>
        <td>${correct} / ${total} Benar</td>
        <td style="font-size: 12px; color: #64748b;">${timeFormatted}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ===================================================
// LOAD DAFTAR KELAS & BREAKDOWN ANGGOTA SISWA REAL-TIME
// ===================================================
async function loadClassWithStudents(user) {
  try {
    if (!currentSchoolId) return;

    const container = document.getElementById("classListContainer");
    if (!container) return;
    container.innerHTML = "⏳ Memuat data kelas dan daftar siswa...";

    const qClasses = query(
      collection(db, "classes"),
      where("teacherIds", "array-contains", user.uid),
      where("schoolId", "==", currentSchoolId)
    );

    const snapClasses = await getDocs(qClasses);

    if (snapClasses.empty) {
      container.innerHTML = "<p>📭 Anda belum diplot mengampu kelas mana pun oleh admin.</p>";
      return;
    }

    container.innerHTML = "";

    for (const classDoc of snapClasses.docs) {
      const classData = classDoc.data();
      const classId = classDoc.id;

      const isWaliKelas = classData.homeroomTeacherId === user.uid;
      const waliKelasBadge = isWaliKelas 
        ? `<span style="background-color: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 8px;">👑 Wali Kelas</span>` 
        : "";

      const classTeachersMapping = classData.teachers || {};
      const mySubjects = classTeachersMapping[user.uid] || [];
      const subjectsText = mySubjects.length > 0 ? mySubjects.join(", ") : "- Tidak ada mapel terpilih";

      const qStudents = query(collection(db, "students"), where("classId", "==", classId));
      const snapStudents = await getDocs(qStudents);

      const cleanStudents = [];
      snapStudents.forEach(sDoc => {
        cleanStudents.push(sDoc.data());
      });

      cleanStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const div = document.createElement("div");
      div.className = "class-box";
      div.style.marginBottom = "15px";

      div.innerHTML = `
        <button class="class-toggle" style="width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center; padding:12px; cursor:pointer;">
          <span>📋 <b>${classData.name}</b> ${waliKelasBadge}</span>
          <span style="font-size:12px; color:#4f46e5; font-weight:600;">📖 ${mySubjects.length} Mapel</span>
        </button>

        <div class="class-detail" style="display:none; padding:15px; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 6px 6px; background:#fff;">
          <div style="margin-bottom:10px; font-size:13px; color:#475569; line-height:1.6;">
            <div>• Jabatan Anda: <b>${isWaliKelas ? "Wali Kelas" : "Guru Pengampu"}</b></div>
            <div>• Mengajar Mapel: <span style="color:#4f46e5; font-weight:600;">${subjectsText}</span></div>
            <div>• Total Siswa Terdaftar: <b>${cleanStudents.length} Murid</b></div>
          </div>

          <div class="export-buttons" style="margin-bottom:15px;">
            <button class="btn-export btn-csv" style="padding: 6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer;">Export CSV</button>
            <button class="btn-export btn-pdf" style="padding: 6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:5px;">Download PDF</button>
          </div>

          <strong style="font-size:13px; display:block; margin-bottom:5px; color:#1e293b;">Daftar Murid Kelas:</strong>
          <ul style="list-style:none; padding:0; margin:0; max-height:200px; overflow-y:auto;">
            ${
              cleanStudents.length > 0
              ? cleanStudents.map((s, index) => `<li style="padding:6px 0; border-bottom:1px dashed #f1f5f9; font-size:13px;">${index + 1}. 👤 ${s.name} (${s.email || "-"})</li>`).join("")
              : "<li style='color:#94a3b8; font-size:13px;'>📭 Belum ada siswa terdaftar di kelas ini</li>"
            }
          </ul>
        </div>
      `;

      div.querySelector(".class-toggle").onclick = () => {
        const detail = div.querySelector(".class-detail");
        detail.style.display = detail.style.display === "none" ? "block" : "none";
      };

      div.querySelector(".btn-csv").onclick = () => exportCSV(cleanStudents, classData.name);
      div.querySelector(".btn-pdf").onclick = () => exportPDF(cleanStudents, classData.name);

      container.appendChild(div);
    }

  } catch (err) {
    console.error("Gagal merelasikan data siswa dan kelas guru:", err);
    const container = document.getElementById("classListContainer");
    if (container) container.innerHTML = "<p style='color:red;'>❌ Gagal memuat detail data siswa</p>";
  }
}

// ==========================
// EXPORT DATA (CSV & PDF)
// ==========================
window.exportCSV = (students, className) => {
  let csv = "Nama,Email\n";
  students.forEach(s => {
    csv += `"${s.name}","${s.email || "-"}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Data_Siswa_Kelas_${className.replace(/\s+/g, '_')}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

window.exportPDF = async (students, className) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const getBase64FromURL = async (url) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  let logoBase64 = await getBase64FromURL(currentSchoolLogo);
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", 14, 10, 18, 18);
  }

  doc.setFontSize(14);
  doc.text(currentSchoolName, 36, 15);
  doc.setFontSize(10);
  doc.text("Laporan Anggota Akademik Anggota Siswa", 36, 22);

  doc.setFontSize(12);
  doc.text(`Kelas: ${className}`, 14, 38);
  const today = new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Tanggal Cetak: ${today}`, 14, 44);

  const tableData = students.map((s, i) => [i + 1, s.name || "-", s.email || "-"]);

  doc.autoTable({
    startY: 50,
    head: [["No", "Nama Siswa", "Email"]],
    body: tableData,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.text(`Total terdata: ${students.length} Siswa`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`Laporan_Siswa_Kelas_${className.replace(/\s+/g, '_')}.pdf`);
};

// ==========================
// FORM MANAGEMENT PROFILE MODAL
// ==========================
window.openProfileModal = () => document.getElementById("profileModal").classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal").classList.remove("active");

window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const file = document.getElementById("profileAvatarFile").files[0];

  if (!name || !email) {
    showToast("Isi semua data profil wajib!", "error");
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data();
    let avatarURL = userData?.avatarURL ?? "/LMS/assets/images/default-avatar.png";

    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "avatar_upload");

      const res = await fetch(`https://api.cloudinary.com/v1_1/djlvnubgn/image/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (data && data.secure_url) {
        avatarURL = data.secure_url;
      } else {
        throw new Error("Respon Cloudinary tidak valid");
      }
    }

    await updateProfile(user, { displayName: name, photoURL: avatarURL });
    if (email !== user.email) {
      await updateEmail(user, email);
    }

    const password = document.getElementById("profilePassword")?.value.trim();
    const confirmPassword = document.getElementById("profilePasswordConfirm")?.value.trim();

    if (password) {
      if (password.length < 6) {
        showToast("Password minimal 6 karakter!", "error");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Konfirmasi sandi tidak sesuai!", "error");
        return;
      }
      await updatePassword(user, password);
      document.getElementById("profilePassword").value = "";
      document.getElementById("profilePasswordConfirm").value = "";
    }

    await updateDoc(doc(db, "users", user.uid), { name, email, avatarURL });
    showToast("Profil guru berhasil diperbarui");
    closeProfileModal();

    const updatedUserSnap = await getDoc(doc(db, "users", user.uid));
    await loadProfileHeader(updatedUserSnap.data());

  } catch (err) {
    console.error(err);
    showToast("Gagal memperbarui data profil", "error");
  }
};

// ==========================
// LOCK DASHBOARD & TOAST CONTROL
// ==========================
function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column; text-align:center;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang dalam status <b>nonaktif</b></p>
      <button onclick="window.location='/LMS/login.html'" class="btn-edit" style="margin-top:15px;">Kembali</button>
    </div>
  `;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");
  if (toast && msg) {
    msg.innerText = message;
    toast.className = "toast active";
    if (type === "error") toast.classList.add("error");
    setTimeout(() => toast.classList.remove("active"), 3000);
  }
}
