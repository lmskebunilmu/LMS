import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentSchoolId = null;

// ==========================
// AUTH + LOAD LAYOUT
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // FIX: Menggunakan path absolut root LMS agar tidak salah folder lagi
    window.location = "/LMS/login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      currentSchoolId = userData.schoolId || null;
      window.role = userData.role;
      
      // Ambil layout admin sekolah lewat window global yang dibuat di HTML
      if (window.loadLayout) {
        await window.loadLayout(window.role);
      }
      
      // Load data utama kelas
      await loadClasses();
    }
  } catch (err) {
    console.error("Gagal inisialisasi halaman kelas:", err);
  }
});

// ==========================
// LOAD DATA KELAS (FIRESTORE)
// ==========================
async function loadClasses() {
  const tableBody = document.getElementById("classTable");
  if (!tableBody) return;
  tableBody.innerHTML = "<tr><td colspan='4'>⏳ Memuat data kelas...</td></tr>";

  try {
    const querySnapshot = await getDocs(collection(db, "classes"));
    tableBody.innerHTML = "";

    if (querySnapshot.empty) {
      tableBody.innerHTML = "<tr><td colspan='4'>📭 Belum ada data kelas</td></tr>";
      return;
    }

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Filter berdasarkan ID sekolah admin agar tidak bocor ke sekolah lain
      if (currentSchoolId && data.schoolId !== currentSchoolId) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${data.name || "-"}</b></td>
        <td>${data.teacherIds ? data.teacherIds.length : 0} Guru</td>
        <td>${data.studentIds ? data.studentIds.length : 0} Siswa</td>
        <td>
          <button class="btn-warning" onclick="editClass('${docSnap.id}', '${data.name.replace(/'/g, "\\'")}')">✏️ Edit</button>
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
// CONTROL MODAL
// ==========================
function openClassModal() {
  document.getElementById("classId").value = "";
  document.getElementById("className").value = "";
  document.getElementById("classModalTitle").innerText = "Tambah Kelas";
  document.getElementById("classModal").classList.add("active");
}

function closeClassModal() {
  document.getElementById("classModal").classList.remove("active");
}

function editClass(id, name) {
  document.getElementById("classId").value = id;
  document.getElementById("className").value = name;
  document.getElementById("classModalTitle").innerText = "Edit Kelas";
  document.getElementById("classModal").classList.add("active");
}

// ==========================
// SIMPAN KELAS (TAMBAH / UPDATE)
// ==========================
async function saveClass() {
  const classId = document.getElementById("classId").value;
  const className = document.getElementById("className").value.trim();

  if (!className) {
    alert("Nama kelas tidak boleh kosong!");
    return;
  }

  try {
    if (classId) {
      // Update kelas yang sudah ada
      await updateDoc(doc(db, "classes", classId), { name: className });
    } else {
      // Tambah kelas baru
      await addDoc(collection(db, "classes"), {
        name: className,
        schoolId: currentSchoolId,
        teacherIds: [],
        studentIds: []
      });
    }
    
    closeClassModal();
    await loadClasses(); // Refresh tabel setelah data tersimpan
  } catch (err) {
    console.error("Gagal menyimpan data kelas:", err);
  }
}

// ==========================
// EXPORT FUNCTIONS TO GLOBAL
// ==========================
window.openClassModal = openClassModal;
window.closeClassModal = closeClassModal;
window.editClass = editClass;
window.saveClass = saveClass;
