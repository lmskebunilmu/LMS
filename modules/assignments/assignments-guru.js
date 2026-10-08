import { auth, db } from "../../firebase/firebase-config.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { loadLayout } from "../../assets/js/components.js";

let currentSchoolId = null;
let assignedExercisesList = [];

// ==========================
// AUTH & INITIALIZATION
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location = "../../login.html";

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists() || userSnap.data().role !== "guru") {
    alert("Akses khusus guru!");
    return window.location = "../../login.html";
  }

  currentSchoolId = userSnap.data().schoolId;

  await loadLayout("guru");
  await waitForHeader();
  await loadProfileHeader(user);

  await loadClassesAbjad(user);

  const classSelect = document.getElementById("classSelect");
  if (classSelect) {
    classSelect.addEventListener("change", async () => {
      await loadAssignedExercisesForManagement();
    });
  }

  await loadAssignedExercisesForManagement();
});

// ==========================
// LOAD KELAS URUT ABJAD (A-Z)
// ==========================
async function loadClassesAbjad(user) {
  const select = document.getElementById("classSelect");
  if (!select) return;
  select.innerHTML = "";

  const q = query(
    collection(db, "classes"),
    where("teacherIds", "array-contains", user.uid),
    where("schoolId", "==", currentSchoolId)
  );

  const snap = await getDocs(q);
  const classesList = [];
  snap.forEach(docSnap => {
    classesList.push({
      id: docSnap.id,
      name: docSnap.data().name || "Kelas Tanpa Nama"
    });
  });

  // Urutkan abjad A-Z
  classesList.sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

  if (classesList.length === 0) {
    select.innerHTML = `<option value="">-- Belum ada kelas --</option>`;
    return;
  }

  classesList.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls.id;
    opt.textContent = cls.name;
    select.appendChild(opt);
  });
}

// ==========================
// LOAD & MANAGE ASSIGNED EXERCISES
// ==========================
async function loadAssignedExercisesForManagement() {
  const classSelect = document.getElementById("classSelect");
  if (!classSelect) return;
  const classId = classSelect.value;
  const container = document.getElementById("exerciseManagementContainer"); // Wadah list tugas di HTML Anda
  
  if (!classId) {
    if (container) container.innerHTML = "<p>Pilih kelas terlebih dahulu.</p>";
    return;
  }

  const user = auth.currentUser;
  if (!container) return;
  container.innerHTML = "⏳ Memuat data penugasan...";

  try {
    // Ambil data exerciseGuru yang sudah di-assign / dipilih sebelumnya untuk kelas ini
    const q = query(
      collection(db, "exerciseGuru"),
      where("classId", "==", classId),
      where("teacherId", "==", user.uid)
    );
    const snap = await getDocs(q);
    
    assignedExercisesList = [];
    snap.forEach(d => {
      assignedExercisesList.push({ id: d.id, ...d.data() });
    });

    renderExerciseManagementUI(container);
  } catch (err) {
    console.error("Gagal memuat manajemen tugas:", err);
    container.innerHTML = "<p style='color:red;'>Gagal memuat data tugas.</p>";
  }
}

