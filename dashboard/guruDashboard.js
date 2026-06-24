import { auth, db } from "/LMS/firebase/firebase-config.js";
import { onAuthStateChanged, updateProfile, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔌 TAMBAHKAN BARIS INI AGAR SIDEBAR & HEADER BISA MUNCUL:
import { loadLayout } from "/LMS/assets/js/components.js";
window.loadLayout = loadLayout;
let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "-";
let currentSchoolLogo = "/LMS/assets/images/default-logo.png";

// ==========================
// AUTH + INITIALIZATION
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "/LMS/login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      alert("User tidak ditemukan");
      window.location = "/LMS/login.html";
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== "guru") {
      alert("Akses ditolak! Halaman ini khusus peran Guru.");
      window.location = "/LMS/login.html";
      return;
    }

    // 🔒 CEK STATUS AKTIF GURU (Sinkron dengan teachers collection)
    const teacherSnap = await getDoc(doc(db, "teachers", user.uid));
    if (teacherSnap.exists() && teacherSnap.data().status === "nonaktif") {
      document.querySelector(".main").innerHTML = `
        <div style="text-align:center; margin-top:100px;">
          <h1 style="color:red;">🚫 Akun Dinonaktifkan</h1>
          <p>Hubungi admin sekolah untuk mengaktifkan kembali akun Anda.</p>
          <button onclick="window.location='/LMS/login.html'" class="btn-edit" style="margin-top:15px;">Kembali ke Login</button>
        </div>
      `;
      return;
    }

    currentSchoolId = userData.schoolId || null;
    window.role = userData.role;

    // Load Layout bawaan proyek LMS (jika fungsi globalnya terdeteksi)
    if (window.loadLayout) {
      await window.loadLayout(window.role);
    }

    await loadProfileHeader(userData);
    await loadStats(user);
    await loadClassWithStudents(user);

  } catch (err) {
    console.error("Gagal melakukan inisialisasi dashboard guru:", err);
  }
});

// ==========================
// LOAD PROFILE HEADER & CARD
// ==========================
async function loadProfileHeader(userData) {
  const name = userData.name || "Guru";
  const email = userData.email || "";
  const avatar = userData.avatarURL || "/LMS/assets/images/default-avatar.png";

  // Update elemen komponen header global jika terpasang di HTML
  const nameEl = document.getElementById("headerNameHeader");
  if (nameEl) nameEl.innerText = name;

  const avatarEl = document.getElementById("headerAvatarHeader");
  if (avatarEl) avatarEl.src = avatar;

  // Tarik data validasi sekolah
  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      
      // 🚨 CEK STATUS SEKATIF SEKOLAH
      if (schoolData.status !== "aktif") {
        lockDashboard();
        return;
      }

      currentSchoolRef = schoolSnap.ref;
      currentSchoolName = schoolData.name || "-";
      currentSchoolLogo = schoolData.logoURL || "/LMS/assets/images/default-logo.png";
    }
  }

  // Update komponen Nama Sekolah di header
  const schoolNameEl = document.getElementById("headerSchoolName");
  if (schoolNameEl) schoolNameEl.innerText = currentSchoolName;

  const schoolLogoEl = document.getElementById("headerSchoolLogo");
  if (schoolLogoEl) schoolLogoEl.src = currentSchoolLogo;

  // Update Isian Komponen Profile Card Utama Guru
  const nameCard = document.getElementById("headerNameCard");
  if (nameCard) nameCard.innerText = name;

  const emailCard = document.getElementById("headerEmailCard");
  if (emailCard) emailCard.innerText = email;

  const avatarCard = document.getElementById("headerAvatarCard");
  if (avatarCard) avatarCard.src = avatar;

  const schoolCard = document.getElementById("headerSchoolCard");
  if (schoolCard) schoolCard.innerText = currentSchoolName;

  // Sinkronisasikan nilai isian ke dalam modal form edit profile
  const profileName = document.getElementById("profileName");
  if (profileName) profileName.value = name;

  const profileEmail = document.getElementById("profileEmail");
  if (profileEmail) profileEmail.value = email;
}

