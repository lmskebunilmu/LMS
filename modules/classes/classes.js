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
let allTeachersData = {}; // Menyimpan data master guru & mapelnya dari sekolah

async function loadTeachersToSelect() {
  const selectEl = document.getElementById("teacherSelect");
  const homeroomSelectEl = document.getElementById("homeroomTeacherSelect");
  if (!selectEl || !homeroomSelectEl) return;

  selectEl.innerHTML = '<option value="">Pilih Guru</option>';
  homeroomSelectEl.innerHTML = '<option value="">Pilih Wali Kelas (Opsional)</option>';

  try {
    // 🔥 DISESUAIKAN: Mengambil dari koleksi "teachers" sesuai dengan teachers.js
    const teacherQuery = query(
      collection(db, "teachers"),
      where("schoolId", "==", currentSchoolId)
    );

    const snap = await getDocs(teacherQuery);
    allTeachersData = {}; // Reset penampung data master
    
    snap.forEach(docSnap => {
      const teacherData = docSnap.data();
      const teacherId = docSnap.id; // Ini adalah UID user guru tersebut
      allTeachersData[teacherId] = teacherData;

      // Isi Dropdown Opsi Wali Kelas
      const optHome = document.createElement("option");
      optHome.value = teacherId;
      optHome.textContent = teacherData.name || "Tanpa Nama";
      homeroomSelectEl.appendChild(optHome);

      // Isi Dropdown Opsi Guru Pengampu
      const option = document.createElement("option");
      option.value = teacherId; 
      option.textContent = teacherData.name || "Tanpa Nama";
      selectEl.appendChild(option);
    });

    if (window.TomSelect && !teacherSelectInstance) {
      teacherSelectInstance = new TomSelect("#teacherSelect", {
        plugins: ['remove_button'],
        placeholder: 'Pilih Guru Pengampu...',
        create: false,
        onChange: function(values) {
          renderTeacherSubjectsMapping(values);
        }
      });
    } else if (teacherSelectInstance) {
      teacherSelectInstance.sync();
    }

  } catch (err) {
    console.error("Gagal memuat daftar guru untuk opsi kelas:", err);
  }
}

