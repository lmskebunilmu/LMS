import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"; // Note: Pastikan import firestore sesuai versi Anda, biasanya dari .../firebase-firestore.js seperti kode awal Anda

let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "/LMS/assets/images/default-logo.png";

let classIdToDelete = null;
let activeClassIdInModal = null;
let teacherSelectInstance = null;
let isTeachersLoaded = false; // Flag untuk memastikan opsi dropdown guru siap

// UTILITY: CHECKBOX PILIH SEMUA
window.toggleSelectAll = (listId, masterCheckbox) => {
  const checkboxes = document.querySelectorAll(`#${listId} input[type="checkbox"].main-item-cb`);
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

// AUTH + INITIALIZATION
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
      await loadTeachersToSelect(); // Memuat daftar opsi guru terlebih dahulu
      await loadClasses();
      initClassSearch();
    }
  } catch (err) {
    console.error("Gagal inisialisasi halaman kelas:", err);
  }
});

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

// LOAD DATA KELAS (FIRESTORE)
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

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const classId = docSnap.id;
      
      const classNameClean = data.name ? data.name : "-";
      const classNameForAttribute = classNameClean.replace(/'/g, "\\'");
      
      const totalTeachers = data.teachers ? data.teachers.length : 0;
      const totalStudents = studentCountMap[classId] || 0;

      // Ambil Nama Wali Kelas
      let homeroomName = "Belum ditentukan";
      if (data.homeroomTeacherId) {
        const hrSnap = await getDoc(doc(db, "users", data.homeroomTeacherId));
        if (hrSnap.exists()) {
          homeroomName = hrSnap.data().name || "Tanpa Nama";
        }
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <b>${classNameClean}</b><br>
          <small style="color: #64748b; font-size:11px;">👑 Wali Kelas: <b>${homeroomName}</b></small>
        </td>
        <td><a href="#" onclick="openTeacherDetailModal('${classId}', '${classNameForAttribute}')" style="color: #4f46e5; font-weight: 600; text-decoration: none;"> ${totalTeachers} Guru</a></td>
        <td><a href="#" onclick="openStudentDetailModal('${classId}', '${classNameForAttribute}')" style="color: #4f46e5; font-weight: 600; text-decoration: none;"> ${totalStudents} Siswa</a></td>
        <td>
          <button class="btn-info" onclick="viewClass('${classId}', '${classNameForAttribute}')">👁️ Lihat Semua</button>
          <button class="btn-warning" onclick="editClass('${classId}', '${classNameForAttribute}')">✏️ Edit</button>
          <button class="btn-danger" onclick="deleteClass('${classId}', '${classNameForAttribute}')" style="background-color: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ Hapus</button>
        </td>
      `;
      tableBody.appendChild(tr);
    }
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

async function loadTeachersToSelect() {
  const selectEl = document.getElementById("teacherSelect");
  const homeroomEl = document.getElementById("homeroomSelect");
  if (!selectEl || !homeroomEl) return;

  selectEl.innerHTML = '<option value="">Pilih Guru</option>';
  homeroomEl.innerHTML = '<option value="">Pilih Wali Kelas (Opsional)</option>';

  try {
    const teacherQuery = query(
      collection(db, "users"),
      where("role", "==", "guru"),
      where("schoolId", "==", currentSchoolId)
    );

    const snap = await getDocs(teacherQuery);
    
    snap.forEach(docSnap => {
      const teacherData = docSnap.data();
      const tId = docSnap.id;
      const tName = teacherData.name || "Tanpa Nama";

      const option1 = document.createElement("option");
      option1.value = tId; 
      option1.textContent = tName;
      selectEl.appendChild(option1);

      const option2 = document.createElement("option");
      option2.value = tId;
      option2.textContent = tName;
      homeroomEl.appendChild(option2);
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
    isTeachersLoaded = true; // Menandakan opsi data sukses dirender ke DOM
  } catch (err) {
    console.error("Gagal memuat daftar guru untuk opsi kelas:", err);
  }
}

// CONTROL MODAL & ACTIONS
window.openClassModal = () => {
  document.getElementById("classId").value = "";
  document.getElementById("className").value = "";
  document.getElementById("homeroomSelect").value = "";
  document.getElementById("classModalTitle").innerText = "Tambah Kelas";
  if (teacherSelectInstance) teacherSelectInstance.clear();
  document.getElementById("classModal").classList.add("active");
};

window.editClass = async (id, name) => {
  document.getElementById("classId").value = id;
  document.getElementById("className").value = name;
  document.getElementById("classModalTitle").innerText = "Edit Kelas";

  // Pastikan data opsi guru di elemen select sudah ter-load sebelum men-set value
  if (!isTeachersLoaded) {
    await loadTeachersToSelect();
  }

  try {
    const classSnap = await getDoc(doc(db, "classes", id));
    if (classSnap.exists()) {
      const classData = classSnap.data();
      
      // Mengisi kembali dropdown Wali Kelas yang sesuai dengan Database
      document.getElementById("homeroomSelect").value = classData.homeroomTeacherId || "";

      // Ekstrak list ID saja untuk dicocokkan ke TomSelect komponen lama
      const currentTeachers = classData.teachers || [];
      const currentTeacherIds = currentTeachers.map(item => item.teacherId);
      if (teacherSelectInstance) {
        teacherSelectInstance.setValue(currentTeacherIds);
      }
    }
  } catch (err) {
    console.error("Gagal memuat data guru pada edit kelas:", err);
  }
  document.getElementById("classModal").classList.add("active");
};

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

// --- MODAL: LIHAT DETAIL GURU (MENAMPILKAN MAPEL KHUSUS KELAS) ---
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
      const classTeachers = classSnap.data().teachers || [];
      teacherList.innerHTML = "";
      
      if(classTeachers.length === 0) {
        teacherList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Belum ada guru pengampu di kelas ini.</li>";
        return;
      }

      for (const item of classTeachers) {
        const tSnap = await getDoc(doc(db, "users", item.teacherId));
        if (tSnap.exists()) {
          const mapelDiKelas = item.subjects && item.subjects.length > 0 ? item.subjects.join(", ") : "Tidak mengajar mapel (Klik 'Masukkan Guru Baru' untuk atur mapel)";
          const li = document.createElement("li");
          li.style.cssText = "padding: 10px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;";
          li.innerHTML = `
            <input type="checkbox" class="teacher-item-cb main-item-cb" value="${item.teacherId}" style="cursor:pointer;">
            <span>👨‍🏫 <b>${tSnap.data().name || "Tanpa Nama"}</b> (${tSnap.data().email || "-"}) <br>
            <small style="color:#4f46e5;">Mengajar Pelajaran: <b>${mapelDiKelas}</b></small></span>
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

// --- MODAL: LIHAT DETAIL SISWA ---
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
        <input type="checkbox" class="student-item-cb main-item-cb" value="${sDoc.id}" style="cursor:pointer;">
        <span>👶 <b>${sData.name || "Tanpa Nama"}</b> (${sData.email || "-"})</span>
      `;
      studentList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    studentList.innerHTML = "<li style='color:red;'>❌ Gagal memuat data.</li>";
  }
};

window.viewClass = (id, name) => {
  window.openStudentDetailModal(id, name);
};

// AKSI BERKELOMPOK: KELUARKAN GURU
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
        let currentTeachers = classSnap.data().teachers || [];
        const idsToRemove = Array.from(checkedBoxes).map(cb => cb.value);
        const updatedTeachers = currentTeachers.filter(t => !idsToRemove.includes(t.teacherId));
        
        await updateDoc(classRef, { teachers: updatedTeachers });
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
      await updateDoc(doc(db, "classes", activeClassIdInModal), { teachers: [] });
      document.getElementById("teacherModal").classList.remove("active");
      await loadClasses();
      showToast("Semua guru berhasil dikeluarkan.");
    } catch (err) {
      console.error(err);
      alert("Gagal mengeluarkan semua guru.");
    }
  }
};

// AKSI BERKELOMPOK: KELUARKAN SISWA
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

// SAVE & EXPORT 
window.saveClass = async () => {
  const classId = document.getElementById("classId").value;
  const className = document.getElementById("className").value.trim();
  const homeroomTeacherId = document.getElementById("homeroomSelect").value;

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
    let existingTeachersMap = {};
    if (classId) {
      const oldSnap = await getDoc(doc(db, "classes", classId));
      if (oldSnap.exists() && oldSnap.data().teachers) {
        oldSnap.data().teachers.forEach(t => { 
          existingTeachersMap[t.teacherId] = t.subjects || []; 
        });
      }
    }

    const updatedTeachersArray = selectedTeacherIds.map(tId => {
      return {
        teacherId: tId,
        subjects: existingTeachersMap[tId] || [] // Mempertahankan mapel lama agar tidak ter-reset jadi array kosong saat simpan nama kelas
      };
    });

    const payload = {
      name: className,
      homeroomTeacherId: homeroomTeacherId,
      teachers: updatedTeachersArray
    };

    if (classId) {
      await updateDoc(doc(db, "classes", classId), payload);
    } else {
      payload.schoolId = currentSchoolId;
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

// EXPORT PDF GABUNGAN
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
        if (!studentsByClassMap[sData.classId]) {
          studentsByClassMap[sData.classId] = [];
        }
        studentsByClassMap[sData.classId].push(sData);
      }
    });

    let summaryRowsHtml = "";
    let detailSectionsHtml = "";

    for (const classDoc of classSnap.docs) {
      const classId = classDoc.id;
      const classData = classDoc.data();
      const className = classData.name || "-";
      const classTeachers = classData.teachers || [];
      const classStudents = studentsByClassMap[classId] || [];

      summaryRowsHtml += `
        <tr>
          <td><b>${className}</b></td>
          <td><span class="badge blue">${classTeachers.length} Guru</span></td>
          <td><span class="badge indigo">${classStudents.length} Siswa</span></td>
        </tr>
      `;

      let teacherRows = "";
      if (classTeachers.length > 0) {
        for (const item of classTeachers) {
          const tSnap = await getDoc(doc(db, "users", item.teacherId));
          if (tSnap.exists()) {
            const tData = tSnap.data();
            const mapel = item.subjects && item.subjects.length > 0 ? item.subjects.join(", ") : "-";
            const status = tData.status || "aktif";
            teacherRows += `
              <tr>
                <td>${tData.name || "-"}</td>
                <td>${tData.email || "-"}</td>
                <td>${mapel}</td>
                <td><span class="badge ${status === 'aktif' ? 'green' : 'red'}">${status}</span></td>
              </tr>
            `;
          }
        }
      } else {
        teacherRows = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada guru pengampu.</td></tr>`;
      }

      let studentRows = "";
      if (classStudents.length > 0) {
        classStudents.forEach(sData => {
          const status = sData.status || "aktif";
          studentRows += `
            <tr>
              <td>${sData.name || "-"}</td>
              <td>${sData.email || "-"}</td>
              <td><span class="badge ${status === 'aktif' ? 'green' : 'red'}">${status}</span></td>
            </tr>
          `;
        });
      } else {
        studentRows = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
      }

      detailSectionsHtml += `
        <div class="class-section">
          <div class="class-header">🏫 KELAS: ${className.toUpperCase()}</div>
          <div class="sub-title-data">📋 Daftar Guru Pengampu</div>
          <table>
            <thead>
              <tr>
                <th>Nama Guru</th>
                <th>Email</th>
                <th>Mata Pelajaran (Kelas Ini)</th>
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

    const win = window.open("", "_blank");
    win.document.write(`
    <html>
    <head>
      <title>Laporan Laporan Lengkap - ${schoolName}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Inter', Arial, sans-serif; background: linear-gradient(135deg, #eef2ff, #f8fafc); padding: 40px; margin: 0; color: #0f172a; }
        .container { max-width: 900px; margin: auto; }
        .card { background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); border-radius: 16px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
        .left { display: flex; align-items: center; gap: 12px; }
        .logo { width: 45px; height: 45px; border-radius: 10px; object-fit: cover; }
        .school-name { font-weight: 600; font-size: 16px; }
        .meta { font-size: 12px; color: #64748b; }
        .title { font-size: 24px; font-weight: 700; color: #1e3a8a; margin-bottom: 5px; }
        .subtitle { font-size: 13px; color: #64748b; margin-bottom: 25px; }
        .section-main-title { font-size: 16px; font-weight: 700; color: #4f46e5; margin: 30px 0 15px 0; border-left: 4px solid #6366f1; padding-left: 10px; }
        .class-section { margin-bottom: 35px; page-break-inside: avoid; }
        .class-header { font-size: 14px; font-weight: 700; color: #ffffff; background: #1e3a8a; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; }
        .sub-title-data { font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; padding-left: 2px;}
        table { width: 100%; border-collapse: separate; border-spacing: 0 6px; margin-bottom: 15px; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px; color: white; background: linear-gradient(135deg, #6366f1, #4f46e5); }
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
        .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        .chip { background: #e0e7ff; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; color: #3730a3; }
        @media print { body { background: none; padding: 0; } .card { box-shadow: none; padding: 0; } .class-divider { page-break-after: always; visibility: hidden; height: 0; margin: 0; } .page-break { page-break-before: always; } }
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
                <div class="meta">Laporan Komprehensif Sistem Akademik</div>
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
      <script>window.print();</script>
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

// FITUR TAMBAH/MASUKKAN SISWA KE KELAS
window.openAddStudentModal = async () => {
  if (!activeClassIdInModal) return;
  const addStudentList = document.getElementById("addStudentList");
  addStudentList.innerHTML = "<li>⏳ Memuat siswa yang belum punya kelas...</li>";
  document.getElementById("addStudentModal").classList.add("active");

  try {
    const q = query(collection(db, "students"), where("schoolId", "==", currentSchoolId));
    const snap = await getDocs(q);
    addStudentList.innerHTML = "";

    let count = 0;
    snap.forEach(sDoc => {
      const sData = sDoc.data();
      if (!sData.classId) {
        count++;
        const li = document.createElement("li");
        li.style.cssText = "padding: 8px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;";
        li.innerHTML = `
          <input type="checkbox" class="add-student-cb main-item-cb" value="${sDoc.id}" style="cursor:pointer;">
          <span>👶 <b>${sData.name || "Tanpa Nama"}</b> (${sData.email || "-"})</span>
        `;
        addStudentList.appendChild(li);
      }
    });

    if (count === 0) {
      addStudentList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Semua siswa sekolah ini sudah memiliki kelas.</li>";
    }
  } catch (err) {
    console.error(err);
    addStudentList.innerHTML = "<li style='color:red;'>❌ Gagal memuat data siswa.</li>";
  }
};

window.addSelectedStudents = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".add-student-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih siswa yang ingin dimasukkan terlebih dahulu!");
    return;
  }

  try {
    for (const cb of checkedBoxes) {
      await updateDoc(doc(db, "students", cb.value), { classId: activeClassIdInModal });
    }
    document.getElementById("addStudentModal").classList.remove("active");
    document.getElementById("studentModal").classList.remove("active");
    await loadClasses();
    showToast(`${checkedBoxes.length} Siswa berhasil dimasukkan ke kelas.`);
  } catch (err) {
    console.error(err);
    alert("Gagal menambahkan siswa terpilih.");
  }
};

window.toggleAllAddStudents = (masterCheckbox) => {
  const checkboxes = document.querySelectorAll(".add-student-cb");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.filterAddStudents = () => {
  const keyword = document.getElementById("addStudentSearch").value.toLowerCase();
  document.querySelectorAll("#addStudentList li").forEach(li => {
    li.style.display = li.innerText.toLowerCase().includes(keyword) ? "" : "none";
  });
};

// FITUR MEMINDAHKAN KELAS SISWA
window.moveSelectedStudents = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".student-item-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih siswa yang ingin dipindahkan terlebih dahulu!");
    return;
  }

  try {
    const classSnap = await getDocs(query(collection(db, "classes"), where("schoolId", "==", currentSchoolId)));
    let classOptions = "";
    classSnap.forEach(cDoc => {
      if (cDoc.id !== activeClassIdInModal) {
        classOptions += `\n- ID: ${cDoc.id} | Nama: ${cDoc.data().name}`;
      }
    });

    if (!classOptions) {
      alert("Tidak ada kelas lain yang tersedia untuk tujuan pemindahan.");
      return;
    }

    const targetClassId = prompt(`Masukkan ID Kelas tujuan untuk memindahkan ${checkedBoxes.length} siswa terpilih:${classOptions}\n\n(Salin ID Kelas di atas dan tempel di bawah ini)`);
    if (!targetClassId) return;

    const targetSnap = await getDoc(doc(db, "classes", targetClassId));
    if (!targetSnap.exists()) {
      alert("ID Kelas tujuan tidak valid!");
      return;
    }

    for (const cb of checkedBoxes) {
      await updateDoc(doc(db, "students", cb.value), { classId: targetClassId });
    }

    document.getElementById("studentModal").classList.remove("active");
    await loadClasses();
    showToast(`${checkedBoxes.length} Siswa berhasil dipindahkan ke kelas ${targetSnap.data().name}.`);
  } catch (err) {
    console.error("Gagal memindahkan siswa:", err);
    alert("Terjadi kesalahan sistem saat memindahkan siswa.");
  }
};

// FITUR TAMBAH GURU MASAL BESERTA CHECKBOX MATA PELAJARAN KHUSUS KELAS INI
window.openAddTeacherModal = async () => {
  if (!activeClassIdInModal) return;
  const addTeacherList = document.getElementById("addTeacherList");
  addTeacherList.innerHTML = "<li>⏳ Memuat daftar guru sekolah...</li>";
  document.getElementById("addTeacherModal").classList.add("active");

  try {
    const classSnap = await getDoc(doc(db, "classes", activeClassIdInModal));
    let existingTeacherIds = [];
    let currentClassTeachers = [];
    if (classSnap.exists()) {
      currentClassTeachers = classSnap.data().teachers || [];
      existingTeacherIds = currentClassTeachers.map(t => t.teacherId);
    }

    const teacherQuery = query(
      collection(db, "users"),
      where("role", "==", "guru"),
      where("schoolId", "==", currentSchoolId)
    );
    const snap = await getDocs(teacherQuery);
    addTeacherList.innerHTML = "";

    let count = 0;
    snap.forEach(tDoc => {
      // Izinkan tampil semua guru untuk memperbarui subjek kelas ATAU yang belum ada di kelas ini
      count++;
      const tData = tDoc.data();
      const masterSubjects = tData.subjects || []; // Array dari Profil Guru

      // Cari tahu apakah guru ini sudah ada di kelas dan apa pelajaran yang sudah dicentang sebelumnya
      const foundInClass = currentClassTeachers.find(t => t.teacherId === tDoc.id);
      const activeSubjectsInClass = foundInClass ? foundInClass.subjects || [] : [];
      const isTeacherChecked = foundInClass ? "checked" : "";

      const li = document.createElement("li");
      li.style.cssText = "padding: 12px; border-bottom: 1px solid #e2e8f0; display: block; margin-bottom:5px;";
      
      let subjectCheckboxesHtml = "";
      if (masterSubjects.length > 0) {
        masterSubjects.forEach(sub => {
          const isSubChecked = activeSubjectsInClass.includes(sub) ? "checked" : "";
          subjectCheckboxesHtml += `
            <label style="margin-right: 12px; font-size:12px; display:inline-flex; align-items:center; gap:3px; cursor:pointer; background:#f1f5f9; padding:2px 6px; border-radius:4px;">
              <input type="checkbox" class="sub-checkbox-${tDoc.id}" value="${sub}" ${isSubChecked}> ${sub}
            </label>
          `;
        });
      } else {
        subjectCheckboxesHtml = `<span style="font-size:11px; color:#94a3b8;">Guru belum mengisi kompetensi mata pelajaran di profilnya.</span>`;
      }

      li.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <input type="checkbox" class="add-teacher-cb main-item-cb" value="${tDoc.id}" ${isTeacherChecked} style="cursor:pointer;">
          <span>👨‍🏫 <b>${tData.name || "Tanpa Nama"}</b> (${tData.email || "-"})</span>
        </div>
        <div style="padding-left:22px;">
          <div style="font-size:11px; color:#64748b; margin-bottom:3px;">Mapel khusus di kelas ini:</div>
          ${subjectCheckboxesHtml}
        </div>
      `;
      addTeacherList.appendChild(li);
    });

    if (count === 0) {
      addTeacherList.innerHTML = "<li style='color:#64748b; padding:8px;'>📭 Tidak ada data guru yang terdaftar di sekolah ini.</li>";
    }
  } catch (err) {
    console.error("Gagal memuat modal tambah guru:", err);
    addTeacherList.innerHTML = "<li style='color:red;'>❌ Gagal memuat data guru.</li>";
  }
};

window.addSelectedTeachers = async () => {
  if (!activeClassIdInModal) return;
  const checkedBoxes = document.querySelectorAll(".add-teacher-cb:checked");
  if (checkedBoxes.length === 0) {
    alert("Silahkan pilih minimal 1 guru untuk didaftarkan ke kelas!");
    return;
  }

  try {
    const classRef = doc(db, "classes", activeClassIdInModal);
    
    const newTeachersObjects = Array.from(checkedBoxes).map(cb => {
      const tId = cb.value;
      const selectedSubBoxes = document.querySelectorAll(`.sub-checkbox-${tId}:checked`);
      const checkedSubjects = Array.from(selectedSubBoxes).map(box => box.value);
      return {
        teacherId: tId,
        subjects: checkedSubjects // Mengunci mapel pilihan di tingkat kelas ini
      };
    });

    // Simpan langsung array final guru-guru yang tercentang ke Firestore
    await updateDoc(classRef, { teachers: newTeachersObjects });
    
    document.getElementById("addTeacherModal").classList.remove("active");
    document.getElementById("teacherModal").classList.remove("active");
    await loadClasses();
    showToast(`Daftar guru pengampu & mata pelajaran kelas berhasil diperbarui.`);
  } catch (err) {
    console.error("Gagal menambahkan guru terpilih:", err);
    alert("Gagal menambahkan guru terpilih.");
  }
};

window.toggleAllAddTeachers = (masterCheckbox) => {
  const checkboxes = document.querySelectorAll(".add-teacher-cb");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.filterAddTeachers = () => {
  const keyword = document.getElementById("addTeacherSearch").value.toLowerCase();
  document.querySelectorAll("#addTeacherList > li").forEach(li => {
    li.style.display = li.innerText.toLowerCase().includes(keyword) ? "" : "none";
  });
};
