// ==========================
// IMPORT FIREBASE
// ==========================
import { auth, db } from "../../firebase/firebase-config.js";
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, query, where, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { loadLayout } from "../../assets/js/components.js";

// ==========================
// LAYOUT & STATE GLOBAL
// ==========================
loadLayout("admin");
let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "../../assets/images/default-logo.png";
let classMapGlobal = {}; // Untuk menampung pasangan ID_Kelas: Nama_Kelas

// State untuk fitur Kartu Siswa
let studentsCache = new Map(); // id -> data murid
let modalCardsData = [];       // daftar kartu yang sedang tampil di modal

// ==========================
// HELPER ESCAPE HTML
// ==========================
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================
// AUTH CHECK
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "../../login.html";
    return;
  }

  await loadProfileHeader(user);
  await loadClasses();
  loadStudents();
  initStudentSearch();
  initStudentFilters();
});

// ==========================
// LOAD PROFILE HEADER
// ==========================
async function loadProfileHeader(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const name = data.name || "Admin";
  const avatar = data.avatarURL || "../../assets/images/default-avatar.png";
  currentSchoolId = data.schoolId || null;

  const nameEl = document.getElementById("headerNameHeader");
  if (nameEl) nameEl.innerText = name;

  const avatarEl = document.getElementById("headerAvatarHeader");
  if (avatarEl) avatarEl.src = avatar;

  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      if (schoolData.status !== "aktif") {
        showToast("Sekolah kamu nonaktif!", "error");
        lockDashboard();
        return;
      }
      currentSchoolRef = schoolSnap.ref;
      currentSchoolName = schoolData.name || "-";
      currentSchoolLogo = schoolData.logoURL || "../../assets/images/default-logo.png";
    }
  }

  const schoolNameEl = document.getElementById("headerSchoolName");
  if (schoolNameEl) schoolNameEl.innerText = currentSchoolName;

  const schoolLogoEl = document.getElementById("headerSchoolLogo");
  if (schoolLogoEl) schoolLogoEl.src = currentSchoolLogo;
}

// ==========================
// LOAD CLASSES
// ==========================
async function loadClasses() {
  const select = document.getElementById("studentClass");
  const filterClass = document.getElementById("filterClass");
  if (!select || !filterClass) return;

  select.innerHTML = `<option value="">Pilih Kelas</option>`;
  filterClass.innerHTML = `<option value="">Semua Kelas</option>`;
  classMapGlobal = {};

  let classesQuery = collection(db, "classes");
  if (currentSchoolId) {
    classesQuery = query(collection(db, "classes"), where("schoolId", "==", currentSchoolId));
  }

  const snap = await getDocs(classesQuery);
  snap.forEach(docSnap => {
    const data = docSnap.data();
    classMapGlobal[docSnap.id] = data.name;

    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = data.name;
    select.appendChild(option);

    const filterOption = document.createElement("option");
    filterOption.value = docSnap.id;
    filterOption.textContent = data.name;
    filterClass.appendChild(filterOption);
  });
}