// Fungsi pembentuk checklist mapel dinamis berdasarkan pilihan guru pengampu
function renderTeacherSubjectsMapping(selectedTeacherIds, existingMapping = {}) {
  const container = document.getElementById("teacherSubjectsContainer");
  const listEl = document.getElementById("teacherSubjectsList");
  listEl.innerHTML = "";

  if (!selectedTeacherIds || selectedTeacherIds.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";

  selectedTeacherIds.forEach(tId => {
    const teacher = allTeachersData[tId];
    if (!teacher) return;

    // Mengambil keahlian subjek bawaan yang diinput dari teachers.js
    const teacherMapelMaster = teacher.subjects || []; 
    const checkedMapels = existingMapping[tId] || []; // Data mapel yang sudah tersimpan di kelas ini sebelumnya

    const teacherDiv = document.createElement("div");
    teacherDiv.style.cssText = "margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e2e8f0;";
    
    let checkboxesHtml = "";
    if (teacherMapelMaster.length === 0) {
      checkboxesHtml = `<span style="color:#94a3b8; font-size:12px;">Guru ini belum disetting memiliki keahlian mapel di data guru.</span>`;
    } else {
      teacherMapelMaster.forEach(mp => {
        const isChecked = checkedMapels.includes(mp) ? "checked" : "";
        checkboxesHtml += `
          <label style="margin-right: 10px; font-size:13px; cursor:pointer;">
            <input type="checkbox" class="subject-cb-${tId}" value="${mp}" ${isChecked}> ${mp}
          </label>
        `;
      });
    }

    teacherDiv.innerHTML = `
      <div style="font-weight:600; font-size:13px; margin-bottom:4px; color:#1e293b;">👨‍🏫 ${teacher.name}</div>
      <div style="display:flex; flex-wrap:wrap; gap:5px;">${checkboxesHtml}</div>
    `;
    listEl.appendChild(teacherDiv);
  });
}

// ==========================
// CONTROL MODAL & ACTIONS
// ==========================
window.openClassModal = () => {
  document.getElementById("classId").value = "";
  document.getElementById("className").value = "";
  document.getElementById("homeroomTeacherSelect").value = ""; // Reset Wali Kelas
  document.getElementById("teacherSubjectsList").innerHTML = "";
  document.getElementById("teacherSubjectsContainer").style.display = "none";
  document.getElementById("classModalTitle").innerText = "Tambah Kelas";
  if (teacherSelectInstance) teacherSelectInstance.clear();
  document.getElementById("classModal").classList.add("active");
};

window.editClass = async (id) => {
  try {
    const snap = await getDoc(doc(db, "classes", id));
    if (!snap.exists()) {
      showToast("Data kelas tidak ditemukan", "error");
      return;
    }

    const data = snap.data();

    // 1. Isi input dasar form modal edit kelas
    document.getElementById("classId").value = id;
    document.getElementById("className").value = data.name || "";
    
    // Set dropdown wali kelas jika ada
    const homeroomSelect = document.getElementById("homeroomTeacherSelect");
    if (homeroomSelect) homeroomSelect.value = data.homeroomTeacherId || "";

    // 2. Ambil data guru pengampu yang tersimpan (berupa Object Map: { UID_GURU: [mapel1, mapel2] })
    const savedTeachersMapping = data.teachers || {};
    const selectedTeacherIds = Object.keys(savedTeachersMapping);

    // 3. Set nilai pada komponen TomSelect (Dropdown Multi-select Guru Pengampu)
    if (teacherSelectInstance) {
      // Menyetel ulang pilihan guru pengampu di dropdown tanpa memicu error
      teacherSelectInstance.setValue(selectedTeacherIds);
    }

    // 4. 🔥 KUNCI UTAMA: Render ulang checklist mapel dan kirim data mapel yang sudah tersimpan
    // Fungsi ini akan mencentang otomatis (checked) mapel yang sesuai
    renderTeacherSubjectsMapping(selectedTeacherIds, savedTeachersMapping);

    // 5. Tampilkan Modal Edit Kelas
    document.getElementById("classModal").classList.add("active");

  } catch (err) {
    console.error("Gagal memuat data edit kelas:", err);
    showToast("Gagal memuat data kelas", "error");
  }
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
      const classData = classSnap.data();
      const teachersMapping = classData.teachers || {}; // Struktur Map baru kita
      const teacherIds = Object.keys(teachersMapping);
      
      teacherList.innerHTML = "";
      
      if(teacherIds.length === 0) {
        teacherList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Belum ada guru pengampu di kelas ini.</li>";
        return;
      }

      for (const tId of teacherIds) {
        // 🔥 DISESUAIKAN: Mengambil dari koleksi "teachers" agar sinkron
        const tSnap = await getDoc(doc(db, "teachers", tId));
        if (tSnap.exists()) {
          const tData = tSnap.data();
          const mapelDiKelasIni = teachersMapping[tId] && teachersMapping[tId].length > 0 
            ? teachersMapping[tId].join(", ") 
            : "Tidak ada mapel yang dipilih";

          const li = document.createElement("li");
          li.style.cssText = "padding: 10px; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction:column; gap: 2px;";
          li.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="checkbox" class="teacher-item-cb" value="${tId}" style="cursor:pointer;">
              <span>👨‍🏫 <b>${tData.name || "Tanpa Nama"}</b> (${tData.email || "-"})</span>
            </div>
            <div style="font-size:12px; color:#6366f1; margin-left:25px;">Mengampu di kelas ini: <b>${mapelDiKelasIni}</b></div>
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
  const homeroomTeacherId = document.getElementById("homeroomTeacherSelect").value;

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

  // BARU: Strukturkan data guru beserta mapel yang di-checklist di dalam modal kelas
  const teachersObject = {};
  selectedTeacherIds.forEach(tId => {
    const checkboxes = document.querySelectorAll(`.subject-cb-${tId}:checked`);
    const selectedSubjectsForThisClass = Array.from(checkboxes).map(cb => cb.value);
    
    // Simpan array mapel khusus untuk kelas ini
    teachersObject[tId] = selectedSubjectsForThisClass; 
  });

  try {
    const payload = {
      name: className,
      schoolId: currentSchoolId,
      homeroomTeacherId: homeroomTeacherId, // Wali kelas terpilih
      teachers: teachersObject,             // Map guru -> mapel spesifik kelas
      teacherIds: selectedTeacherIds        // Tetap simpan array ID untuk query kecocokan / hitung jumlah
    };

    if (classId) {
      await updateDoc(doc(db, "classes", classId), payload);
    } else {
      await addDoc(collection(db, "classes"), payload);
    }
    
    window.closeClassModal();
    await loadClasses(); 
    showToast("Data kelas berhasil disimpan!");
  } catch (err) {
    console.error("Gagal menyimpan data kelas:", err);
    alert("Gagal menyimpan data kelas!");
  }
};

window.exportClassesExcel = async () => {
  // 1. Feedback loading ke tombol
  const btnEl = document.querySelector("button[onclick='exportClassesExcel()']");
  const originalBtnText = btnEl ? btnEl.innerText : "💾 Export Excel";
  if (btnEl) btnEl.innerText = "⏳ Memproses Per Kelas...";

  try {
    // 2. Ambil data kelas dari Firestore
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

    // Urutkan data kelas berdasarkan nama kelas (A-Z) agar rapi
    const sortedClassDocs = classSnap.docs.sort((a, b) => {
      const nameA = (a.data().name || "").toLowerCase();
      const nameB = (b.data().name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // 3. Ambil data seluruh siswa (Real-time Sync)
    const studentsQuery = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const studentsSnap = await getDocs(studentsQuery);
    
    // Kelompokkan data siswa berdasarkan classId dan urutkan namanya secara alfabet (A-Z)
    const studentsByClassMap = {};
    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      if (sData.classId) {
        if (!studentsByClassMap[sData.classId]) {
          studentsByClassMap[sData.classId] = [];
        }
        studentsByClassMap[sData.classId].push(sData);
      }
    });

    // Urutkan siswa di setiap kelas berdasarkan Nama
    for (const id in studentsByClassMap) {
      studentsByClassMap[id].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    // 4. Siapkan Workbook Baru
    const wb = XLSX.utils.book_new();
    const summaryData = [];

    // 5. Looping data utama untuk membangun Sheet Ringkasan & Sheet per Kelas
    for (const classDoc of sortedClassDocs) {
      const classId = classDoc.id;
      const classData = classDoc.data();
      const className = classData.name || "-";
      
      const classTeachersMapping = classData.teachers || {};
      const classTeacherIds = Object.keys(classTeachersMapping);
      const classStudents = studentsByClassMap[classId] || [];

      // Ambil nama wali kelas jika ada
      let homeroomTeacherName = "- Belum ditentukan";
      if (classData.homeroomTeacherId) {
        const hrSnap = await getDoc(doc(db, "teachers", classData.homeroomTeacherId));
        if (hrSnap.exists()) {
          homeroomTeacherName = hrSnap.data().name || "-";
        }
      }

      // --- KUMPULKAN DATA UNTUK SHEET 1 (RINGKASAN) ---
      summaryData.push({
        "Nama Kelas": className,
        "Wali Kelas": homeroomTeacherName,
        "Total Guru Pengampu": `${classTeacherIds.length} Guru`,
        "Total Siswa Terdaftar": `${classStudents.length} Siswa`
      });

      // --- BANGUN STRUKTUR DATA BARIS PER BARIS UNTUK SHEET KELAS INDIVIDU ---
      const classRows = [];

      // Baris Informasi Wali Kelas
      classRows.push(["INFORMASI KELAS"]);
      classRows.push(["Nama Kelas", className]);
      classRows.push(["Wali Kelas", homeroomTeacherName]);
      classRows.push([]); // Baris kosong pembatas

      // Baris Informasi Guru Pengampu
      classRows.push(["👨‍🏫 DAFTAR GURU PENGAMPU"]);
      classRows.push(["Nama Guru", "Email", "Mata Pelajaran (Di Kelas Ini)", "Status"]); // Header tabel guru

      if (classTeacherIds.length > 0) {
        const tempTeachers = [];
        for (const tId of classTeacherIds) {
          const tSnap = await getDoc(doc(db, "teachers", tId));
          if (tSnap.exists()) {
            const tData = tSnap.data();
            const mapelSpesifik = classTeachersMapping[tId] && classTeachersMapping[tId].length > 0 
              ? classTeachersMapping[tId].join(", ") 
              : "Tidak ada mapel terpilih";

            tempTeachers.push({
              name: tData.name || "-",
              email: tData.email || "-",
              subject: mapelSpesifik,
              status: tData.status || "aktif"
            });
          }
        }
        // Urutkan daftar guru berdasarkan nama (A-Z)
        tempTeachers.sort((a, b) => a.name.localeCompare(b.name));
        tempTeachers.forEach(t => {
          classRows.push([t.name, t.email, t.subject, t.status]);
        });
      } else {
        classRows.push(["Belum ada guru pengampu di kelas ini", "", "", ""]);
      }

      classRows.push([]); // Baris kosong pembatas

      // Baris Informasi Siswa
      classRows.push(["👶 DAFTAR SISWA TERDAFTAR"]);
      classRows.push(["No", "Nama Siswa", "Email", "Status"]); // Header tabel siswa

      if (classStudents.length > 0) {
        classStudents.forEach((sData, index) => {
          classRows.push([
            index + 1,
            sData.name || "-",
            sData.email || "-",
            sData.status || "aktif"
          ]);
        });
      } else {
        classRows.push(["-", "Belum ada siswa terdaftar di kelas ini", "", ""]);
      }

      // Saring nama sheet agar tidak mengandung karakter ilegal Excel (: , \ , / , ? , * , [ , ]) dan maks 31 karakter
      const safeSheetName = className.replace(/[:\\/?*\[\]]/g, "").substring(0, 31);

      // Convert array 2D menjadi worksheet dan masukkan ke workbook
      const wsClass = XLSX.utils.aoa_to_sheet(classRows);
      XLSX.utils.book_append_sheet(wb, wsClass, safeSheetName);
    }

    // 6. Buat Sheet Pertama (Ringkasan) di paling depan
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan Kelas");

    // Pindahkan posisi sheet ringkasan menjadi yang pertama/paling kiri
    const totalSheets = wb.SheetNames.length;
    const lastSheetName = wb.SheetNames[totalSheets - 1];
    wb.SheetNames.pop(); // Hapus dari akhir
    wb.SheetNames.unshift(lastSheetName); // Masukkan ke paling depan

    // 7. Unduh File Excel (.xlsx)
    const fileName = `Laporan_Kelas_Komprehensif_${(currentSchoolName || "Sekolah").replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);

  } catch (err) {
    console.error("Gagal mengekspor data ke Excel per Kelas:", err);
    alert("Gagal mengekspor data ke Excel.");
  } finally {
    // Kembalikan teks tombol ke kondisi awal
    if (btnEl) btnEl.innerText = originalBtnText;
  }
};

// ==========================
// ==========================================
// EXPORT PDF GABUNGAN (Ringkasan + Detail Sinkron Siswa) - DATA TERURUT A-Z
// ==========================================
window.exportClassesPDF = async () => {
  const btnEl = document.querySelector("button[onclick='exportClassesPDF()']");
  const originalBtnText = btnEl ? btnEl.innerText : "Export PDF";
  if (btnEl) btnEl.innerText = "⏳ Memproses Laporan...";

  try {
    const schoolName = currentSchoolName || "Sekolah";
    const schoolLogo = currentSchoolLogo || "/LMS/assets/images/default-logo.png";
    const date = new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' });

    // 1. Ambil data kelas
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

    // Urutkan data dokumen kelas berdasarkan nama kelas (A-Z)
    const sortedClassDocs = classSnap.docs.sort((a, b) => {
      const nameA = (a.data().name || "").toLowerCase();
      const nameB = (b.data().name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // 2. Ambil data seluruh siswa untuk dicocokkan berdasarkan classId (Real-time Sync)
    const studentsQuery = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const studentsSnap = await getDocs(studentsQuery);
    
    // Kelompokkan data object siswa berdasarkan classId
    const studentsByClassMap = {};
    studentsSnap.forEach(sDoc => {
      const sData = sDoc.data();
      if (sData.classId) {
        if (!studentsByClassMap[sData.classId]) {
          studentsByClassMap[sData.classId] = [];
        }
        studentsByClassMap[sData.classId].push(sData);
      }
    });

    // Urutkan siswa di dalam map internal berdasarkan nama (A-Z)
    for (const id in studentsByClassMap) {
      studentsByClassMap[id].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    let summaryRowsHtml = "";
    let detailSectionsHtml = "";

    // 3. Loop bangun Ringkasan dan Detail Breakdown (Data sudah terurut)
    for (const classDoc of sortedClassDocs) {
      const classId = classDoc.id;
      const classData = classDoc.data();
      const className = classData.name || "-";
      
      // Ambil pemetaan guru dari field object `teachers` baru
      const classTeachersMapping = classData.teachers || {};
      const classTeacherIds = Object.keys(classTeachersMapping);
      
      // Ambil data array siswa yang sudah terurut
      const classStudents = studentsByClassMap[classId] || [];

      // Ambil nama wali kelas jika ada
      let homeroomTeacherName = "- Belum ditentukan";
      if (classData.homeroomTeacherId) {
        const hrSnap = await getDoc(doc(db, "teachers", classData.homeroomTeacherId));
        if (hrSnap.exists()) {
          homeroomTeacherName = hrSnap.data().name || "-";
        }
      }

      // Masukkan ke baris tabel ringkasan utama (Bagian I)
      summaryRowsHtml += `
        <tr>
          <td><b>${className}</b></td>
          <td>${homeroomTeacherName}</td>
          <td><span class="badge blue">${classTeacherIds.length} Guru</span></td>
          <td><span class="badge indigo">${classStudents.length} Siswa</span></td>
        </tr>
      `;

      // --- BREAKDOWN DETAIL GURU (Ditarik dulu untuk diurutkan A-Z) ---
      let teacherRows = "";
      if (classTeacherIds.length > 0) {
        const tempTeachers = [];
        
        for (const tId of classTeacherIds) {
          const tSnap = await getDoc(doc(db, "teachers", tId));
          if (tSnap.exists()) {
            const tData = tSnap.data();
            const mapelSpesifik = classTeachersMapping[tId] && classTeachersMapping[tId].length > 0 
              ? classTeachersMapping[tId].join(", ") 
              : "Tidak ada mapel terpilih";

            tempTeachers.push({
              name: tData.name || "-",
              email: tData.email || "-",
              subject: mapelSpesifik,
              status: tData.status || "aktif"
            });
          }
        }

        // Urutkan guru berdasarkan nama (A-Z)
        tempTeachers.sort((a, b) => a.name.localeCompare(b.name));

        // Render baris HTML guru terurut
        tempTeachers.forEach(t => {
          teacherRows += `
            <tr>
              <td>${t.name}</td>
              <td>${t.email}</td>
              <td><b>${t.subject}</b></td>
              <td><span class="badge ${t.status === 'aktif' ? 'green' : 'red'}">${t.status}</span></td>
            </tr>
          `;
        });
      } else {
        teacherRows = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada guru pengampu.</td></tr>`;
      }

      // --- BREAKDOWN DETAIL SISWA ---
      let studentRows = "";
      if (classStudents.length > 0) {
        classStudents.forEach((sData, index) => {
          const status = sData.status || "aktif";
          studentRows += `
            <tr>
              <td style="width: 50px; text-align: center;">${index + 1}</td>
              <td>${sData.name || "-"}</td>
              <td>${sData.email || "-"}</td>
              <td><span class="badge ${status === 'aktif' ? 'green' : 'red'}">${status}</span></td>
            </tr>
          `;
        });
      } else {
        studentRows = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
      }

      // Gabungkan struktur detail per ruang kelas
      detailSectionsHtml += `
        <div class="class-section">
          <div class="class-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span>🏫 KELAS: ${className.toUpperCase()}</span>
            <span style="font-size:12px; font-weight:normal; background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:4px;">Wali Kelas: ${homeroomTeacherName}</span>
          </div>
          
          <div class="sub-title-data">📋 Daftar Guru Pengampu & Mata Pelajaran Diampu</div>
          <table>
            <thead>
              <tr>
                <th>Nama Guru</th>
                <th>Email</th>
                <th>Mata Pelajaran (Di Kelas Ini)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${teacherRows}
            </tbody>
          </table>

          <div class="sub-title-data" style="margin-top: 15px;">👶 Daftar Siswa</div>
          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">No</th>
                <th>Nama Siswa</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${studentRows}
            </tbody>
          </table>
        </div>
        <hr class="class-divider">
      `;
    }

    // 4. INJEKSI TEMPLATE KE WINDOW PRINT BARU
    const win = window.open("", "_blank");
    win.document.write(`
    <html>
    <head>
      <title>Laporan Lengkap - ${schoolName}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Inter', Arial, sans-serif;
          background: linear-gradient(135deg, #eef2ff, #f8fafc);
          padding: 40px; margin: 0; color: #0f172a;
        }
        .container { max-width: 900px; margin: auto; }
        .card {
          background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);
          border-radius: 16px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.08);
        }
        .header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;
        }
        .left { display: flex; align-items: center; gap: 12px; }
        .logo { width: 45px; height: 45px; border-radius: 10px; object-fit: cover; }
        .school-name { font-weight: 600; font-size: 16px; }
        .meta { font-size: 12px; color: #64748b; }
        .title { font-size: 24px; font-weight: 700; color: #1e3a8a; margin-bottom: 5px; }
        .subtitle { font-size: 13px; color: #64748b; margin-bottom: 25px; }
        
        .section-main-title {
          font-size: 16px; font-weight: 700; color: #4f46e5;
          margin: 30px 0 15px 0; border-left: 4px solid #6366f1; padding-left: 10px;
        }
        .class-section { margin-bottom: 35px; page-break-inside: avoid; }
        .class-header {
          font-size: 14px; font-weight: 700; color: #ffffff;
          background: #1e3a8a; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px;
        }
        .sub-title-data { font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; padding-left: 2px;}
        
        table { width: 100%; border-collapse: separate; border-spacing: 0 6px; margin-bottom: 15px; }
        th {
          text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
          padding: 10px; color: white; background: linear-gradient(135deg, #6366f1, #4f46e5);
        }
        th:first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
        th:last-child { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
        tr { background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
        td { padding: 10px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
        
        .badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; display: inline-block; }
        .blue { background: #e0f2fe; color: #0369a1; }
        .indigo { background: #e0e7ff; color: #4338ca; }
        .green { background: #dcfce7; color: #15803d; }
        .red { background: #fee2e2; color: #b91c1c; }
        
        .class-divider { border: 0; height: 1px; background: #cbd5e1; margin: 30px 0; }
        .page-break { page-break-before: always; }
        
        .footer {
          margin-top: 30px; display: flex; justify-content: space-between;
          font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px;
        }
        .chip { background: #e0e7ff; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; color: #3730a3; }
        
        @media print {
          body { background: none; padding: 0; }
          .card { box-shadow: none; padding: 0; }
          .class-divider { page-break-after: always; visibility: hidden; height: 0; margin: 0; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <div class="left">
              <img src="${schoolLogo}" class="logo">
              <div>
                <div class="school-name">${schoolName}</div>
                <div class="meta">Laporan Komprehensif Sistem Academic</div>
              </div>
            </div>
            <div class="chip">📅 ${date}</div>
          </div>

          <div class="title">Laporan Data Kelas & Anggota Akademik</div>
          <div class="subtitle">Menampilkan ringkasan seluruh kelas beserta breakdown informasi guru pengampu dan siswa.</div>

          <div class="section-main-title">I. RINGKASAN DATA KELAS</div>
          <table>
            <thead>
              <tr>
                <th>Nama Kelas</th>
                <th>Wali Kelas</th>
                <th>Total Guru Pengampu</th>
                <th>Total Siswa Terdaftar</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRowsHtml}
            </tbody>
          </table>

          <div class="page-break"></div>

          <div class="section-main-title">II. RINCIAN ANGGOTA PER KELAS</div>
          ${detailSectionsHtml}

          <div class="footer">
            <div>© ${schoolName}</div>
            <div>Generated automatically via LMS System</div>
          </div>
        </div>
      </div>
      <script>
        window.print();
      </script>
    </body>
    </html>
    `);
    win.document.close();

  } catch (err) {
    console.error("Gagal cetak laporan gabungan kelas:", err);
    alert("Terjadi kesalahan saat menarik data gabungan kelas.");
  } finally {
    if (btnEl) btnEl.innerText = originalBtnText;
  }
};
// ==========================================
// FILTER / PENCARIAN DI DALAM MODAL-MODAL
// ==========================================

// 1. Menyaring daftar siswa yang ada di dalam kelas
window.filterStudents = () => {
  const keyword = document.getElementById("studentSearch").value.toLowerCase();
  document.querySelectorAll("#studentList li").forEach(li => {
    li.style.display = li.innerText.toLowerCase().includes(keyword) ? "" : "none";
  });
};

// 2. Menyaring daftar guru yang ada di dalam kelas
window.filterTeachers = () => {
  const keyword = document.getElementById("teacherSearch").value.toLowerCase();
  document.querySelectorAll("#teacherList li").forEach(li => {
    li.style.display = li.innerText.toLowerCase().includes(keyword) ? "" : "none";
  });
};

// 3. Menyaring daftar siswa saat mau menambahkan siswa baru ke kelas
window.filterAddStudents = () => {
  const keyword = document.getElementById("addStudentSearch").value.toLowerCase();
  document.querySelectorAll("#addStudentList li").forEach(li => {
    li.style.display = li.innerText.toLowerCase().includes(keyword) ? "" : "none";
  });
};

// 4. Menyaring daftar guru saat mau menambahkan guru baru ke kelas
window.filterAddTeachers = () => {
  const keyword = document.getElementById("addTeacherSearch").value.toLowerCase();
  document.querySelectorAll("#addTeacherList li").forEach(li => {
    li.style.display = li.innerText.toLowerCase().includes(keyword) ? "" : "none";
  });
};
// ==================================================================
// FITUR: MASUKKAN SISWA BARU (KE KELAS INI)
// ==================================================================
window.openAddStudentModal = async () => {
  if (!activeClassIdInModal) return;
  const addStudentList = document.getElementById("addStudentList");
  addStudentList.innerHTML = "<li>⏳ Memuat siswa yang belum memiliki kelas...</li>";
  
  document.getElementById("addStudentModal").classList.add("active");

  try {
    // Mengambil siswa di sekolah ini yang BELUM memiliki kelas (classId kosong atau tidak ada)
    const q = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const snap = await getDocs(q);
    addStudentList.innerHTML = "";

    let count = 0;
    snap.forEach(sDoc => {
      const sData = sDoc.data();
      // Filter mandiri untuk mencari siswa yang belum punya kelas atau bukan di kelas aktif ini
      if (!sData.classId || sData.classId === "") {
        count++;
        const li = document.createElement("li");
        li.style.cssText = "padding: 8px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;";
        li.innerHTML = `
          <input type="checkbox" class="add-student-cb" value="${sDoc.id}" style="cursor:pointer;">
          <span>👶 <b>${sData.name || "Tanpa Nama"}</b> (${sData.email || "-"})</span>
        `;
        addStudentList.appendChild(li);
      }
    });

    if (count === 0) {
      addStudentList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Semua siswa sekolah sudah memiliki kelas.</li>";
    }
  } catch (err) {
    console.error(err);
    addStudentList.innerHTML = "<li style='color:red;'>❌ Gagal memuat daftar siswa.</li>";
  }
};

window.toggleAllAddStudents = (masterCheckbox) => {
  const checkboxes = document.querySelectorAll(".add-student-cb");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.addSelectedStudents = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".add-student-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih minimal satu siswa!");
    return;
  }

  try {
    // Update field classId pada masing-masing dokumen siswa terpilih
    for (const cb of checkedBoxes) {
      await updateDoc(doc(db, "students", cb.value), { classId: activeClassIdInModal });
    }
    
    document.getElementById("addStudentModal").classList.remove("active");
    document.getElementById("studentModal").classList.remove("active"); // Refresh modal utama
    await loadClasses();
    showToast(`${checkedBoxes.length} Siswa berhasil dimasukkan ke kelas.`);
  } catch (err) {
    console.error(err);
    alert("Gagal menambahkan siswa ke kelas.");
  }
};

// ==================================================================
// FITUR: PINDAHKAN KELAS (DARI KELAS AKTIF KE KELAS LAIN)
// ==================================================================
window.moveSelectedStudents = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".student-item-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih siswa yang ingin dipindahkan terlebih dahulu!");
    return;
  }

  try {
    // 1. Ambil daftar semua kelas di sekolah ini untuk opsi tujuan
    const q = query(collection(db, "classes"), where("schoolId", "==", currentSchoolId));
    const snap = await getDocs(q);
    
    let targetClasses = [];
    snap.forEach(cDoc => {
      if (cDoc.id !== activeClassIdInModal) {
        targetClasses.push({ id: cDoc.id, name: cDoc.data().name });
      }
    });

    if (targetClasses.length === 0) {
      alert("Tidak ada kelas lain di sekolah ini untuk dijadikan tujuan pemindahan.");
      return;
    }

    // 2. Tampilkan prompt pilihan kelas (Sederhana & Efektif)
    let promptMessage = "Pilih angka kelas tujuan pemindahan:\n";
    targetClasses.forEach((c, index) => {
      promptMessage += `${index + 1}. ${c.name}\n`;
    });

    const choice = prompt(promptMessage);
    if (choice === null) return; // Batal

    const chosenIndex = parseInt(choice) - 1;
    if (isNaN(chosenIndex) || chosenIndex < 0 || chosenIndex >= targetClasses.length) {
      alert("Pilihan tidak valid!");
      return;
    }

    const destinationClass = targetClasses[chosenIndex];

    // 3. Eksekusi pemindahan data classId siswa di Firestore
    for (const cb of checkedBoxes) {
      await updateDoc(doc(doc(db, "students", cb.value)), { classId: destinationClass.id });
    }

    document.getElementById("studentModal").classList.remove("active");
    await loadClasses();
    showToast(`${checkedBoxes.length} Siswa berhasil dipindahkan ke kelas ${destinationClass.name}.`);

  } catch (err) {
    console.error(err);
    alert("Gagal memindahkan siswa.");
  }
};

