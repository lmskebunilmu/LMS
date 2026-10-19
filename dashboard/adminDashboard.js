import { auth, db, dbSecondary } from "../firebase/firebase-config.js";
import { signOut, onAuthStateChanged, updateEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadLayout } from "../assets/js/components.js";

let isSchoolActive = true;
let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "";
let currentSchoolLogo = "../assets/images/default-logo.png";

let globalAdminSimData = [];

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
      alert("User tidak ditemukan!");
      window.location = "../login.html";
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== "admin") {
      alert("Akses ditolak! Hanya Admin.");
      window.location = "../login.html";
      return;
    }

    window.role = userData.role;
    await loadLayout(window.role);
    await waitForHeader();
    await loadProfileHeader(user);

    if (isSchoolActive) {
      await loadDashboard();
    }
  } catch (err) {
    console.error(err);
    alert("Terjadi kesalahan!");
    window.location = "../login.html";
  }
});

// ==========================
// UPLOAD AVATAR KE CLOUDINARY
// ==========================
async function uploadAvatarToCloudinary(file) {
  const cloudName = "djlvnubgn";
  const uploadPreset = "lms_unsigned";
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  try {
    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json();
    if (data.secure_url) {
      return data.secure_url;
    } else {
      alert("Upload gagal: " + (data.error?.message || "Unknown error"));
      return null;
    }
  } catch (err) {
    console.error(err);
    alert("Upload avatar gagal!");
    return null;
  }
}

// ==========================
// LOGOUT
// ==========================
window.logout = () => {
  signOut(auth).then(() => window.location = "../login.html").catch(err => alert(err.message));
};

// ==========================
// WAIT HEADER READY
// ==========================
function waitForHeader() {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const avatar = document.getElementById("headerAvatarHeader");
      if (avatar) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

// ==========================
// LOAD PROFILE HEADER
// ==========================
async function loadProfileHeader(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const name = data.name || user.displayName || "Admin";
  const avatar = data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
  const email = data.email || user.email;
  currentSchoolId = data.schoolId || null;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      if (schoolData.status !== "aktif") {
        showToast("Sekolah kamu nonaktif!", "error");
        lockDashboard();
        isSchoolActive = false;
        return;
      } else {
        isSchoolActive = true;
      }

      currentSchoolRef = schoolSnap.ref;
      schoolName = schoolData.name || "-";
      currentSchoolName = schoolName;
      schoolLogo = schoolData.logoURL || "../assets/images/default-logo.png";
      currentSchoolLogo = schoolLogo;
    }
  }

  document.getElementById("headerNameHeader").innerText = name;
  document.getElementById("headerAvatarHeader").src = avatar;
  document.getElementById("headerSchoolName").innerText = schoolName;
  document.getElementById("headerSchoolLogo").src = schoolLogo;

  const schoolNameCard = document.getElementById("schoolNameCard");
  const schoolCodeCard = document.getElementById("schoolCodeCard");
  const schoolLogoCard = document.getElementById("schoolLogoCard");

  if (schoolNameCard) schoolNameCard.innerText = schoolName;
  if (schoolCodeCard) schoolCodeCard.innerText = currentSchoolId || "-";
  if (schoolLogoCard) schoolLogoCard.src = schoolLogo;

  document.getElementById("headerNameCard").innerText = name;
  document.getElementById("headerEmailCard").innerText = email;
  document.getElementById("headerAvatarCard").src = avatar;
  document.getElementById("headerSchoolCard").innerText = schoolName;

  document.getElementById("profileName").value = name;
  document.getElementById("profileEmail").value = email;
  document.getElementById("profileSchool").value = currentSchoolName;
}

// ==========================
// MODAL CONTROLS
// ==========================
window.openProfileModal = () => document.getElementById("profileModal").classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal").classList.remove("active");

window.openSchoolModal = () => {
  document.getElementById("schoolModal").classList.add("active");
  document.getElementById("schoolNameInput").value = currentSchoolName;
};

window.closeSchoolModal = () => {
  document.getElementById("schoolModal").classList.remove("active");
};

