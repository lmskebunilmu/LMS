import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "/LMS/assets/images/default-logo.png";

// Variabel penampung fungsi hapus sementara dan modal aktif
let classIdToDelete = null;
let activeClassIdInModal = null;

// ==========================================
// UTILITY: CHECKBOX PILIH SEMUA
// ==========================================
window.toggleSelectAll = (listId, masterCheckbox) => {
  const checkboxes = document.querySelectorAll(`#${listId} input[type="checkbox"]`);
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

// ==========================
// AUTH + LOAD LAYOUT
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "/LMS/login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      currentSchoolId = userData.schoolId || null;
      window.role = userData.role;
      
      if (window.loadLayout) {
        await window.loadLayout(window.role);
      }
      
      await loadProfileHeader(userData);
      await loadTeachersToSelect();
      await loadClasses();
      initClassSearch();
    }
  } catch (err) {
    console.error("Gagal inisialisasi halaman kelas:", err);
  }
});

// ==========================
// LOAD PROFILE HEADER
// ==========================
async function loadProfileHeader(userData) {
  const name = userData.name || "Admin";
  const avatar = userData.avatarURL || "/LMS/assets/images/default-avatar.png";

  const nameEl = document.getElementById("headerNameHeader");
  if (nameEl) nameEl.innerText = name;

  const avatarEl = document.getElementById("headerAvatarHeader");
  if (avatarEl) avatarEl.src = avatar;

  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      currentSchoolRef = schoolSnap.ref;
      currentSchoolName = schoolData.name || "-";
      currentSchoolLogo = schoolData.logoURL || "/LMS/assets/images/default-logo.png";
    }
  }

  const schoolNameEl = document.getElementById("headerSchoolName");
  if (schoolNameEl) schoolNameEl.innerText = currentSchoolName;

  const schoolLogoEl = document.getElementById("headerSchoolLogo");
  if (schoolLogoEl) schoolLogoEl.src = currentSchoolLogo;
}

// ==========================
// LOAD DATA KELAS (FIRESTORE)
// ==========================
async function loadClasses() {
  const tableBody = document.getElementById("classTable");
  if (!tableBody) return;
  tableBody.innerHTML = "<tr><td colspan='4'>⏳ Memuat data kelas...</td></tr>";

  try {
    let classesQuery = collection(db, "classes");
    if (currentSchoolId) {
      classesQuery = query(collection(db, "classes"), where("schoolId", "==", currentSchoolId));
    }

    const querySnapshot = await getDocs(classesQuery);
    tableBody.innerHTML = "";

    if (querySnapshot.empty) {
      tableBody.innerHTML = "<tr><td colspan='4'>📭 Belum ada data kelas</td></tr>";
      return;
    }

    const studentsQuery = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const studentsSnap = await getDocs(studentsQuery);
    
    const studentCountMap = {};
    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      if (sData.classId) {
        studentCountMap[sData.classId] = (studentCountMap[sData.classId] || 0) + 1;
      }
    });

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const classId = docSnap.id;
      
      const classNameClean = data.name ? data.name : "-";
      const classNameForAttribute = classNameClean.replace(/'/g, "\\'");
      
      const totalTeachers = data.teacherIds ? data.teacherIds.length : 0;
      const totalStudents = studentCountMap[classId] || 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${classNameClean}</b></td>
        <td><a href="#" onclick="openTeacherDetailModal('${classId}', '${classNameForAttribute}')" style="color: #4f46e5; font-weight: 600; text-decoration: none;"> ${totalTeachers} Guru</a></td>
        <td><a href="#" onclick="openStudentDetailModal('${classId}', '${classNameForAttribute}')" style="color: #4f46e5; font-weight: 600; text-decoration: none;"> ${totalStudents} Siswa</a></td>
        <td>
          <button class="btn-info" onclick="viewClass('${classId}', '${classNameForAttribute}')">👁️ Lihat Semua</button>
          <button class="btn-warning" onclick="editClass('${classId}', '${classNameForAttribute}')">✏️ Edit</button>
          <button class="btn-danger" onclick="deleteClass('${classId}', '${classNameForAttribute}')" style="background-color: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ Hapus</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Gagal mengambil data kelas:", err);
    tableBody.innerHTML = "<tr><td colspan='4' style='color:red;'>❌ Gagal memuat data kelas</td></tr>";
  }
}