// ==================================================================
// FITUR: MASUKKAN GURU BARU (KE KELAS INI)
// ==================================================================
window.openAddTeacherModal = async () => {
  if (!activeClassIdInModal) return;
  const addTeacherList = document.getElementById("addTeacherList");
  addTeacherList.innerHTML = "<li>⏳ Memuat daftar guru...</li>";
  
  document.getElementById("addTeacherModal").classList.add("active");

  try {
    // 1. Ambil data kelas saat ini untuk tahu siapa saja guru yang sudah bergabung
    const classSnap = await getDoc(doc(db, "classes", activeClassIdInModal));
    const currentTeacherIds = classSnap.exists() ? (classSnap.data().teacherIds || []) : [];

    // 2. Ambil master guru sekolah
    const q = query(collection(db, "teachers"), where("schoolId", "==", currentSchoolId));
    const snap = await getDocs(q);
    addTeacherList.innerHTML = "";

    let count = 0;
    snap.forEach(tDoc => {
      // Hanya tampilkan guru yang belum terdaftar di kelas ini
      if (!currentTeacherIds.includes(tDoc.id)) {
        count++;
        const tData = tDoc.data();
        const li = document.createElement("li");
        li.style.cssText = "padding: 8px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;";
        li.innerHTML = `
          <input type="checkbox" class="add-teacher-cb" value="${tDoc.id}" style="cursor:pointer;">
          <span>👨‍🏫 <b>${tData.name || "Tanpa Nama"}</b> (${tData.email || "-"})</span>
        `;
        addTeacherList.appendChild(li);
      }
    });

    if (count === 0) {
      addTeacherList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Semua guru sudah mengajar di kelas ini.</li>";
    }
  } catch (err) {
    console.error(err);
    addTeacherList.innerHTML = "<li style='color:red;'>❌ Gagal memuat daftar guru.</li>";
  }
};