// ==========================
// SAVE PROFILE & SCHOOL
// ==========================
window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;
  const name = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const schoolName = document.getElementById("profileSchool").value.trim();
  const file = document.getElementById("profileAvatarFile").files[0];

  if (!name || !email) {
    alert("Isi semua data!");
    return;
  }

  try {
    let avatarURL = user.photoURL || "../assets/images/default-avatar.png";
    if (file) {
      const uploadedURL = await uploadAvatarToCloudinary(file);
      if (uploadedURL) avatarURL = uploadedURL;
    }

    await updateProfile(user, { displayName: name, photoURL: avatarURL });
    if (email !== user.email) await updateEmail(user, email);

    await updateDoc(doc(db, "users", user.uid), { name, email, avatarURL });
    if (currentSchoolRef && schoolName) {
      await updateDoc(currentSchoolRef, { name: schoolName });
    }

    showToast("Profil admin berhasil diperbarui");
    closeProfileModal();
    await loadProfileHeader(user);
  } catch (err) {
    showToast("Gagal update profil", "error");
  }
};

window.saveSchoolProfile = async () => {
  if (!currentSchoolRef) {
    alert("Data sekolah tidak ditemukan!");
    return;
  }

  const schoolName = document.getElementById("schoolNameInput").value.trim();
  const file = document.getElementById("schoolLogoFile").files[0];

  if (!schoolName) {
    alert("Nama sekolah wajib diisi!");
    return;
  }

  try {
    let logoURL = currentSchoolLogo;
    if (file) {
      const uploadedURL = await uploadAvatarToCloudinary(file);
      if (uploadedURL) logoURL = uploadedURL;
    }

    await updateDoc(currentSchoolRef, { name: schoolName, logoURL: logoURL });
    showToast("Profil sekolah berhasil diperbarui");
    closeSchoolModal();
    await loadProfileHeader(auth.currentUser);
  } catch (err) {
    showToast("Gagal update sekolah", "error");
  }
};

// ==========================
// DASHBOARD DATA
// ==========================
async function loadDashboard() {
  if (!currentSchoolId) return;

  const studentSnap = await getDocs(query(collection(db, "students"), where("schoolId", "==", currentSchoolId)));
  const teacherSnap = await getDocs(query(collection(db, "teachers"), where("schoolId", "==", currentSchoolId)));
  const classSnap = await getDocs(query(collection(db, "classes"), where("schoolId", "==", currentSchoolId)));

  document.getElementById("totalStudents").innerText = studentSnap.size;
  document.getElementById("totalTeachers").innerText = teacherSnap.size;
  document.getElementById("totalClasses").innerText = classSnap.size;

  // Menggunakan Real-time Listener (onSnapshot)
  initRealtimeSimulationReports(studentSnap);

  renderTimeline([
    { time: new Date(), desc: "Admin masuk dashboard" },
    { time: new Date(), desc: "Data murid diperbarui" }
  ]);

  renderClassChart(studentSnap, classSnap);
}

// ==========================
// KATEGORI BERDASARKAN POSISI NILAI TERHADAP RATA-RATA
// ==========================
function getStudentCategoryVsAverage(studentScore, overallAvg) {
  const selisih = studentScore - overallAvg;

  if (selisih >= 1.5) {
    return { label: "Sangat Memuaskan", bg: "#ecfdf5", color: "#059669" };
  } else if (selisih > 0) {
    return { label: "Memuaskan", bg: "#eff6ff", color: "#1d4ed8" };
  } else if (selisih === 0 || (selisih >= -0.5 && selisih < 0)) {
    return { label: "Cukup", bg: "#fffbeb", color: "#d97706" };
  } else {
    return { label: "Kurang", bg: "#fef2f2", color: "#dc2626" };
  }
}

