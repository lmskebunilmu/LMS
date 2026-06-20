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
// EXPORT PDF (jsPDF + AutoTable)
// ==========================
// ==========================
// EXPORT PDF VIA PRINT WINDOW (Premium Theme)
// ==========================
window.exportClassesPDF = () => {
  const table = document.getElementById("classTable");
  if (!table) return;

  const schoolName = currentSchoolName || "Sekolah";
  const schoolLogo = currentSchoolLogo || "/LMS/assets/images/default-logo.png";
  const date = new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' });

  let rows = "";

  table.querySelectorAll("tr").forEach(row => {
    const cols = row.querySelectorAll("td");
    if (cols.length) {
      rows += `
        <tr>
          <td><b>${cols[0].innerText}</b></td>
          <td>
            <span class="badge blue">
              ${cols[1].innerText}
            </span>
          </td>
          <td>
            <span class="badge indigo">
              ${cols[2].innerText}
            </span>
          </td>
        </tr>
      `;
    }
  });

  if (!rows) {
    alert("Tidak ada data kelas untuk diexport!");
    return;
  }

  const win = window.open("", "_blank");

  win.document.write(`
  <html>
  <head>
    <title>Data Kelas - ${schoolName}</title>

    <style>
      * {
        box-sizing: border-box;
      }

      body {
        font-family: 'Inter', Arial, sans-serif;
        background: linear-gradient(135deg, #eef2ff, #f8fafc);
        padding: 40px;
        margin: 0;
        color: #0f172a;
      }

      .container {
        max-width: 900px;
        margin: auto;
      }

      .card {
        background: rgba(255,255,255,0.9);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        padding: 30px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.08);
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 25px;
      }

      .left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .logo {
        width: 45px;
        height: 45px;
        border-radius: 10px;
        object-fit: cover;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }

      .school-name {
        font-weight: 600;
        font-size: 16px;
      }

      .meta {
        font-size: 12px;
        color: #64748b;
      }

      .title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 5px;
      }

      .subtitle {
        font-size: 13px;
        color: #64748b;
        margin-bottom: 20px;
      }

      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0 10px;
      }

      /* HEADER */
      th {
        text-align: left;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 12px;
        color: white;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
      }

      /* rounded header */
      th:first-child {
        border-top-left-radius: 10px;
        border-bottom-left-radius: 10px;
      }
      th:last-child {
        border-top-right-radius: 10px;
        border-bottom-right-radius: 10px;
      }

      /* ROW STYLE */
      tr {
        background: white;
        box-shadow: 0 5px 12px rgba(0,0,0,0.05);
        border-radius: 12px;
        transition: 0.2s;
      }

      /* CELL */
      td {
        padding: 14px 12px;
        font-size: 14px;
      }

      /* rounded row */
      td:first-child {
        border-top-left-radius: 10px;
        border-bottom-left-radius: 10px;
      }
      td:last-child {
        border-top-right-radius: 10px;
        border-bottom-right-radius: 10px;
      }

      /* HOVER EFFECT */
      tr:hover {
        transform: scale(1.01);
        box-shadow: 0 10px 20px rgba(0,0,0,0.08);
      }

      /* ZEBRA */
      tbody tr:nth-child(even) {
        background: #f8fafc;
      }

      .badge {
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        display: inline-block;
      }

      .blue {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
      }

      .indigo {
        background: linear-gradient(135deg, #6366f1, #4338ca);
        color: white;
      }

      .footer {
        margin-top: 30px;
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #94a3b8;
      }

      .chip {
        background: #e0e7ff;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
        color: #3730a3;
      }

      @media print {
        body {
          background: none;
          padding: 0;
        }
        .card {
          box-shadow: none;
          padding: 0;
        }
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
              <div class="meta">Laporan Sistem Akademik</div>
            </div>
          </div>

          <div class="chip">📅 ${date}</div>
        </div>

        <div class="title">Data Kelas</div>
        <div class="subtitle">Daftar info kelas, jumlah guru pengampu, dan total siswa terpilih</div>

        <table>
          <thead>
            <tr>
              <th>Nama Kelas</th>
              <th>Jumlah Guru</th>
              <th>Jumlah Siswa</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="footer">
          <div>© ${schoolName}</div>
          <div>Generated automatically</div>
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
};