function initClassSearch() {
  const searchInput = document.getElementById("classSearch");
  if (!searchInput) return;

  searchInput.addEventListener("keyup", function() {
    const keyword = this.value.toLowerCase();
    document.querySelectorAll("#classTable tr").forEach(row => {
      row.style.display = row.innerText.toLowerCase().includes(keyword) ? "" : "none";
    });
  });
}

let teacherSelectInstance = null;

async function loadTeachersToSelect() {
  const selectEl = document.getElementById("teacherSelect");
  if (!selectEl) return;

  selectEl.innerHTML = '<option value="">Pilih Guru</option>';

  try {
    const teacherQuery = query(
      collection(db, "users"),
      where("role", "==", "guru"),
      where("schoolId", "==", currentSchoolId)
    );

    const snap = await getDocs(teacherQuery);
    
    snap.forEach(docSnap => {
      const teacherData = docSnap.data();
      const option = document.createElement("option");
      option.value = docSnap.id; 
      option.textContent = teacherData.name || "Tanpa Nama";
      selectEl.appendChild(option);
    });

    if (window.TomSelect && !teacherSelectInstance) {
      teacherSelectInstance = new TomSelect("#teacherSelect", {
        plugins: ['remove_button'],
        placeholder: 'Pilih Guru Pengampu...',
        create: false
      });
    } else if (teacherSelectInstance) {
      teacherSelectInstance.sync();
    }

  } catch (err) {
    console.error("Gagal memuat daftar guru untuk opsi kelas:", err);
  }
}

// ==========================
// CONTROL MODAL & ACTIONS
// ==========================
window.openClassModal = () => {
  document.getElementById("classId").value = "";
  document.getElementById("className").value = "";
  document.getElementById("classModalTitle").innerText = "Tambah Kelas";
  if (teacherSelectInstance) teacherSelectInstance.clear();
  document.getElementById("classModal").classList.add("active");
};

window.editClass = async (id, name) => {
  document.getElementById("classId").value = id;
  document.getElementById("className").value = name;
  document.getElementById("classModalTitle").innerText = "Edit Kelas";

  try {
    const classSnap = await getDoc(doc(db, "classes", id));
    if (classSnap.exists()) {
      const classData = classSnap.data();
      const currentTeacherIds = classData.teacherIds || [];
      if (teacherSelectInstance) teacherSelectInstance.setValue(currentTeacherIds);
    }
  } catch (err) {
    console.error("Gagal memuat data guru pada edit kelas:", err);
  }
  document.getElementById("classModal").classList.add("active");
};

// --- MODAL KONFIRMASI HAPUS KELAS ---
window.deleteClass = (id, name) => {
  classIdToDelete = id;
  document.getElementById("deleteModalMessage").innerText = `Apakah Anda yakin ingin menghapus kelas "${name}"? Tindakan ini tidak dapat dibatalkan.`;
  document.getElementById("deleteConfirmModal").classList.add("active");
};

window.closeDeleteModal = () => {
  document.getElementById("deleteConfirmModal").classList.remove("active");
  classIdToDelete = null;
};

document.getElementById("confirmDeleteBtn").onclick = async () => {
  if (!classIdToDelete) return;
  try {
    await deleteDoc(doc(db, "classes", classIdToDelete));
    window.closeDeleteModal();
    await loadClasses();
    showToast("Kelas berhasil dihapus!");
  } catch (err) {
    console.error("Gagal menghapus kelas:", err);
    alert("Gagal menghapus kelas!");
  }
};