// ==========================
// REAL-TIME SIMULATION REPORTS (ON SNAPSHOT)
// ==========================
function initRealtimeSimulationReports(studentSnap) {
  const tbody = document.getElementById("adminSimReportTableBody");
  if (!tbody) return;

  const studentUids = [];
  studentSnap.forEach(sDoc => {
    studentUids.push(sDoc.id);
  });

  if (studentUids.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
    return;
  }

  onSnapshot(collection(dbSecondary, "student_simulation_submissions"), (subSimSnap) => {
    globalAdminSimData = [];

    const chapterSet = new Set();
    const simNameSet = new Set();

    subSimSnap.forEach(docSnap => {
      const sub = docSnap.data();
      if (sub.submittedAt && studentUids.includes(sub.studentUid)) {
        const chapter = sub.chapter || sub.subject || "Umum";
        const simTitle = sub.simulationTitle || "Simulasi Ujian";
        
        chapterSet.add(chapter);
        simNameSet.add(simTitle);

        globalAdminSimData.push({
          submissionId: docSnap.id,
          studentName: sub.studentName || "Siswa",
          chapter: chapter,
          simulationTitle: simTitle,
          score: sub.score || 0,
          submittedAt: sub.submittedAt
        });
      }
    });

    const filterChapter = document.getElementById("filterChapter");
    const filterSimName = document.getElementById("filterSimulationName");

    const currentChapterVal = filterChapter?.value || "";
    const currentSimVal = filterSimName?.value || "";

    if (filterChapter) {
      filterChapter.innerHTML = `<option value="">-- Semua Bab / Mapel --</option>`;
      chapterSet.forEach(ch => {
        filterChapter.innerHTML += `<option value="${ch}" ${ch === currentChapterVal ? 'selected' : ''}>${ch}</option>`;
      });
    }

    if (filterSimName) {
      filterSimName.innerHTML = `<option value="">-- Semua Simulasi --</option>`;
      simNameSet.forEach(sName => {
        filterSimName.innerHTML += `<option value="${sName}" ${sName === currentSimVal ? 'selected' : ''}>${sName}</option>`;
      });
    }

    filterAdminSimulationReports();

  }, (err) => {
    console.error("Gagal memuat rekap simulasi secara real-time:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">Gagal memuat rekap simulasi secara real-time.</td></tr>`;
  });
}

// ==========================
// FILTER REKAP SIMULASI
// ==========================
window.filterAdminSimulationReports = () => {
  const chapterVal = document.getElementById("filterChapter")?.value || "";
  const simNameVal = document.getElementById("filterSimulationName")?.value || "";
  const keyword = document.getElementById("searchAdminStudent")?.value.toLowerCase().trim() || "";

  const filtered = globalAdminSimData.filter(item => {
    const matchChapter = chapterVal ? item.chapter === chapterVal : true;
    const matchSimName = simNameVal ? item.simulationTitle === simNameVal : true;
    const matchName = (item.studentName || "").toLowerCase().includes(keyword);
    return matchChapter && matchSimName && matchName;
  });

  renderAdminSimulationTable(filtered);
};

// ==========================
// RENDER TABEL & HITUNG KATEGORI BERDASARKAN RATA-RATA
// ==========================
function renderAdminSimulationTable(dataList) {
  const tbody = document.getElementById("adminSimReportTableBody");
  const elAvgCell = document.getElementById("tableOverallAverageCell");
  if (!tbody) return;

  let totalScoreSum = 0;
  const count = dataList.length;

  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">📭 Tidak ada data rekap simulasi yang ditemukan.</td></tr>`;
    if (elAvgCell) elAvgCell.innerHTML = `<span style="color: #64748b;">0</span>`;
    return;
  }

  dataList.forEach(item => {
    totalScoreSum += (item.score || 0);
  });

  const overallAvg = Number((totalScoreSum / count).toFixed(1));
  
  if (elAvgCell) {
    elAvgCell.innerHTML = `<span style="background: #eff6ff; color: #1d4ed8; padding: 4px 10px; border-radius: 6px; border: 1px solid #bfdbfe; font-size: 13px; font-weight: bold;">⭐ ${overallAvg}</span>`;
  }

  dataList.sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));

  let html = "";
  dataList.forEach((item, index) => {
    const cat = getStudentCategoryVsAverage(item.score || 0, overallAvg);

    let timeText = "-";
    if (item.submittedAt?.toDate) {
      timeText = item.submittedAt.toDate().toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    html += `
      <tr>
        <td>${index + 1}</td>
        <td><b>👤 ${item.studentName}</b></td>
        <td><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 500;">📚 ${item.chapter}</span></td>
        <td><span style="color: #2563eb; font-weight: 500;">🎯 ${item.simulationTitle}</span></td>
        <td><span style="background: #f8fafc; color: #0f172a; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; border: 1px solid #cbd5e1;">⭐ ${item.score}</span></td>
        <td><span style="background: ${cat.bg}; color: ${cat.color}; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">${cat.label}</span></td>
        <td style="font-size: 12px; color: #64748b;">${timeText}</td>
        <td>
          <button onclick="deleteAdminSimulationSubmission('${item.submissionId}')" style="background: #fee2e2; color: #dc2626; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">🗑️ Hapus</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================
// HAPUS SUBMISSION SIMULASI
// ==========================
window.deleteAdminSimulationSubmission = async (subId) => {
  if (!confirm("Apakah Anda yakin ingin menghapus data/file pengerjaan simulasi ini?")) return;

  try {
    await deleteDoc(doc(dbSecondary, "student_simulation_submissions", subId));
    showToast("Data simulasi berhasil dihapus");
  } catch (err) {
    console.error("Gagal menghapus:", err);
    showToast("Gagal menghapus data simulasi", "error");
  }
};

// ==========================
// EXPORT CSV & PDF
// ==========================
window.exportSimSimulationCSV = () => {
  if (globalAdminSimData.length === 0) {
    alert("Tidak ada data untuk diexport!");
    return;
  }

  let csv = "No,Nama Siswa,Bab/Mapel,Judul Simulasi,Skor,Waktu Kumpul\n";
  globalAdminSimData.forEach((item, index) => {
    let timeText = "-";
    if (item.submittedAt?.toDate) {
      timeText = item.submittedAt.toDate().toLocaleString("id-ID");
    }
    csv += `${index + 1},"${item.studentName}","${item.chapter}","${item.simulationTitle}",${item.score},"${timeText}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rekap_Nilai_Simulasi_${currentSchoolName.replace(/\s+/g, '_')}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

window.exportSimSimulationPDF = () => {
  if (globalAdminSimData.length === 0) {
    alert("Tidak ada data untuk dicetak!");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text(`Rekap Nilai Simulasi Ujian - ${currentSchoolName}`, 14, 15);
  doc.setFontSize(10);
  doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 22);

  const tableData = globalAdminSimData.map((item, i) => [
    i + 1,
    item.studentName,
    item.chapter,
    item.simulationTitle,
    item.score
  ]);

  doc.autoTable({
    startY: 30,
    head: [["No", "Nama Siswa", "Bab / Mapel", "Judul Simulasi", "Skor"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
  });

  doc.save(`Rekap_Simulasi_${currentSchoolName.replace(/\s+/g, '_')}.pdf`);
};

// ==========================
// TIMELINE & CHART
// ==========================
function renderTimeline(activity) {
  const timelineEl = document.getElementById("activityTimeline");
  if(!timelineEl) return;
  timelineEl.innerHTML = "";
  activity.forEach(act => {
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `${act.desc} <span>${act.time.toLocaleString()}</span>`;
    timelineEl.appendChild(div);
  });
}

function renderClassChart(studentSnap, classSnap) {
  const classCounts = {};
  classSnap.forEach(cls => { classCounts[cls.data().name] = 0; });
  studentSnap.forEach(s => {
    const className = s.data().className || "Lainnya";
    if(classCounts[className] !== undefined) classCounts[className]++;
  });

  const ctx = document.getElementById("classChart")?.getContext("2d");
  if(!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: { labels: Object.keys(classCounts), datasets: [{ label: 'Jumlah Murid', data: Object.values(classCounts), backgroundColor:'#3b82f6' }] },
    options: { responsive:true, plugins:{ legend:{ display:false } } }
  });
}

// ==========================
// TOAST & LOCK
// ==========================
window.showToast = function(message, type = "success") {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");
  msg.innerText = message;
  toast.classList.remove("error");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 3000);
};

function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column; text-align:center;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="logout()" class="btn-edit">Logout</button>
    </div>
  `;
}
