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
  setTimeout(() => toast.classList.remove("active"), 3