// Render UI Pengaturan Tanggal, Status Aktif, dan Tombol Hapus/Simpan
function renderExerciseManagementUI(container) {
  if (assignedExercisesList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #64748b;">
        <p>📭 Belum ada latihan yang dipilih untuk kelas ini.</p>
        <p style="font-size: 13px;">Silakan pilih materi & latihan melalui menu <b>Materi & Tugas</b> sebelumnya. Data yang sudah dipilih akan tersimpan di sini secara permanen sampai Anda menghapusnya.</p>
      </div>
    `;
    return;
  }

  let html = `
    <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-weight: 600; font-size: 14px;">Daftar Latihan Terpilih (${assignedExercisesList.length})</span>
      <button onclick="saveAllAssignmentsSettings()" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600;">💾 Simpan Semua Perubahan Pengaturan</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
  `;

  assignedExercisesList.forEach((item, index) => {
    // Format tanggal deadline jika ada
    let deadlineVal = "";
    if (item.deadline) {
      const dObj = item.deadline.toDate ? item.deadline.toDate() : new Date(item.deadline);
      deadlineVal = dObj.toISOString().slice(0, 16); // Format input datetime-local YYYY-MM-DDTHH:mm
    }

    html += `
      <div class="assignment-card" style="background: #fff; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-weight: 700; font-size: 15px; color: #0f172a;">${index + 1}. 📝 ${item.title || "Latihan"}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Mapel: ${item.subject || "-"}</div>
          </div>
          <button onclick="removeAssignedExercise('${item.id}')" style="background: #fee2e2; color: #ef4444; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600;">🗑️ Hapus Tugas</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 6px; background: #f8fafc; padding: 10px; border-radius: 8px;">
          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">STATUS KEAKTIFAN DI SISWA:</label>
            <select id="status_${item.id}" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
              <option value="true" ${item.isAssigned ? "selected" : ""}>✅ Aktif (Tampil & Bisa Dikerjakan)</option>
              <option value="false" ${!item.isAssigned ? "selected" : ""}>🔒 Nonaktif (Disembunyikan / Belum Dibuka)</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">BATAS WAKTU (DEADLINE):</label>
            <input type="datetime-local" id="deadline_${item.id}" value="${deadlineVal}" style="width: 100%; padding: 5px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
          </div>

          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">DURASI PENGERJAAN (MENIT):</label>
            <input type="number" id="duration_${item.id}" value="${item.duration || 0}" placeholder="0 = Tanpa Batas" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// ==========================
// AKSI: SIMPAN, TAMBAH, HAPUS PENUGASAN
// ==========================

// Simpan massal perubahan status, deadline, dan durasi semua latihan di kelas ini
window.saveAllAssignmentsSettings = async () => {
  try {
    for (const item of assignedExercisesList) {
      const statusEl = document.getElementById(`status_${item.id}`);
      const deadlineEl = document.getElementById(`deadline_${item.id}`);
      const durationEl = document.getElementById(`duration_${item.id}`);

      const isAssigned = statusEl ? statusEl.value === "true" : item.isAssigned;
      const deadline = deadlineEl && deadlineEl.value ? new Date(deadlineEl.value) : null;
      const duration = durationEl ? parseInt(durationEl.value) || 0 : 0;

      await updateDoc(doc(db, "exerciseGuru", item.id), {
        isAssigned,
        deadline,
        duration
      });
    }

    showToast("Semua pengaturan tugas berhasil disimpan!");
    await loadAssignedExercisesForManagement();
  } catch (err) {
    console.error("Gagal menyimpan perubahan:", err);
    showToast("Gagal menyimpan perubahan", "error");
  }
};

// Hapus satu latihan dari daftar tugas kelas ini (tidak menghilangkan data master latihan pusat)
window.removeAssignedExercise = async (docId) => {
  if (!confirm("Apakah Anda yakin ingin menghapus latihan ini dari daftar penugasan kelas?")) return;

  try {
    await deleteDoc(doc(db, "exerciseGuru", docId));
    showToast("Tugas berhasil dihapus dari kelas");
    await loadAssignedExercisesForManagement();
  } catch (err) {
    console.error("Gagal menghapus penugasan:", err);
    showToast("Gagal menghapus tugas", "error");
  }
};

// ==========================
// PENDUKUNG (TOAST & HEADER)
// ==========================
function showToast(msg, type="success"){
  const t = document.getElementById("toast");
  if(!t) return;
  t.innerText = msg;
  t.className = type === "error" ? "toast error active" : "toast active";
  setTimeout(() => {
    t.classList.remove("active");
  }, 3000);
}

function waitForHeader(){
  return new Promise(resolve=>{
    const interval = setInterval(()=>{
      const el = document.getElementById("headerAvatarHeader");
      if(el){
        clearInterval(interval);
        resolve();
      }
    },50);
  });
}

async function loadProfileHeader(user){
  const userSnap = await getDoc(doc(db,"users",user.uid));
  if(!userSnap.exists()) return;
  const data = userSnap.data();

  if(document.getElementById("headerNameHeader")) document.getElementById("headerNameHeader").innerText = data.name || "Guru";
  if(document.getElementById("headerAvatarHeader")) document.getElementById("headerAvatarHeader").src = data.avatarURL || "../assets/images/default-avatar.png";
  
  if(data.schoolId){
    const schoolSnap = await getDoc(doc(db,"schools",data.schoolId));
    if(schoolSnap.exists()){
      const schoolData = schoolSnap.data();
      if(document.getElementById("headerSchoolName")) document.getElementById("headerSchoolName").innerText = schoolData.name || "-";
      if(document.getElementById("headerSchoolLogo")) document.getElementById("headerSchoolLogo").src = schoolData.logoURL || "../assets/images/default-logo.png";
    }
  }
}
