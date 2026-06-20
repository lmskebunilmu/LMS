import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "/LMS/assets/images/default-logo.png";

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
      
      // Ambil data profil admin & sekolah lalu tampilkan ke header
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

  // Update elemen UI Profil Admin
  const nameEl = document.getElementById("headerNameHeader");
  if (nameEl) nameEl.innerText = name;

  const avatarEl = document.getElementById("headerAvatarHeader");
  if (avatarEl) avatarEl.src = avatar;

  // Ambil data sekolah dari Firestore jika ada ID sekolah
  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      currentSchoolRef = schoolSnap.ref;
      currentSchoolName = schoolData.name || "-";
      currentSchoolLogo = schoolData.logoURL || "/LMS/assets/images/default-logo.png";
    }
  }

  // Update elemen UI Profil Sekolah di Header
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

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      const classNameClean = data.name ? data.name : "-";
      const classNameForAttribute = classNameClean.replace(/'/g, "\\'");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${classNameClean}</b></td>
        <td>${data.teacherIds ? data.teacherIds.length : 0} Guru</td>
        <td>${data.studentIds ? data.studentIds.length : 0} Siswa</td>
        <td>
          <button class="btn-warning" onclick="editClass('${docSnap.id}', '${classNameForAttribute}')">✏️ Edit</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Gagal mengambil data kelas:", err);
    tableBody.innerHTML = "<tr><td colspan='4' style='color:red;'>❌ Gagal memuat data kelas</td></tr>";
  }
}

// ==========================
// SEARCH CLASS
// ==========================
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
let teacherSelectInstance = null; // Menyimpan instance TomSelect secara global