// --- MODAL: LIHAT DETAIL GURU (DENGAN CEKLIS) ---
window.openTeacherDetailModal = async (id, className) => {
  activeClassIdInModal = id; 
  const teacherList = document.getElementById("teacherList");
  document.getElementById("teacherModalTitle").innerText = `Daftar Guru - Kelas ${className}`;
  teacherList.innerHTML = "<li>⏳ Memuat daftar guru...</li>";
  
  const selectAllCb = document.getElementById("selectAllTeachers");
  if(selectAllCb) selectAllCb.checked = false;

  document.getElementById("teacherModal").classList.add("active");

  try {
    const classSnap = await getDoc(doc(db, "classes", id));
    if (classSnap.exists()) {
      const teacherIds = classSnap.data().teacherIds || [];
      teacherList.innerHTML = "";
      
      if(teacherIds.length === 0) {
        teacherList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Belum ada guru pengampu di kelas ini.</li>";
        return;
      }

      for (const tId of teacherIds) {
        const tSnap = await getDoc(doc(db, "users", tId));
        if (tSnap.exists()) {
          const li = document.createElement("li");
          li.style.cssText = "padding: 10px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;";
          li.innerHTML = `
            <input type="checkbox" class="teacher-item-cb" value="${tId}" style="cursor:pointer;">
            <span>👨‍🏫 <b>${tSnap.data().name || "Tanpa Nama"}</b> (${tSnap.data().email || "-"})</span>
          `;
          teacherList.appendChild(li);
        }
      }
    }
  } catch (err) {
    console.error(err);
    teacherList.innerHTML = "<li style='color:red;'>❌ Gagal memuat data.</li>";
  }
};

// --- MODAL: LIHAT DETAIL SISWA (DENGAN CEKLIS) ---
window.openStudentDetailModal = async (id, className) => {
  activeClassIdInModal = id; 
  const studentList = document.getElementById("studentList");
  document.getElementById("studentModalTitle").innerText = `Daftar Siswa - Kelas ${className}`;
  studentList.innerHTML = "<li>⏳ Memuat daftar siswa...</li>";
  
  const selectAllCb = document.getElementById("selectAllStudents");
  if(selectAllCb) selectAllCb.checked = false;

  document.getElementById("studentModal").classList.add("active");

  try {
    const qStudents = query(collection(db, "students"), where("classId", "==", id));
    const studentsSnap = await getDocs(qStudents);
    studentList.innerHTML = "";

    if (studentsSnap.empty) {
      studentList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Belum ada siswa terdaftar di kelas ini.</li>";
      return;
    }

    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      const li = document.createElement("li");
      li.style.cssText = "padding: 10px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;";
      li.innerHTML = `
        <input type="checkbox" class="student-item-cb" value="${sDoc.id}" style="cursor:pointer;">
        <span>👶 <b>${sData.name || "Tanpa Nama"}</b> (${sData.email || "-"})</span>
      `;
      studentList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    studentList.innerHTML = "<li style='color:red;'>❌ Gagal memuat data.</li>";
  }
};

// Tombol Lihat Semua memicu detail siswa
window.viewClass = (id, name) => {
  window.openStudentDetailModal(id, name);
};

// ==================================================================
// AKSI BERKELOMPOK: KELUARKAN GURU
// ==================================================================
window.removeSelectedTeachers = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".teacher-item-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih guru yang ingin dikeluarkan terlebih dahulu!");
    return;
  }

  if (confirm(`Keluarkan ${checkedBoxes.length} guru terpilih dari kelas ini?`)) {
    try {
      const classRef = doc(db, "classes", activeClassIdInModal);
      const classSnap = await getDoc(classRef);
      if (classSnap.exists()) {
        let currentTeachers = classSnap.data().teacherIds || [];
        const idsToRemove = Array.from(checkedBoxes).map(cb => cb.value);
        const updatedTeachers = currentTeachers.filter(id => !idsToRemove.includes(id));
        
        await updateDoc(classRef, { teacherIds: updatedTeachers });
        document.getElementById("teacherModal").classList.remove("active");
        await loadClasses();
        showToast("Guru terpilih berhasil dikeluarkan.");
      }
    } catch (err) {
      console.error(err);
      alert("Gagal mengeluarkan guru terpilih.");
    }
  }
};

window.removeAllTeachers = async () => {
  if (!activeClassIdInModal) return;
  if (confirm("Apakah Anda yakin ingin mengeluarkan SEMUA guru dari kelas ini?")) {
    try {
      await updateDoc(doc(db, "classes", activeClassIdInModal), { teacherIds: [] });
      document.getElementById("teacherModal").classList.remove("active");
      await loadClasses();
      showToast("Semua guru berhasil dikeluarkan.");
    } catch (err) {
      console.error(err);
      alert("Gagal mengeluarkan semua guru.");
    }
  }
};