// ==========================
// LOAD STATS (SINKRON DATA KELAS)
// ==========================
async function loadStats(user) {
  try {
    if (!currentSchoolId) return;

    // Ambil list semua kelas di mana guru ini terdaftar dalam pengampu (teacherIds)
    const qClasses = query(
      collection(db, "classes"),
      where("teacherIds", "array-contains", user.uid),
      where("schoolId", "==", currentSchoolId)
    );

    const snapClasses = await getDocs(qClasses);
    document.getElementById("totalClasses").innerText = snapClasses.size;

    const subjectSet = new Set();
    let totalStudentsCount = 0;

    for (const classDoc of snapClasses.docs) {
      const classData = classDoc.data();
      const classId = classDoc.id;

      // Ambil pemetaan mapel tercentang khusus guru ini dari field object `teachers` baru
      const classTeachersMapping = classData.teachers || {};
      const mySubjects = classTeachersMapping[user.uid] || [];
      mySubjects.forEach(sub => subjectSet.add(sub));

      // 🔄 SINKRON: Hitung total siswa terdaftar real-time murni dari query field classId
      const qStudents = query(collection(db, "students"), where("classId", "==", classId));
      const snapStudents = await getDocs(qStudents);
      totalStudentsCount += snapStudents.size;
    }

    document.getElementById("totalStudents").innerText = totalStudentsCount;
    document.getElementById("totalSubjects").innerText = subjectSet.size;

  } catch (err) {
    console.error("Gagal memuat data statistik dashboard guru:", err);
  }
}

// ===================================================
// LOAD DAFTAR KELAS & BREAKDOWN ANGGOTA SISWA REAL-TIME
// ===================================================
async function loadClassWithStudents(user) {
  try {
    if (!currentSchoolId) return;

    const container = document.getElementById("classListContainer");
    container.innerHTML = "⏳ Memuat data kelas dan daftar siswa...";

    const qClasses = query(
      collection(db, "classes"),
      where("teacherIds", "array-contains", user.uid),
      where("schoolId", "==", currentSchoolId)
    );

    const snapClasses = await getDocs(qClasses);

    if (snapClasses.empty) {
      container.innerHTML = "<p>📭 Anda belum diplot mengampu kelas mana pun oleh admin.</p>";
      return;
    }

    container.innerHTML = "";

    // Loop data kelas yang diampu guru
    for (const classDoc of snapClasses.docs) {
      const classData = classDoc.data();
      const classId = classDoc.id;

      // 1. Cek Jabatan: Apakah guru ini bertindak sebagai Wali Kelas di sini?
      const isWaliKelas = classData.homeroomTeacherId === user.uid;
      const waliKelasBadge = isWaliKelas 
        ? `<span style="background-color: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 8px;">👑 Wali Kelas</span>` 
        : "";

      // 2. Ambil list mata pelajaran spesifik tercentang milik guru ini di kelas ini
      const classTeachersMapping = classData.teachers || {};
      const mySubjects = classTeachersMapping[user.uid] || [];
      const subjectsText = mySubjects.length > 0 ? mySubjects.join(", ") : "- Tidak ada mapel terpilih";

      // 3. 🔄 QUERY REAL-TIME SISWA SINKRON: Ambil data siswa yang terdaftar di classId kelas saat ini
      const qStudents = query(collection(db, "students"), where("classId", "==", classId));
      const snapStudents = await getDocs(qStudents);

      const cleanStudents = [];
      snapStudents.forEach(sDoc => {
        cleanStudents.push(sDoc.data());
      });

      // Urutkan nama daftar siswa secara berurutan (A-Z)
      cleanStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const div = document.createElement("div");
      div.className = "class-box";
      div.style.marginBottom = "15px";

      div.innerHTML = `
        <button class="class-toggle" style="width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center; padding:12px; cursor:pointer;">
          <span>📋 <b>${classData.name}</b> ${waliKelasBadge}</span>
          <span style="font-size:12px; color:#FFFFFF;">📖 ${mySubjects.length} Mapel</span>
        </button>

        <div class="class-detail" style="display:none; padding:15px; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 6px 6px; background:#fff;">
          <div style="margin-bottom:10px; font-size:13px; color:#475569; line-height:1.6;">
            <div>• Jabatan Anda: <b>${isWaliKelas ? "Wali Kelas" : "Guru Pengampu"}</b></div>
            <div>• Mengajar Mapel: <span style="color:#4f46e5; font-weight:600;">${subjectsText}</span></div>
            <div>• Total Siswa Terdaftar: <b>${cleanStudents.length} Murid</b></div>
          </div>

          <div class="export-buttons" style="margin-bottom:15px;">
            <button class="btn-export btn-csv">Export CSV</button>
            <button class="btn-export btn-pdf">Download PDF</button>
          </div>

          <strong style="font-size:13px; display:block; margin-bottom:5px; color:#1e293b;">Daftar Murid Kelas:</strong>
          <ul style="list-style:none; padding:0; margin:0; max-height:200px; overflow-y:auto;">
            ${
              cleanStudents.length > 0
              ? cleanStudents.map((s, index) => `<li style="padding:6px 0; border-bottom:1px dashed #f1f5f9; font-size:13px;">${index + 1}. 👤 ${s.name} (${s.email || "-"})</li>`).join("")
              : "<li style='color:#94a3b8; font-size:13px;'>📭 Belum ada siswa terdaftar di kelas ini</li>"
            }
          </ul>
        </div>
      `;

      // Event listener klik tombol ekspansi isi kelas
      div.querySelector(".class-toggle").onclick = () => {
        const detail = div.querySelector(".class-detail");
        detail.style.display = detail.style.display === "none" ? "block" : "none";
      };

      // Listener pengeksporan file dokumen
      div.querySelector(".btn-csv").onclick = () => exportCSV(cleanStudents, classData.name);
      div.querySelector(".btn-pdf").onclick = () => exportPDF(cleanStudents, classData.name);

      container.appendChild(div);
    }

  } catch (err) {
    console.error("Gagal merelasikan data siswa dan kelas guru:", err);
    document.getElementById("classListContainer").innerHTML = "<p style='color:red;'>❌ Gagal memuat detail data siswa</p>";
  }
}