// ==========================
// LOAD GURU KE DROP DOWN SELECT
// ==========================
async function loadTeachersToSelect() {
  const selectEl = document.getElementById("teacherSelect");
  if (!selectEl) return;

  // Bersihkan isi option bawaan HTML
  selectEl.innerHTML = '<option value="">Pilih Guru</option>';

  try {
    // Ambil data user yang merupakan "guru" di sekolah yang sama
    const teacherQuery = query(
      collection(db, "users"),
      where("role", "==", "guru"),
      where("schoolId", "==", currentSchoolId)
    );

    const snap = await getDocs(teacherQuery);
    
    snap.forEach(docSnap => {
      const teacherData = docSnap.data();
      const option = document.createElement("option");
      option.value = docSnap.id; // UID guru sebagai value
      option.textContent = teacherData.name || "Tanpa Nama";
      selectEl.appendChild(option);
    });

    // Inisialisasi TomSelect agar dropdown select multiple terlihat rapi dan bisa dicari
    if (window.TomSelect && !teacherSelectInstance) {
      teacherSelectInstance = new TomSelect("#teacherSelect", {
        plugins: ['remove_button'],
        placeholder: 'Pilih Guru Pengampu...',
        create: false
      });
    } else if (teacherSelectInstance) {
      // Jika data berubah, sinkronkan ulang isi pilihan TomSelect
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
  
  // Reset pilihan guru menjadi kosong saat tambah kelas baru
  if (teacherSelectInstance) {
    teacherSelectInstance.clear();
  }

  document.getElementById("classModal").classList.add("active");
};

window.editClass = async (id, name) => {
  document.getElementById("classId").value = id;
  document.getElementById("className").value = name;
  document.getElementById("classModalTitle").innerText = "Edit Kelas";

  try {
    // Ambil data detail kelas dari Firestore untuk melihat teacherIds yang sudah terdaftar
    const classSnap = await getDoc(doc(db, "classes", id));
    if (classSnap.exists()) {
      const classData = classSnap.data();
      const currentTeacherIds = classData.teacherIds || [];

      // Set value TomSelect secara otomatis berdasarkan array ID guru yang tersimpan
      if (teacherSelectInstance) {
        teacherSelectInstance.setValue(currentTeacherIds);
      }
    }
  } catch (err) {
    console.error("Gagal memuat data guru pada edit kelas:", err);
  }

  document.getElementById("classModal").classList.add("active");
};

window.closeClassModal = () => {
  document.getElementById("classModal").classList.remove("active");
};



window.saveClass = async () => {
  const classId = document.getElementById("classId").value;
  const className = document.getElementById("className").value.trim();

  // Mengambil array ID guru yang dipilih dari TomSelect
  let selectedTeacherIds = [];
  if (teacherSelectInstance) {
    selectedTeacherIds = teacherSelectInstance.getValue(); // Menghasilkan array, misal: ["uid1", "uid2"]
    // Jika TomSelect mengembalikan string tunggal (karena iseng dikosongkan), ubah ke array
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
      // Update nama kelas beserta guru pengampunya
      await updateDoc(doc(db, "classes", classId), { 
        name: className,
        teacherIds: selectedTeacherIds
      });
    } else {
      // Tambah kelas baru dengan struktur default lengkap
      await addDoc(collection(db, "classes"), {
        name: className,
        schoolId: currentSchoolId,
        teacherIds: selectedTeacherIds,
        studentIds: [] // Awalnya kosong, nanti diisi via modal siswa
      });
    }
    
    window.closeClassModal();
    await loadClasses(); 
  } catch (err) {
    console.error("Gagal menyimpan data kelas:", err);
    alert("Gagal menyimpan data kelas!");
  }
};

window.closeStudentModal = () => document.getElementById("studentModal").classList.remove("active");
window.closeTeacherModal = () => document.getElementById("teacherModal").classList.remove("active");
window.closeAddTeacherModal = () => document.getElementById("addTeacherModal").classList.remove("active");
// ==========================
// EXPORT EXCEL (SheetJS)
// ==========================
window.exportClassesExcel = () => {
  const table = document.querySelector("table");
  if (!table) return;

  // Membuat salinan tabel tanpa kolom 'Aksi'
  const tempTable = table.cloneNode(true);
  tempTable.querySelectorAll("tr").forEach(row => {
    if (row.lastElementChild) {
      row.removeChild(row.lastElementChild); // Hapus kolom aksi
    }
  });

  try {
    const wb = XLSX.utils.table_to_book(tempTable, { sheet: "Data Kelas" });
    XLSX.writeFile(wb, `Data_Kelas_${currentSchoolName.replace(/\s+/g, '_')}.xlsx`);
  } catch (err) {
    console.error("Gagal Export Excel:", err);
    alert("Gagal mengekspor data ke Excel.");
  }
};

// ==========================
// EXPORT PDF GABUNGAN (Ringkasan + Detail Per Kelas)
// ==========================
window.exportClassesPDF = async () => {
  // Tampilkan loading sederhana karena menarik data dari Firestore
  const btnEl = document.querySelector("button[onclick='exportClassesPDF()']");
  const originalBtnText = btnEl ? btnEl.innerText : "Export PDF";
  if (btnEl) btnEl.innerText = "⏳ Memproses Laporan...";

  try {
    const schoolName = currentSchoolName || "Sekolah";
    const schoolLogo = currentSchoolLogo || "/LMS/assets/images/default-logo.png";
    const date = new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' });

    // 1. Ambil data kelas langsung dari Firestore
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

    // 2. BAGIAN I: MEMBUAT TABEL RINGKASAN (SUMMARY OVERVIEW)
    let summaryRowsHtml = "";
    
    // Kita juga siapkan wadah untuk menyimpan HTML detail per kelas di bawah nanti
    let detailSectionsHtml = "";

    // Loop data untuk membangun Ringkasan sekaligus mencatat antrean detail
    for (const classDoc of classSnap.docs) {
      const classData = classDoc.data();
      const className = classData.name || "-";
      const teacherIds = classData.teacherIds || [];
      const studentIds = classData.studentIds || [];

      // Masukkan ke baris tabel ringkasan utama
      summaryRowsHtml += `
        <tr>
          <td><b>${className}</b></td>
          <td><span class="badge blue">${teacherIds.length} Guru</span></td>
          <td><span class="badge indigo">${studentIds.length} Siswa</span></td>
        </tr>
      `;

      // --- PROSES BREAKDOWN DETAIL UNTUK BAGIAN II ---
      // A. Detail Guru
      let teacherRows = "";
      if (teacherIds.length > 0) {
        for (const tId of teacherIds) {
          const tSnap = await getDoc(doc(db, "teachers", tId));
          if (tSnap.exists()) {
            const tData = tSnap.data();
            const mapel = tData.subjects && tData.subjects.length > 0 ? tData.subjects.join(", ") : "-";
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

      // B. Detail Siswa (Asumsi nama koleksi: "students")
      let studentRows = "";
      if (studentIds.length > 0) {
        for (const sId of studentIds) {
          const sSnap = await getDoc(doc(db, "students", sId));
          if (sSnap.exists()) {
            const sData = sSnap.data();
            const status = sData.status || "aktif";
            studentRows += `
              <tr>
                <td>${sData.name || "-"}</td>
                <td>${sData.email || "-"}</td>
                <td><span class="badge ${status === 'aktif' ? 'green' : 'red'}">${status}</span></td>
              </tr>
            `;
          }
        }
      } else {
        studentRows = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
      }

      // Gabungkan struktur detail per ruang kelas
      detailSectionsHtml += `
        <div class="class-section">
          <div class="class-header">🏫 KELAS: ${className.toUpperCase()}</div>
          
          <div class="sub-title-data">📋 Daftar Guru Pengampu</div>
          <table>
            <thead>
              <tr>
                <th>Nama Guru</th>
                <th>Email</th>
                <th>Mata Pelajaran</th>
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

    // 3. INJEKSI TEMPLATE KE WINDOW PRINT BARU
    const win = window.open("", "_blank");
    win.document.write(`
    <html>
    <head>
      <title>Laporan Akademik Lengkap - ${schoolName}</title>
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
        
        /* SECTION TITLE STYLE */
        .section-main-title {
          font-size: 16px; font-weight: 700; color: #4f46e5;
          margin: 30px 0 15px 0; border-left: 4px solid #6366f1; padding-left: 10px;
        }

        /* CLASS SECTION STYLING */
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
