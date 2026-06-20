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
window.exportClassesPDF = async () => {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. TAMBAHKAN LOGO SEKOLAH
    let imageLoaded = false;
    if (currentSchoolLogo) {
      try {
        const toBase64 = url => fetch(url)
          .then(response => response.blob())
          .then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }));
        
        const base64Img = await toBase64(currentSchoolLogo);
        doc.addImage(base64Img, 'PNG', 14, 10, 18, 18);
        imageLoaded = true;
      } catch (e) {
        console.log("Gagal memuat logo sekolah untuk PDF, fallback teks.", e);
      }
    }

    // 2. HEADER BRANDING MODERN
    const textStartX = imageLoaded ? 36 : 14;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.textColor = "#1a252f"; 
    doc.text(currentSchoolName.toUpperCase(), textStartX, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.textColor = "#7f8c8d"; 
    doc.text("Laporan Data Manajemen Kelas dan Akademik", textStartX, 22);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`, textStartX, 27);

    // Garis pembatas dekoratif abu-abu tipis
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.5);
    doc.line(14, 32, 196, 32);

    // 3. MENYIAPKAN DATA TABEL KELAS
    const headers = [["NAMA KELAS", "GURU PENGAMPU", "JUMLAH SISWA"]];
    const data = [];
    
    const rows = document.querySelectorAll("#classTable tr");
    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 3) {
        data.push([
          cells[0].innerText.trim(),
          cells[1].innerText.trim(),
          cells[2].innerText.trim()
        ]);
      }
    });

    if (data.length === 0) {
      alert("Tidak ada data kelas yang tersedia untuk diexport!");
      return;
    }

    // 4. GENERATE TABEL BERGAYA MODERN
    doc.autoTable({
      head: headers,
      body: data,
      startY: 38,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 4,
        verticalAlign: 'middle'
      },
      headStyles: {
        fillColor: [44, 62, 80], // Slate / Navy Modern
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left'
      },
      altRowStyles: {
        fillColor: [248, 249, 250]
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 65 },
        2: { cellWidth: 47, halign: 'center' }
      },
      didDrawPage: function(data) {
        const str = "Halaman " + doc.internal.getNumberOfPages();
        doc.setFontSize(9);
        doc.textColor = "#95a5a6";
        doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    const fileNameClean = currentSchoolName.replace(/\s+/g, '_');
    doc.save(`Laporan_Data_Kelas_${fileNameClean}.pdf`);

  } catch (err) {
    console.error("Gagal melakukan Export PDF Modern:", err);
    alert("Terjadi kesalahan sistem saat memproses PDF.");
  }
};
