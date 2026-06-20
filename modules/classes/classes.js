import { auth, db } from "../firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadLayout } from "../assets/js/components.js";

let currentSchoolId = null;

// ==========================
// AUTH + LOAD LAYOUT
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "../login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      currentSchoolId = userData.schoolId || null;
      window.role = userData.role;
      
      // Ambil layout admin sekolah
      await loadLayout(window.role);
      
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
  tableBody.innerHTML = "<tr><td colspan='4'>Memuat data kelas...</td></tr>";

  try {
    const querySnapshot = await getDocs(collection(db, "classes"));
    tableBody.innerHTML = "";

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
          <button class="btn-edit" onclick="editClass('${docSnap.id}', '${data.name}')">✏️ Edit</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Gagal mengambil data kelas:", err);
    tableBody.innerHTML = "<tr><td colspan='4' style='color:red;'>Gagal memuat data!</td></tr>";
  }
}

// ==========================
// CONTROL MODAL (Fungsi yang hilang tadi)
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
    loadClasses(); // Refresh tabel
  } catch (err) {
    console.error("Gagal menyimpan data kelas:", err);
  }
}

// ==========================
// EXPORT FUNCTIONS TO GLOBAL
// ==========================
window.openClassModal = openClassModal;
window.closeClassModal = closeClassModal;
window.saveClass = saveClass;