window.toggleAllAddTeachers = (masterCheckbox) => {
  const checkboxes = document.querySelectorAll(".add-teacher-cb");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.addSelectedTeachers = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".add-teacher-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih minimal satu guru!");
    return;
  }

  try {
    const classRef = doc(db, "classes", activeClassIdInModal);
    const classSnap = await getDoc(classRef);
    
    if (classSnap.exists()) {
      const classData = classSnap.data();
      let currentTeacherIds = classData.teacherIds || [];
      let currentTeachersMapping = classData.teachers || {};

      checkedBoxes.forEach(cb => {
        const tId = cb.value;
        if (!currentTeacherIds.includes(tId)) {
          currentTeacherIds.push(tId);
          // Set mapel default kosong [] agar nanti bisa diatur lewat menu edit kelas
          currentTeachersMapping[tId] = []; 
        }
      });

      // Update struktur data kelas di Firestore
      await updateDoc(classRef, {
        teacherIds: currentTeacherIds,
        teachers: currentTeachersMapping
      });

      document.getElementById("addTeacherModal").classList.remove("active");
      document.getElementById("teacherModal").classList.remove("active"); // Refresh modal utama
      await loadClasses();
      showToast(`${checkedBoxes.length} Guru pengampu berhasil ditambahkan.`);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal menambahkan guru ke kelas.");
  }
};