// ==================================================================
// AKSI BERKELOMPOK: KELUARKAN SISWA
// ==================================================================
window.removeSelectedStudents = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".student-item-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih siswa yang ingin dikeluarkan terlebih dahulu!");
    return;
  }

  if (confirm(`Keluarkan ${checkedBoxes.length} siswa terpilih dari kelas ini?`)) {
    try {
      for (const cb of checkedBoxes) {
        await updateDoc(doc(db, "students", cb.value), { classId: "" });
      }
      document.getElementById("studentModal").classList.remove("active");
      await loadClasses();
      showToast("Siswa terpilih berhasil dikeluarkan.");
    } catch (err) {
      console.error(err);
      alert("Gagal mengeluarkan siswa terpilih.");
    }
  }
};

window.removeAllStudents = async () => {
  if (!activeClassIdInModal) return;
  if (confirm("Apakah Anda yakin ingin mengeluarkan SEMUA siswa dari kelas ini?")) {
    try {
      const qStudents = query(collection(db, "students"), where("classId", "==", activeClassIdInModal));
      const studentsSnap = await getDocs(qStudents);
      for (const sDoc of studentsSnap.docs) {
        await updateDoc(doc(db, "students", sDoc.id), { classId: "" });
      }
      document.getElementById("studentModal").classList.remove("active");
      await loadClasses();
      showToast("Semua siswa berhasil dikeluarkan.");
    } catch (err) {
      console.error(err);
      alert("Gagal mengeluarkan semua siswa.");
    }
  }
};

window.closeClassModal = () => document.getElementById("classModal").classList.remove("active");
window.closeStudentModal = () => document.getElementById("studentModal").classList.remove("active");
window.closeTeacherModal = () => document.getElementById("teacherModal").classList.remove("active");
window.closeAddTeacherModal = () => document.getElementById("addTeacherModal").classList.remove("active");

function showToast(message) {
  const toast = document.getElementById("toast");
  if(toast) {
    toast.innerText = message;
    toast.classList.add("active");
    setTimeout(() => toast.classList.remove("active"), 3000);
  }
}

// ==========================================
// SAVE & EXPORT 
// ==========================================
window.saveClass = async () => {
  const classId = document.getElementById("classId").value;
  const className = document.getElementById("className").value.trim();

  let selectedTeacherIds = [];
  if (teacherSelectInstance) {
    selectedTeacherIds = teacherSelectInstance.getValue(); 
    if (typeof selectedTeacherIds === 'string') {
      selectedTeacherIds = selectedTeacherIds ? [selectedTeacherIds] : [];
    }
  }

  if (!className) {
    alert("Nama kelas tidak boleh kosong!");
    return;
  }

  try {
    if (classId) {
      await updateDoc(doc(db, "classes", classId), { 
        name: className,
        teacherIds: selectedTeacherIds
      });
    } else {
      await addDoc(collection(db, "classes"), {
        name: className,
        schoolId: currentSchoolId,
        teacherIds: selectedTeacherIds
      });
    }
    
    window.closeClassModal();
    await loadClasses(); 
    showToast("Data kelas berhasil disimpan!");
  } catch (err) {
    console.error("Gagal menyimpan data kelas:", err);
    alert("Gagal menyimpan data kelas!");
  }
};

window.exportClassesExcel = () => {
  const table = document.querySelector("table");
  if (!table) return;
  const tempTable = table.cloneNode(true);
  tempTable.querySelectorAll("tr").forEach(row => {
    if (row.lastElementChild) row.removeChild(row.lastElementChild); 
  });
  try {
    const wb = XLSX.utils.table_to_book(tempTable, { sheet: "Data Kelas" });
    XLSX.writeFile(wb, `Data_Kelas_${currentSchoolName.replace(/\s+/g, '_')}.xlsx`);
  } catch (err) {
    alert("Gagal mengekspor data ke Excel.");
  }
};