// ==========================
// LOAD STUDENTS
// ==========================
async function loadStudents() {
  const table = document.getElementById("studentTable");
  if (!table) return;

  table.innerHTML = `<tr><td colspan="6">⏳ Memuat data murid...</td></tr>`;

  if (!currentSchoolId) {
    table.innerHTML = `<tr><td colspan="6">❌ Sekolah tidak valid</td></tr>`;
    return;
  }

  const studentsQuery = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
  const snap = await getDocs(studentsQuery);

  studentsCache.clear();
  table.innerHTML = snap.empty ? `<tr><td colspan="6">📭 Belum ada data murid</td></tr>` : "";

  snap.forEach(docSnap => {
    const data = { id: docSnap.id, ...docSnap.data() };
    studentsCache.set(docSnap.id, data);

    const statusClass = data.status === "aktif" ? "aktif" : "nonaktif";
    const statusText = data.status === "aktif" ? "Aktif" : "Nonaktif";

    const statusButtonText = data.status === "nonaktif" ? "Aktifkan" : "Nonaktifkan";
    const statusButtonClass = data.status === "nonaktif" ? "btn-status aktif" : "btn-status nonaktif";

    const safeNameAttr = (data.name || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const safeEmailAttr = (data.email || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

    const tr = document.createElement("tr");
    tr.dataset.classId = data.classId;
    tr.innerHTML = `
      <td><input type="checkbox" class="studentCheckbox" value="${docSnap.id}"></td>
      <td>${escapeHtml(data.name)}</td>
      <td>${escapeHtml(data.email)}</td>
      <td>${escapeHtml(classMapGlobal[data.classId] || data.className || "-")}</td>
      <td><button class="btn-status ${statusClass}">${statusText}</button></td>
      <td>
        <button class="btn-card" onclick="printSingleCard('${docSnap.id}')">🪪 Kartu</button>
        <button class="btn-warning" onclick="editStudent('${docSnap.id}','${safeNameAttr}','${data.classId}')">Edit</button>
        <button class="btn-reset" onclick="resetPassword('${safeEmailAttr}')">Reset Password</button>
        <button class="btn-delete" onclick="deleteStudent('${docSnap.id}')">Hapus</button>
        <button class="${statusButtonClass}" onclick="toggleStudentStatus('${docSnap.id}','${data.status}')">${statusButtonText}</button>
      </td>
    `;
    table.appendChild(tr);
  });

  updateBulkButtons();
}

// ==========================
// KARTU SISWA (RENDER, PREVIEW, PRINT)
// ==========================
function buildStudentCardHTML(student) {
  const safeName = escapeHtml(student.name || "-");
  const safeEmail = escapeHtml(student.email || "-");
  const safeClass = escapeHtml(student.className || classMapGlobal[student.classId] || "-");
  const safeSchool = escapeHtml(currentSchoolName || "Sekolah");
  const safeLogo = escapeHtml(currentSchoolLogo || "../../assets/images/default-logo.png");
  const rawPassword = student.password || student.initialPassword || "";
  const safePassword = rawPassword
    ? escapeHtml(rawPassword)
    : `<span style="color:#b45309;">(Tidak tersimpan)</span>`;

  return `
    <div class="student-card">
      <div class="student-card-header">
        <img src="${safeLogo}" alt="Logo" onerror="this.src='../../assets/images/default-logo.png'">
        <div>
          <div class="student-card-school">${safeSchool}</div>
          <div class="student-card-subtitle">KARTU AKSES LOGIN MURID</div>
        </div>
      </div>
      <div class="student-card-body">
        <div class="student-card-name">${safeName}</div>
        <div class="student-card-class">Kelas: ${safeClass}</div>
        <div class="student-cred-box">
          <div class="student-cred-row">
            <span class="student-cred-label">Email:</span>
            <span class="student-cred-value">${safeEmail}</span>
          </div>
          <div class="student-cred-row">
            <span class="student-cred-label">Password:</span>
            <span class="student-cred-value">${safePassword}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.openCardsModalWithList = (cardsList, titleText = "Kartu Akun Murid") => {
  modalCardsData = cardsList || [];
  const titleEl = document.getElementById("cardModalTitle");
  const previewEl = document.getElementById("cardModalPreview");
  const modalEl = document.getElementById("studentCardModal");

  if (titleEl) titleEl.innerText = `${titleText} (${modalCardsData.length})`;
  if (previewEl) {
    previewEl.innerHTML = modalCardsData.length
      ? modalCardsData.map(buildStudentCardHTML).join("")
      : `<p>Tidak ada data kartu untuk ditampilkan.</p>`;
  }
  if (modalEl) modalEl.classList.add("active");
};

window.closeStudentCardModal = () => {
  const modalEl = document.getElementById("studentCardModal");
  if (modalEl) modalEl.classList.remove("active");
  modalCardsData = [];
};

window.printSingleCard = (studentId) => {
  const student = studentsCache.get(studentId);
  if (!student) {
    showToast("Data murid tidak ditemukan", "error");
    return;
  }
  openCardsModalWithList([student], "Cetak Kartu Satuan");
};

window.openAllCardsModal = () => {
  // Jika ada checkbox yang dicentang, cetak yang dicentang saja; jika tidak ada, cetak semua
  const selectedIds = getSelectedStudents();
  let targetStudents = [];

  if (selectedIds.length > 0) {
    targetStudents = selectedIds
      .map(id => studentsCache.get(id))
      .filter(Boolean);
    openCardsModalWithList(targetStudents, "Kartu Murid Terpilih");
  } else {
    targetStudents = Array.from(studentsCache.values());
    if (targetStudents.length === 0) {
      showToast("Belum ada data murid untuk dibuatkan kartu", "error");
      return;
    }
    openCardsModalWithList(targetStudents, "Semua Kartu Murid");
  }
};

window.printCurrentCardModal = () => {
  if (!modalCardsData.length) {
    showToast("Tidak ada kartu untuk dicetak", "error");
    return;
  }
  const printArea = document.getElementById("printCardsArea");
  if (!printArea) return;

  printArea.innerHTML = modalCardsData.map(buildStudentCardHTML).join("");
  window.print();
};

// ==========================
// SEARCH STUDENT
// ==========================
function initStudentSearch() {
  const searchInput = document.getElementById("studentSearch");
  if (!searchInput) return;

  searchInput.addEventListener("keyup", function () {
    const keyword = this.value.toLowerCase();
    document.querySelectorAll("#studentTable tr").forEach(row => {
      row.style.display = row.innerText.toLowerCase().includes(keyword) ? "" : "none";
    });
  });
}

// ==========================
// UTILS: MODAL & TOAST
// ==========================
window.openStudentModal = () => {
  resetForm();
  document.getElementById("studentPassword").style.display = "block";
  document.getElementById("studentEmail").style.display = "block";
  document.getElementById("studentModal").classList.add("active");
};

window.closeStudentModal = () => {
  document.getElementById("studentModal").classList.remove("active");
  resetForm();
};

function resetForm() {
  document.getElementById("studentId").value = "";
  document.getElementById("studentName").value = "";
  document.getElementById("studentEmail").value = "";
  document.getElementById("studentPassword").value = "";
  document.getElementById("studentClass").value = "";
}

window.showToast = (message, type = "success") => {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");
  msg.innerText = message;
  toast.classList.remove("error");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 3000);
};

// ==========================
// CRUD STUDENT (EDIT & SAVE)
// ==========================
window.editStudent = (id, name, classId) => {
  document.getElementById("studentId").value = id;
  document.getElementById("studentName").value = name;
  document.getElementById("studentClass").value = classId;
  document.getElementById("studentPassword").style.display = "none";
  document.getElementById("studentPassword").value = "";
  document.getElementById("studentEmail").style.display = "none";
  document.getElementById("studentModal").classList.add("active");
};

window.saveStudent = async () => {
  const id = document.getElementById("studentId").value;
  const name = document.getElementById("studentName").value.trim();
  const email = document.getElementById("studentEmail").value.trim();
  const password = document.getElementById("studentPassword").value.trim();
  const classSelect = document.getElementById("studentClass");
  const classId = classSelect.value;
  const className = classSelect.selectedOptions[0]?.text;

  if (!id && (!name || !email || !classId)) {
    showToast("Lengkapi semua data!", "error");
    return;
  }
  if (id && (!name || !classId)) {
    showToast("Lengkapi data!", "error");
    return;
  }
  if (!id && (!password || password.length < 6)) {
    showToast("Password minimal 6 karakter", "error");
    return;
  }

  try {
    if (id) {
      await updateDoc(doc(db, "students", id), { name, classId, className });
      try {
        await updateDoc(doc(db, "users", id), { name, classId, className });
      } catch (e) {
        console.log("User lama tidak pakai UID (skip)");
      }
      showToast("Murid berhasil diperbarui");
      closeStudentModal();
      loadStudents();
    } else {
      const firebaseConfig = auth.app.options;
      let secondaryApp = getApps().find(app => app.name === "SecondaryStudent")
        || initializeApp(firebaseConfig, "SecondaryStudent");
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      await secondaryAuth.signOut();
      const uid = userCredential.user.uid;

      const studentPayload = {
        name,
        email,
        classId,
        className,
        schoolId: currentSchoolId,
        status: "aktif",
        initialPassword: password,
        createdAt: new Date()
      };

      await setDoc(doc(db, "users", uid), {
        uid,
        ...studentPayload,
        role: "siswa"
      });

      await setDoc(doc(db, "students", uid), studentPayload);

      showToast("Murid berhasil ditambahkan");
      closeStudentModal();
      await loadStudents();

      // Langsung buka kartu murid baru
      openCardsModalWithList([{ id: uid, ...studentPayload, password }], "Kartu Murid Baru");
    }
  } catch (err) {
    console.error(err);
    showToast("Gagal: " + err.message, "error");
  }
};

window.toggleStudentStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === "aktif" ? "nonaktif" : "aktif";
  try {
    await updateDoc(doc(db, "students", id), { status: newStatus });
    try {
      await updateDoc(doc(db, "users", id), { status: newStatus });
    } catch (e) {
      console.log("User lama tidak pakai UID (skip status update)");
    }
    showToast(`Murid berhasil ${newStatus === "aktif" ? "diaktifkan" : "dinonaktifkan"}`);
    loadStudents();
  } catch (err) {
    console.error(err);
    showToast("Gagal ubah status murid", "error");
  }
};

// ==========================
// DELETE STUDENT
// ==========================
let deleteId = null;
window.deleteStudent = (id) => {
  deleteId = id;
  document.getElementById("confirmModal").classList.add("active");
};

window.closeConfirmModal = () => document.getElementById("confirmModal").classList.remove("active");

document.getElementById("confirmDeleteBtn").onclick = async () => {
  if (!deleteId) return;
  try {
    await deleteDoc(doc(db, "users", deleteId)).catch(() => {});
    await deleteDoc(doc(db, "students", deleteId));
    closeConfirmModal();
    loadStudents();
    showToast("Murid berhasil dihapus");
  } catch (err) {
    console.error(err);
    showToast("Gagal menghapus data", "error");
  }
};

// ==========================
// RESET PASSWORD
// ==========================
let resetEmailGlobal = null;
window.resetPassword = (email) => {
  resetEmailGlobal = email;
  document.getElementById("resetEmail").innerText = email;
  document.getElementById("resetPasswordModal").classList.add("active");
};

window.closeResetPasswordModal = () => document.getElementById("resetPasswordModal").classList.remove("active");

document.getElementById("confirmResetBtn").onclick = async () => {
  if (!resetEmailGlobal) return;
  try {
    await sendPasswordResetEmail(auth, resetEmailGlobal);
    showToast("Email reset password berhasil dikirim");
  } catch (err) {
    console.error(err);
    showToast("Gagal kirim reset password", "error");
  }
  closeResetPasswordModal();
};

// ==========================
// LOCK DASHBOARD SEKOLAH NONAKTIF
// ==========================
function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:80vh;flex-direction:column;text-align:center;"><h1 style="color:red;">🚫 Akses Ditolak</h1><p>Sekolah kamu sedang <b>nonaktif</b></p><button onclick="logout()" class="btn-edit">Logout</button></div>`;
}

// ==========================
// FILTER STUDENT
// ==========================
function initStudentFilters() {
  const filterStatus = document.getElementById("filterStatus");
  const filterClass = document.getElementById("filterClass");

  [filterStatus, filterClass].forEach(el => {
    if (el) el.addEventListener("change", applyFilters);
  });
}

function applyFilters() {
  const status = document.getElementById("filterStatus").value;
  const classId = document.getElementById("filterClass").value;

  document.querySelectorAll("#studentTable tr").forEach(row => {
    const rowStatus = row.querySelector("td:nth-child(5)")?.innerText.toLowerCase();
    const rowClassId = row.dataset.classId;
    let show = true;

    if (status && rowStatus !== status) show = false;
    if (classId && rowClassId !== classId) show = false;

    row.style.display = show ? "" : "none";
  });
}

// ==========================
// EXPORT & IMPORT CSV (+ AUTO KARTU)
// ==========================
window.exportStudentsToCSV = async () => {
  if (!currentSchoolId) {
    showToast("Sekolah tidak valid", "error");
    return;
  }

  try {
    const q = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const snap = await getDocs(q);

    if (snap.empty) {
      showToast("Tidak ada data untuk diexport", "error");
      return;
    }

    let csv = "Nama,Email,Kelas,Status\n";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      csv += `"${d.name}","${d.email}","${d.className || "-"}","${d.status}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "data_murid.csv";
    a.click();

    URL.revokeObjectURL(url);
    showToast("Export CSV berhasil");
  } catch (err) {
    console.error(err);
    showToast("Gagal export CSV", "error");
  }
};

window.importStudentsCSV = () => {
  const input = document.getElementById("csvFileInput");
  if (input) {
    input.value = ""; // reset agar file yang sama bisa dipilih ulang
    input.click();
  }
};

document.getElementById("csvFileInput")?.addEventListener("change", handleCSVUpload);

async function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  await processCSV(text);
}

async function processCSV(csvText) {
  const rows = csvText.split(/\r?\n/).map(r => r.trim()).filter(r => r);
  rows.shift(); // hapus header

  let success = 0;
  let failed = 0;
  const importedCards = [];

  for (const row of rows) {
    // Mendukung pemisah koma (,) maupun titik koma (;) dari Excel Indonesia
    const separator = row.includes(";") && !row.includes(",") ? ";" : ",";
    const [name, email, password, className] = row.split(separator).map(v => v?.trim().replace(/^"|"$/g, ""));

    if (!name || !email || !password || !className) {
      failed++;
      continue;
    }

    try {
      let classId = null;

      // Cari kelas di sekolah aktif terlebih dahulu
      let classQuery = currentSchoolId
        ? query(collection(db, "classes"), where("schoolId", "==", currentSchoolId), where("name", "==", className))
        : query(collection(db, "classes"), where("name", "==", className));

      const classSnap = await getDocs(classQuery);

      if (!classSnap.empty) {
        classId = classSnap.docs[0].id;
      } else {
        console.log("Kelas tidak ditemukan:", className);
        failed++;
        continue;
      }

      const firebaseConfig = auth.app.options;
      let secondaryApp = getApps().find(app => app.name === "SecondaryCSV")
        || initializeApp(firebaseConfig, "SecondaryCSV");
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );
      await secondaryAuth.signOut();

      const uid = userCredential.user.uid;

      const studentPayload = {
        name,
        email,
        classId,
        className,
        schoolId: currentSchoolId,
        status: "aktif",
        initialPassword: password,
        createdAt: new Date()
      };

      await setDoc(doc(db, "users", uid), {
        uid,
        ...studentPayload,
        role: "siswa"
      });

      await setDoc(doc(db, "students", uid), studentPayload);

      importedCards.push({
        id: uid,
        ...studentPayload,
        password
      });

      success++;
    } catch (err) {
      console.error("Gagal import:", err);
      failed++;
    }
  }

  showToast(`Import selesai: ${success} berhasil, ${failed} gagal`);
  await loadStudents();

  // Otomatis tampilkan kartu siswa yang baru berhasil di-import
  if (importedCards.length > 0) {
    openCardsModalWithList(importedCards, "Kartu Hasil Import CSV");
  }
}

window.downloadCSVTemplate = async () => {
  let csv = "nama,email,password,kelas\n";

  let classesQuery = currentSchoolId
    ? query(collection(db, "classes"), where("schoolId", "==", currentSchoolId))
    : collection(db, "classes");

  const snap = await getDocs(classesQuery);

  snap.forEach(docSnap => {
    const kelas = docSnap.data().name;
    csv += `Contoh Nama,contoh@email.com,123456,${kelas}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "template_import_murid.csv";
  a.click();

  URL.revokeObjectURL(url);
  showToast("Template dengan daftar kelas berhasil didownload");
};

// ==========================
// BULK ACTIONS & CHECKBOX
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  const selectAll = document.getElementById("selectAll");
  if (!selectAll) return;

  selectAll.addEventListener("change", function () {
    const checked = this.checked;
    document.querySelectorAll(".studentCheckbox").forEach(cb => {
      cb.checked = checked;
    });
    updateBulkButtons();
  });
});

function getSelectedStudents() {
  const selected = [];
  document.querySelectorAll(".studentCheckbox:checked").forEach(cb => {
    selected.push(cb.value);
  });
  return selected;
}

window.bulkDelete = async () => {
  const ids = getSelectedStudents();
  if (ids.length === 0) {
    showToast("Pilih minimal 1 murid", "error");
    return;
  }

  if (!confirm("Yakin hapus murid terpilih?")) return;

  try {
    for (const id of ids) {
      await deleteDoc(doc(db, "students", id));
      await deleteDoc(doc(db, "users", id)).catch(() => {});
    }

    showToast("Berhasil hapus banyak murid");
    loadStudents();
  } catch (err) {
    console.error(err);
    showToast("Gagal bulk delete", "error");
  }
};

window.bulkActivate = async () => {
  const ids = getSelectedStudents();
  if (ids.length === 0) {
    showToast("Pilih minimal 1 murid", "error");
    return;
  }

  try {
    await Promise.all(ids.map(id =>
      updateDoc(doc(db, "students", id), { status: "aktif" })
    ));

    await Promise.all(ids.map(id =>
      updateDoc(doc(db, "users", id), { status: "aktif" }).catch(() => {})
    ));

    showToast("Berhasil aktifkan murid");
    loadStudents();
  } catch (err) {
    console.error(err);
    showToast("Gagal bulk aktif", "error");
  }
};

window.bulkDeactivate = async () => {
  const ids = getSelectedStudents();
  if (ids.length === 0) {
    showToast("Pilih minimal 1 murid", "error");
    return;
  }

  try {
    for (const id of ids) {
      await updateDoc(doc(db, "students", id), { status: "nonaktif" });
      await updateDoc(doc(db, "users", id), { status: "nonaktif" }).catch(() => {});
    }

    showToast("Berhasil nonaktifkan murid");
    loadStudents();
  } catch (err) {
    console.error(err);
    showToast("Gagal bulk nonaktif", "error");
  }
};

function updateBulkButtons() {
  const count = document.querySelectorAll(".studentCheckbox:checked").length;
  document.querySelectorAll(".bulk-actions button").forEach(btn => {
    btn.disabled = count === 0;
  });
}

document.addEventListener("change", updateBulkButtons);