// ==========================
// EXPORT DATA (CSV & PDF)
// ==========================
window.exportCSV = (students, className) => {
  let csv = "Nama,Email\n";
  students.forEach(s => {
    csv += `"${s.name}","${s.email || "-"}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Data_Siswa_Kelas_${className.replace(/\s+/g, '_')}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

window.exportPDF = async (students, className) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const getBase64FromURL = async (url) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  let logoBase64 = await getBase64FromURL(currentSchoolLogo);
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", 14, 10, 18, 18);
  }

  doc.setFontSize(14);
  doc.text(currentSchoolName, 36, 15);
  doc.setFontSize(10);
  doc.text("Laporan Anggota Akademik Anggota Siswa", 36, 22);

  doc.setFontSize(12);
  doc.text(`Kelas: ${className}`, 14, 38);
  const today = new Date().toLocaleDateString("id-ID", { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Tanggal Cetak: ${today}`, 14, 44);

  const tableData = students.map((s, i) => [i + 1, s.name || "-", s.email || "-"]);

  doc.autoTable({
    startY: 50,
    head: [["No", "Nama Siswa", "Email"]],
    body: tableData,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.text(`Total terdata: ${students.length} Siswa`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`Laporan_Siswa_Kelas_${className.replace(/\s+/g, '_')}.pdf`);
};

// ==========================
// FORM MANAGEMENT PROFILE MODAL
// ==========================
window.openProfileModal = () => document.getElementById("profileModal").classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal").classList.remove("active");

window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const file = document.getElementById("profileAvatarFile").files[0];

  if (!name || !email) {
    showToast("Isi semua data profil wajib!", "error");
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data();
    let avatarURL = userData?.avatarURL ?? "/LMS/assets/images/default-avatar.png";

    // Modul pengunggahan gambar ke Cloudinary CDN
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "avatar_upload");

      const res = await fetch(`https://api.cloudinary.com/v1_1/djlvnubgn/image/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (data && data.secure_url) {
        avatarURL = data.secure_url;
      } else {
        throw new Error("Respon Cloudinary tidak valid");
      }
    }

    // Perbarui Profile internal Firebase Auth
    await updateProfile(user, { displayName: name, photoURL: avatarURL });
    if (email !== user.email) {
      await updateEmail(user, email);
    }

    // Penanganan update sandi/password baru opsional
    const password = document.getElementById("profilePassword")?.value.trim();
    const confirmPassword = document.getElementById("profilePasswordConfirm")?.value.trim();

    if (password) {
      if (password.length < 6) {
        showToast("Password minimal 6 karakter!", "error");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Konfirmasi sandi tidak sesuai!", "error");
        return;
      }
      await updatePassword(user, password);
      document.getElementById("profilePassword").value = "";
      document.getElementById("profilePasswordConfirm").value = "";
    }

    // Tulis pembaruan data terbaru ke Firestore
    await updateDoc(doc(db, "users", user.uid), { name, email, avatarURL });
    showToast("Profil guru berhasil diperbarui");
    closeProfileModal();

    // Segarkan ulang tampilan header profil utama
    const updatedUserSnap = await getDoc(doc(db, "users", user.uid));
    await loadProfileHeader(updatedUserSnap.data());

  } catch (err) {
    console.error(err);
    showToast("Gagal memperbarui data profil", "error");
  }
};

// ==========================
// LOCK DASHBOARD & TOAST CONTROL
// ==========================
function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column; text-align:center;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang dalam status <b>nonaktif</b></p>
      <button onclick="window.location='/LMS/login.html'" class="btn-edit" style="margin-top:15px;">Kembali</button>
    </div>
  `;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");
  if (toast && msg) {
    msg.innerText = message;
    toast.className = "toast active";
    if (type === "error") toast.classList.add("error");
    setTimeout(() => toast.classList.remove("active"), 3000);
  }
}

