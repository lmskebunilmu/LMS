import { auth, db } from "../firebase/firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadLayout } from "../assets/js/components.js";

let currentSchoolId = null;
let currentSchoolName = "";
let currentSchoolLogo = "../assets/images/default-logo.png";
let globalTkaSchedules = [];

// ==========================
// AUTH CHECK & LOAD DATA
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
    await loadSchoolInfo(userData);
    initRealtimeTkaSchedules();
  } catch (err) {
    console.error(err);
    alert("Terjadi kesalahan saat verifikasi akun!");
  }
});

// ==========================
// LOAD DATA SEKOLAH
// ==========================
async function loadSchoolInfo(userData) {
  currentSchoolId = userData.schoolId || null;
  if (!currentSchoolId) return;

  const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
  if (schoolSnap.exists()) {
    const sData = schoolSnap.data();
    currentSchoolName = sData.name || "Sekolah";
    currentSchoolLogo = sData.logoURL || "../assets/images/default-logo.png";
  }
}

// ==========================
// REAL-TIME LISTENER JADWAL TKA
// ==========================
function initRealtimeTkaSchedules() {
  const tbody = document.getElementById("tkaScheduleTableBody");
  if (!tbody || !currentSchoolId) return;

  const q = query(
    collection(db, "tka_schedules"),
    where("schoolId", "==", currentSchoolId)
  );

  onSnapshot(q, (snapshot) => {
    globalTkaSchedules = [];
    snapshot.forEach(docSnap => {
      globalTkaSchedules.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Urutkan jadwal berdasarkan tanggal & jam mulai
    globalTkaSchedules.sort((a, b) => new Date(`${a.date}T${a.startTime}`) - new Date(`${b.date}T${b.startTime}`));
    filterTkaSchedules();
  }, (err) => {
    console.error("Gagal memuat jadwal TKA:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red; padding: 20px;">Gagal memuat jadwal TKA.</td></tr>`;
  });
}

// ==========================
// FILTER PENCARIAN & STATUS
// ==========================
window.filterTkaSchedules = () => {
  const statusVal = document.getElementById("filterStatus")?.value || "";
  const keyword = document.getElementById("searchTkaInput")?.value.toLowerCase().trim() || "";

  const filtered = globalTkaSchedules.filter(item => {
    const matchStatus = statusVal ? item.status === statusVal : true;
    const matchKey = (item.title || "").toLowerCase().includes(keyword) || (item.subject || "").toLowerCase().includes(keyword);
    return matchStatus && matchKey;
  });

  renderTkaScheduleTable(filtered);
};

// ==========================
// RENDER TABEL JADWAL
// ==========================
function renderTkaScheduleTable(dataList) {
  const tbody = document.getElementById("tkaScheduleTableBody");
  if (!tbody) return;

  if (dataList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">Belum ada data jadwal Try Out TKA.</td></tr>`;
    return;
  }

  let html = "";
  dataList.forEach((item, index) => {
    let statusBg = "#eff6ff";
    let statusColor = "#1d4ed8";

    if (item.status === "Berlangsung") {
      statusBg = "#ecfdf5";
      statusColor = "#059669";
    } else if (item.status === "Selesai") {
      statusBg = "#f1f5f9";
      statusColor = "#64748b";
    }

    const formattedDate = item.date ? new Date(item.date).toLocaleDateString("id-ID", {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    }) : "-";

    html += `
      <tr>
        <td>${index + 1}</td>
        <td><b>${item.title || "-"}</b></td>
        <td><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${item.subject || "-"}</span></td>
        <td>${formattedDate}</td>
        <td>${item.startTime || "-"} - ${item.endTime || "-"} WIB</td>
        <td>${item.room || "-"}</td>
        <td><span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">${item.status || "Akan Datang"}</span></td>
        <td>
          <button onclick="editTkaSchedule('${item.id}')" style="background: #dbeafe; color: #1e40af; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; margin-right: 4px;">Edit</button>
          <button onclick="deleteTkaSchedule('${item.id}')" style="background: #fee2e2; color: #dc2626; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">Hapus</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================
// MODAL CONTROLS
// ==========================
window.openTkaScheduleModal = () => {
  document.getElementById("tkaModalTitle").innerText = "Tambah Jadwal Try Out TKA";
  document.getElementById("tkaScheduleId").value = "";
  document.getElementById("tkaTitle").value = "";
  document.getElementById("tkaSubject").value = "";
  document.getElementById("tkaDate").value = "";
  document.getElementById("tkaStartTime").value = "";
  document.getElementById("tkaEndTime").value = "";
  document.getElementById("tkaRoom").value = "";
  document.getElementById("tkaStatus").value = "Akan Datang";
  document.getElementById("tkaScheduleModal").classList.add("active");
};

window.closeTkaScheduleModal = () => {
  document.getElementById("tkaScheduleModal").classList.remove("active");
};

window.editTkaSchedule = (id) => {
  const item = globalTkaSchedules.find(s => s.id === id);
  if (!item) return;

  document.getElementById("tkaModalTitle").innerText = "Edit Jadwal Try Out TKA";
  document.getElementById("tkaScheduleId").value = item.id;
  document.getElementById("tkaTitle").value = item.title || "";
  document.getElementById("tkaSubject").value = item.subject || "";
  document.getElementById("tkaDate").value = item.date || "";
  document.getElementById("tkaStartTime").value = item.startTime || "";
  document.getElementById("tkaEndTime").value = item.endTime || "";
  document.getElementById("tkaRoom").value = item.room || "";
  document.getElementById("tkaStatus").value = item.status || "Akan Datang";
  document.getElementById("tkaScheduleModal").classList.add("active");
};

// ==========================
// SIMPAN / EDIT DATA
// ==========================
window.saveTkaSchedule = async () => {
  const id = document.getElementById("tkaScheduleId").value;
  const title = document.getElementById("tkaTitle").value.trim();
  const subject = document.getElementById("tkaSubject").value.trim();
  const date = document.getElementById("tkaDate").value;
  const startTime = document.getElementById("tkaStartTime").value;
  const endTime = document.getElementById("tkaEndTime").value;
  const room = document.getElementById("tkaRoom").value.trim();
  const status = document.getElementById("tkaStatus").value;

  if (!title || !date || !startTime || !endTime) {
    alert("Harap isi Judul, Tanggal, Jam Mulai, dan Jam Selesai!");
    return;
  }

  const payload = {
    schoolId: currentSchoolId,
    title,
    subject,
    date,
    startTime,
    endTime,
    room,
    status,
    updatedAt: new Date()
  };

  try {
    if (id) {
      await updateDoc(doc(db, "tka_schedules", id), payload);
      showToast("Jadwal TO TKA berhasil diperbarui");
    } else {
      payload.createdAt = new Date();
      await addDoc(collection(db, "tka_schedules"), payload);
      showToast("Jadwal TO TKA berhasil ditambahkan");
    }
    closeTkaScheduleModal();
  } catch (err) {
    console.error("Gagal menyimpan jadwal:", err);
    showToast("Gagal menyimpan jadwal TKA", "error");
  }
};

// ==========================
// HAPUS DATA
// ==========================
window.deleteTkaSchedule = async (id) => {
  if (!confirm("Apakah Anda yakin ingin menghapus jadwal Try Out TKA ini?")) return;

  try {
    await deleteDoc(doc(db, "tka_schedules", id));
    showToast("Jadwal TO TKA berhasil dihapus");
  } catch (err) {
    console.error("Gagal menghapus:", err);
    showToast("Gagal menghapus jadwal", "error");
  }
};

// ==========================
// HELPER BASE64 LOGO
// ==========================
function getBase64ImageFromUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ==========================
// CETAK / PRINT PDF JADWAL TKA
// ==========================
window.exportTkaSchedulePDF = async () => {
  if (globalTkaSchedules.length === 0) {
    alert("Tidak ada jadwal Try Out TKA untuk dicetak!");
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
      textStartX = 14;
    }
  }

  // Header Kop Surat PDF
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(schoolName.toUpperCase(), textStartX, startY + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Jadwal Resmi Try Out Tes Kemampuan Akademik (TKA)", textStartX, startY + 9);

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.line(14, 34, 196, 34);

  // Box Informasi Metadata
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, 182, 16, 2, 2, "FD");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("Tanggal Cetak :", 18, 48);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(printDate, 45, 48);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text(`Total Agenda: ${globalTkaSchedules.length} Sesi`, 140, 48);

  // Table Data
  const tableData = globalTkaSchedules.map((item, i) => {
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString("id-ID", {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    }) : "-";

    return [
      i + 1,
      item.title || "-",
      item.subject || "-",
      formattedDate,
      `${item.startTime || ""} - ${item.endTime || ""} WIB`,
      item.room || "-",
      item.status || "Akan Datang"
    ];
  });

  // Render Tabel PDF
  doc.autoTable({
    startY: 58,
    head: [["No", "Nama Try Out", "Mata Pelajaran / Sesi", "Tanggal", "Waktu", "Ruangan", "Status"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left"
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: 50,
      cellPadding: 4
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 45, fontStyle: "bold" },
      2: { cellWidth: 35 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28 },
      5: { cellWidth: 22 },
      6: { cellWidth: 22, halign: "center" }
    },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount} - Dokumen Resmi Dashboard Admin ${schoolName}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }
  });

  const safeSchoolName = schoolName.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Jadwal_Try_Out_TKA_${safeSchoolName}.pdf`);
};

// Toast helper
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");
  if (!toast || !msg) return;
  msg.innerText = message;
  toast.classList.remove("error");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 3000);
}
