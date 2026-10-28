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

  // Realtime Listener
  initRealtimeSimulationReports(studentSnap);

  renderTimeline([
    { time: new Date(), desc: "Admin masuk dashboard" },
    { time: new Date(), desc: "Data murid diperbarui" }
  ]);

  renderClassChart(studentSnap, classSnap);
}

// ==========================
// KATEGORI BERDASARKAN NILAI ABSOLUT & PREDIKAT ISTIMEWA
// ==========================
function getStudentCategoryByScore(studentScore) {
  // Cek predikat istimewa terlebih dahulu (Nilai minimal 95,00)
  if (studentScore >= 95.00) {
    return { label: "Istimewa", bg: "#f0fdf4", color: "#15803d" };
  }
  
  // Kategori Baik (Nilai >= 76,67)
  if (studentScore >= 76.67) {
    return { label: "Baik", bg: "#f0fdf4", color: "#16a34a" };
  }
  
  // Kategori Memadai (Nilai 50 sampai < 76,67)
  if (studentScore >= 50.00) {
    return { label: "Memadai", bg: "#fffbeb", color: "#d97706" };
  }
  
  // Kategori Kurang (Nilai < 50)
  return { label: "Kurang", bg: "#fef2f2", color: "#dc2626" };
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
    return;
  }

  onSnapshot(collection(dbSecondary, "student_simulation_submissions"), (subSimSnap) => {
    globalAdminSimData = [];

    const chapterSet = new Set();
    const simNameSet = new Set();

    // Di dalam initRealtimeSimulationReports()
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
      totalQuestions: sub.totalQuestions || sub.totalSoal || "-", // <--- Tambahkan ini
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">Gagal memuat rekap simulasi secara real-time.</td></tr>`;
  });
}

// ==========================
// FILTER REKAP SIMULASI
// ==========================
window.filterAdminSimulationReports = () => {
  const chapterVal = document.getElementById("filterChapter")?.value || "";
  const simNameVal = document.getElementById("filterSimulationName")?.value || "";
  const keyword = document.getElementById("searchAdminStudent")?.value.toLowerCase().trim() || "";
  const sortOrder = document.getElementById("filterSortOrder")?.value || "newest";

  // 1. Filter Data
  const filtered = globalAdminSimData.filter(item => {
    const matchChapter = chapterVal ? item.chapter === chapterVal : true;
    const matchSimName = simNameVal ? item.simulationTitle === simNameVal : true;
    const matchName = (item.studentName || "").toLowerCase().includes(keyword);
    return matchChapter && matchSimName && matchName;
  });

  // 2. Sorting Data (Terbesar/Terkecil & Baru/Lama)
  filtered.sort((a, b) => {
    const timeA = a.submittedAt?.toMillis?.() || 0;
    const timeB = b.submittedAt?.toMillis?.() || 0;
    const scoreA = Number(a.score) || 0;
    const scoreB = Number(b.score) || 0;

    if (sortOrder === "newest") {
      return timeB - timeA; // Waktu terbaru di atas
    } else if (sortOrder === "oldest") {
      return timeA - timeB; // Waktu terlama di atas
    } else if (sortOrder === "highest_score") {
      return scoreB - scoreA; // Skor terbesar di atas
    } else if (sortOrder === "lowest_score") {
      return scoreA - scoreB; // Skor terkecil di atas
    }
    return 0;
  });

  renderAdminSimulationTable(filtered);
};