window.exportClassesPDF = async () => {
  const btnEl = document.querySelector("button[onclick='exportClassesPDF()']");
  const originalBtnText = btnEl ? btnEl.innerText : "Export PDF";
  if (btnEl) btnEl.innerText = "⏳ Memproses Laporan...";
  
  try {
    const schoolName = currentSchoolName || "Sekolah";
    const schoolLogo = currentSchoolLogo || "/LMS/assets/images/default-logo.png";
    const date = new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' });

    let classesQuery = collection(db, "classes");
    if (currentSchoolId) {
      classesQuery = query(collection(db, "classes"), where("schoolId", "==", currentSchoolId));
    }
    const classSnap = await getDocs(classesQuery);
    if (classSnap.empty) {
      alert("Tidak ada data kelas yang tersedia untuk diexport!");
      if (btnEl) btnEl.innerText = originalBtnText;
      return;
    }

    const studentsQuery = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const studentsSnap = await getDocs(studentsQuery);
    const studentsByClassMap = {};
    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      if (sData.classId) {
        if (!studentsByClassMap[sData.classId]) studentsByClassMap[sData.classId] = [];
        studentsByClassMap[sData.classId].push(sData);
      }
    });

    let summaryRowsHtml = "";
    let detailSectionsHtml = "";

    for (const classDoc of classSnap.docs) {
      const classId = classDoc.id;
      const classData = classDoc.data();
      const className = classData.name || "-";
      const teacherIds = classData.teacherIds || [];
      const classStudents = studentsByClassMap[classId] || [];

      summaryRowsHtml += `<tr><td><b>${className}</b></td><td>${teacherIds.length} Guru</td><td>${classStudents.length} Siswa</td></tr>`;

      let teacherRows = "";
      if (teacherIds.length > 0) {
        for (const tId of teacherIds) {
          const tSnap = await getDoc(doc(db, "users", tId));
          if (tSnap.exists()) {
            const tData = tSnap.data();
            const mapel = tData.subjects && tData.subjects.length > 0 ? tData.subjects.join(", ") : "-";
            teacherRows += `<tr><td>${tData.name || "-"}</td><td>${tData.email || "-"}</td><td>${mapel}</td><td>${tData.status || "aktif"}</td></tr>`;
          }
        }
      } else {
        teacherRows = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada guru pengampu.</td></tr>`;
      }

      let studentRows = "";
      if (classStudents.length > 0) {
        classStudents.forEach(sData => {
          studentRows += `<tr><td>${sData.name || "-"}</td><td>${sData.email || "-"}</td><td>${sData.status || "aktif"}</td></tr>`;
        });
      } else {
        studentRows = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
      }

      detailSectionsHtml += `
        <div class="class-section" style="page-break-inside: avoid; margin-top: 30px;">
          <h3 style="background: #f1f5f9; padding: 8px; border-left: 4px solid #4f46e5; margin-bottom: 10px;">🏫 KELAS: ${className.toUpperCase()}</h3>
          <h4 style="margin: 10px 0 5px 0; color: #4f46e5;">📋 Daftar Guru Pengampu</h4>
          <table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Nama Guru</th>
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Email</th>
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Mata Pelajaran</th>
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>${teacherRows}</tbody>
          </table>
          <h4 style="margin: 10px 0 5px 0; color: #4f46e5;">👶 Daftar Siswa</h4>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Nama Siswa</th>
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Email</th>
                <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>${studentRows}</tbody>
          </table>
        </div>`;
    }

    // Membuka tab baru untuk mencetak PDF secara rapi
    const win = window.open("", "_blank");
    win.document.write(`
      <html>
      <head>
        <title>Laporan Data Kelas - ${schoolName}</title>
        <style>
          body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #334155; padding: 20px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #cbd5e1; padding-bottom: 15px; margin-bottom: 20px; }
          .school-info { text-align: right; }
          @media print {
            .no-print { display: none; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <img src="${schoolLogo}" alt="Logo" style="max-height: 70px; object-fit: contain;">
          <div class="school-info">
            <h2 style="margin: 0; color: #1e3a8a;">LAPORAN DATA KELAS</h2>
            <h4 style="margin: 5px 0 0 0; color: #475569;">${schoolName}</h4>
            <small style="color: #94a3b8;">Dicetak pada: ${date}</small>
          </div>
        </div>

        <h3 style="color: #1e3a8a;">📊 Ringkasan Kelas</h3>
        <table>
          <thead>
            <tr>
              <th>Nama Kelas</th>
              <th>Total Guru Pengampu</th>
              <th>Total Siswa Terdaftar</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRowsHtml}
          </tbody>
        </table>

        <div style="margin-top: 40px; page-break-before: always;">
          <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 5px;">🔍 Detail Anggota Kelas</h2>
          ${detailSectionsHtml}
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  } catch (err) {
    console.error("Gagal melakukan export PDF:", err);
    alert("Terjadi kesalahan saat menyusun dokumen PDF.");
  } finally {
    if (btnEl) btnEl.innerText = originalBtnText;
  }
};