// ==========================
// RENDER TABEL & TAMPILKAN RATA-RATA DI SETIAP BARIS
// ==========================
function renderAdminSimulationTable(dataList) {
  const tbody = document.getElementById("adminSimReportTableBody");
  if (!tbody) return;

  let totalScoreSum = 0;
  const count = dataList.length;

  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 20px;">📭 Tidak ada data rekap simulasi yang ditemukan.</td></tr>`;
    return;
  }

  dataList.forEach(item => {
    totalScoreSum += (item.score || 0);
  });

  const overallAvg = Number((totalScoreSum / count).toFixed(2));

  // Catatan: Sorting sudah dilakukan di fungsi filterAdminSimulationReports() di atas, 
  // jadi di sini data tinggal dirender langsung sesuai urutannya.

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
        <td><b>${item.studentName}</b></td>
        <td><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${item.chapter}</span></td>
        <td><span style="color: #2563eb; font-weight: 500;">${item.simulationTitle}</span></td>
        <td style="text-align: center; font-weight: 500;">${item.totalQuestions}</td> 
        <td><span style="background: #f8fafc; color: #0f172a; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; border: 1px solid #cbd5e1;">${item.score}</span></td>
        <td><span style="background: ${cat.bg}; color: ${cat.color}; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">${cat.label}</span></td>
        <td><span style="background: #eff6ff; color: #1d4ed8; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 12px; border: 1px solid #bfdbfe;">${overallAvg}</span></td>
        <td style="font-size: 12px; color: #64748b;">${timeText}</td>
        <td>
          <button onclick="deleteAdminSimulationSubmission('${item.submissionId}')" style="background: #fee2e2; color: #dc2626; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">Hapus</button>
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
// EXPORT CSV
// ==========================
window.exportSimSimulationCSV = () => {
  if (globalAdminSimData.length === 0) {
    alert("Tidak ada data untuk diexport!");
    return;
  }

  let csv = "No,Nama Siswa,Bab/Mapel,Judul Simulasi,Skor,Rata-rata Keseluruhan,Waktu Kumpul\n";
  
  let totalSum = 0;
  globalAdminSimData.forEach(item => totalSum += (item.score || 0));
  const avgVal = globalAdminSimData.length > 0 ? (totalSum / globalAdminSimData.length).toFixed(1) : 0;

  globalAdminSimData.forEach((item, index) => {
    let timeText = "-";
    if (item.submittedAt?.toDate) {
      timeText = item.submittedAt.toDate().toLocaleString("id-ID");
    }
    csv += `${index + 1},"${item.studentName}","${item.chapter}","${item.simulationTitle}",${item.score},${avgVal},"${timeText}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rekap_Nilai_Simulasi_${currentSchoolName.replace(/\s+/g, '_')}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// ==========================
// HELPER: KONVERSI GAMBAR (LOGO) KE BASE64
// ==========================
function getBase64ImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL("image/png");
      resolve(dataURL);
    };
    img.onerror = (error) => resolve(null);
    img.src = url;
  });
}

// ==========================
// EXPORT SIMULATION PDF (DIPERBARUI)
// ==========================
window.exportSimSimulationPDF = async () => {
  if (globalAdminSimData.length === 0) {
    alert("Tidak ada data untuk dicetak!");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const schoolName = currentSchoolName || "Sekolah";
  const printDate = new Date().toLocaleDateString("id-ID", {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Ambil nilai filter dan sorting yang sedang aktif di layar
  const simFilterVal = document.getElementById("filterSimulationName")?.value;
  const chapterFilterVal = document.getElementById("filterChapter")?.value;
  const sortOrder = document.getElementById("filterSortOrder")?.value || "newest"; // <--- TAMBAHAN INI
  
  let titleTO = "Semua Simulasi & Try Out";
  if (simFilterVal) {
    titleTO = simFilterVal;
  } else if (chapterFilterVal) {
    titleTO = `Bab / Mapel: ${chapterFilterVal}`;
  }

  // 1. Filter data berdasarkan filter aktif saat ini
  const activeFilteredData = globalAdminSimData.filter(item => {
    const matchChapter = chapterFilterVal ? item.chapter === chapterFilterVal : true;
    const matchSimName = simFilterVal ? item.simulationTitle === simFilterVal : true;
    return matchChapter && matchSimName;
  });

  // 2. URUTKAN DATA SESUAI DENGAN PILIHAN SORTING DI LAYAR (TAMBAHAN INI)
  activeFilteredData.sort((a, b) => {
    const timeA = a.submittedAt?.toMillis?.() || 0;
    const timeB = b.submittedAt?.toMillis?.() || 0;
    const scoreA = Number(a.score) || 0;
    const scoreB = Number(b.score) || 0;

    if (sortOrder === "newest") {
      return timeB - timeA;
    } else if (sortOrder === "oldest") {
      return timeA - timeB;
    } else if (sortOrder === "highest_score") {
      return scoreB - scoreA;
    } else if (sortOrder === "lowest_score") {
      return scoreA - scoreB;
    }
    return 0;
  });

  let totalSum = 0;
  activeFilteredData.forEach(item => totalSum += (item.score || 0));
  const avgVal = activeFilteredData.length > 0 ? (totalSum / activeFilteredData.length).toFixed(1) : "0";

  let logoBase64 = null;
  if (currentSchoolLogo && !currentSchoolLogo.includes("default-logo.png")) {
    logoBase64 = await getBase64ImageFromUrl(currentSchoolLogo);
  }

  const startY = 15;
  let textStartX = 14;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 14, 12, 18, 18);
      textStartX = 36;
    } catch (e) {
      console.warn("Gagal menambahkan logo ke PDF:", e);
      textStartX = 14;
    }
  }

  // Header Kop Surat
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(schoolName.toUpperCase(), textStartX, startY + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Laporan Rekapitulasi Hasil Try Out & Simulasi Ujian Siswa", textStartX, startY + 9);

  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.8);
  doc.line(14, 34, 196, 34);

  // Kotak Metadata Ringkasan
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, 182, 20, 2, 2, "FD");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("Judul Simulasi / TO :", 18, 44);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(37, 99, 235);
  doc.text(titleTO, 55, 44);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("Tanggal Cetak         :", 18, 51);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(printDate, 55, 51);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text(`Total Siswa: ${activeFilteredData.length}`, 145, 44);
  doc.text(`Rata-rata TO: ${avgVal}`, 145, 51);

  // Menyusun Data Tabel
  const tableData = activeFilteredData.map((item, i) => {
    const cat = getStudentCategoryVsAverage(item.score || 0, Number(avgVal));
    return [
      i + 1,
      item.studentName,
      item.score,
      cat.label,
      avgVal
    ];
  });

  // Render Tabel PDF
  doc.autoTable({
    startY: 63,
    head: [["No", "Nama Siswa", "Skor", "Kategori", "Rata-rata"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left"
    },
    bodyStyles: {
      fontSize: 9,
      textColor: 50,
      cellPadding: 4
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "center" },
      1: { cellWidth: 85, fontStyle: "bold" },
      2: { cellWidth: 25, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 35 },
      4: { cellWidth: 22, halign: "center" }
    },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount} - Laporan Otomatis Dashboard ${schoolName}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }
  });

  const safeSchoolName = schoolName.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Rekap_Hasil_TO_${safeSchoolName}.pdf`);
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
