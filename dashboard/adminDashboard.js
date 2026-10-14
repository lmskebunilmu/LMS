import { auth, db, dbSecondary } from "../firebase/firebase-config.js";
import { signOut, onAuthStateChanged, updateEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadLayout } from "../assets/js/components.js";

let isSchoolActive = true;
let currentSchoolId = null;
let currentSchoolRef = null;
let currentSchoolName = "";
let currentSchoolLogo = "../assets/images/default-logo.png";

// ==========================
// AUTH STATE
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "../login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      alert("User tidak ditemukan!");
      window.location = "../login.html";
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== "admin") {
      alert("Akses ditolak! Hanya Admin.");
      window.location = "../login.html";
      return;
    }

    window.role = userData.role;
    await loadLayout(window.role);
    await waitForHeader();
    await loadProfileHeader(user);

    if (isSchoolActive) {
      await loadDashboard();
    }
  } catch (err) {
    console.error(err);
    alert("Terjadi kesalahan!");
    window.location = "../login.html";
  }
});

// ==========================
// UPLOAD AVATAR KE CLOUDINARY
// ==========================
async function uploadAvatarToCloudinary(file) {
  const cloudName = "djlvnubgn";
  const uploadPreset = "lms_unsigned";
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  try {
    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json();
    if (data.secure_url) {
      return data.secure_url;
    } else {
      alert("Upload gagal: " + (data.error?.message || "Unknown error"));
      return null;
    }
  } catch (err) {
    console.error(err);
    alert("Upload avatar gagal!");
    return null;
  }
}

// ==========================
// LOGOUT
// ==========================
window.logout = () => {
  signOut(auth).then(() => window.location = "../login.html").catch(err => alert(err.message));
};

// ==========================
// WAIT HEADER READY
// ==========================
function waitForHeader() {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const avatar = document.getElementById("headerAvatarHeader");
      if (avatar) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

// ==========================
// LOAD PROFILE HEADER
// ==========================
async function loadProfileHeader(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const name = data.name || user.displayName || "Admin";
  const avatar = data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
  const email = data.email || user.email;
  currentSchoolId = data.schoolId || null;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      if (schoolData.status !== "aktif") {
        showToast("Sekolah kamu nonaktif!", "error");
        lockDashboard();
        isSchoolActive = false;
        return;
      } else {
        isSchoolActive = true;
      }

      currentSchoolRef = schoolSnap.ref;
      schoolName = schoolData.name || "-";
      currentSchoolName = schoolName;
      schoolLogo = schoolData.logoURL || "../assets/images/default-logo.png";
      currentSchoolLogo = schoolLogo;
    }
  }

  document.getElementById("headerNameHeader").innerText = name;
  document.getElementById("headerAvatarHeader").src = avatar;
  document.getElementById("headerSchoolName").innerText = schoolName;
  document.getElementById("headerSchoolLogo").src = schoolLogo;

  const schoolNameCard = document.getElementById("schoolNameCard");
  const schoolCodeCard = document.getElementById("schoolCodeCard");
  const schoolLogoCard = document.getElementById("schoolLogoCard");

  if (schoolNameCard) schoolNameCard.innerText = schoolName;
  if (schoolCodeCard) schoolCodeCard.innerText = currentSchoolId || "-";
  if (schoolLogoCard) schoolLogoCard.src = schoolLogo;

  document.getElementById("headerNameCard").innerText = name;
  document.getElementById("headerEmailCard").innerText = email;
  document.getElementById("headerAvatarCard").src = avatar;
  document.getElementById("headerSchoolCard").innerText = schoolName;

  document.getElementById("profileName").value = name;
  document.getElementById("profileEmail").value = email;
  document.getElementById("profileSchool").value = currentSchoolName;
}

// ==========================
// MODAL CONTROLS
// ==========================
window.openProfileModal = () => document.getElementById("profileModal").classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal").classList.remove("active");

window.openSchoolModal = () => {
  document.getElementById("schoolModal").classList.add("active");
  document.getElementById("schoolNameInput").value = currentSchoolName;
};

window.closeSchoolModal = () => {
  document.getElementById("schoolModal").classList.remove("active");
};

// ==========================
// SAVE PROFILE
// ==========================
window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const schoolName = document.getElementById("profileSchool").value.trim();
  const file = document.getElementById("profileAvatarFile").files[0];

  if (!name || !email) {
    alert("Isi semua data!");
    return;
  }

  try {
    let avatarURL = user.photoURL || "../assets/images/default-avatar.png";
    if (file) {
      const uploadedURL = await uploadAvatarToCloudinary(file);
      if (uploadedURL) avatarURL = uploadedURL;
    }

    await updateProfile(user, { displayName: name, photoURL: avatarURL });
    if (email !== user.email) await updateEmail(user, email);

    await updateDoc(doc(db, "users", user.uid), { name, email, avatarURL });
    if (currentSchoolRef && schoolName) {
      await updateDoc(currentSchoolRef, { name: schoolName });
    }

    showToast("Profil admin berhasil diperbarui");
    closeProfileModal();
    await loadProfileHeader(user);
  } catch (err) {
    showToast("Gagal update profil", "error");
  }
};

// ==========================
// SAVE SCHOOL PROFILE
// ==========================
window.saveSchoolProfile = async () => {
  if (!currentSchoolRef) {
    alert("Data sekolah tidak ditemukan!");
    return;
  }

  const schoolName = document.getElementById("schoolNameInput").value.trim();
  const file = document.getElementById("schoolLogoFile").files[0];

  if (!schoolName) {
    alert("Nama sekolah wajib diisi!");
    return;
  }

  try {
    let logoURL = currentSchoolLogo;
    if (file) {
      const uploadedURL = await uploadAvatarToCloudinary(file);
      if (uploadedURL) logoURL = uploadedURL;
    }

    await updateDoc(currentSchoolRef, { name: schoolName, logoURL: logoURL });
    showToast("Profil sekolah berhasil diperbarui");
    closeSchoolModal();
    await loadProfileHeader(auth.currentUser);
  } catch (err) {
    showToast("Gagal update sekolah", "error");
  }
};

// ==========================
// DASHBOARD DATA
// ==========================
async function loadDashboard() {
  if (!currentSchoolId) return;

  const studentSnap = await getDocs(query(collection(db, "students"), where("schoolId", "==", currentSchoolId)));
  const teacherSnap = await getDocs(query(collection(db, "teachers"), where("schoolId", "==", currentSchoolId)));
  const classSnap = await getDocs(query(collection(db, "classes"), where("schoolId", "==", currentSchoolId)));

  document.getElementById("totalStudents").innerText = studentSnap.size;
  document.getElementById("totalTeachers").innerText = teacherSnap.size;
  document.getElementById("totalClasses").innerText = classSnap.size;

  // Memuat Rekap Simulasi Ujian untuk Sekolah Ini
  await loadSimulationReports(studentSnap);

  renderTimeline([
    { time: new Date(), desc: "Admin masuk dashboard" },
    { time: new Date(), desc: "Data murid diperbarui" }
  ]);

  renderClassChart(studentSnap, classSnap);
}

// ==========================
// LOAD SIMULATION REPORTS (BARU)
// ==========================
async function loadSimulationReports(studentSnap) {
  const tbody = document.getElementById("adminSimReportTableBody");
  if (!tbody) return;

  try {
    // Ambil semua UID siswa di sekolah ini
    const studentUids = [];
    studentSnap.forEach(sDoc => {
      studentUids.push(sDoc.id);
    });

    if (studentUids.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8;">Belum ada siswa terdaftar.</td></tr>`;
      return;
    }

    // Ambil data submission dari dbSecondary (student_simulation_submissions)
    const subSimSnap = await getDocs(collection(dbSecondary, "student_simulation_submissions"));
    let html = "";
    let count = 0;

    subSimSnap.forEach(docSnap => {
      const sub = docSnap.data();
      // Filter hanya siswa yang berasal dari sekolah ini
      if (sub.submittedAt && studentUids.includes(sub.studentUid)) {
        count++;
        const scoreColor = sub.score >= 75 ? "#059669" : "#dc2626";
        const statusBadge = sub.isPassed 
          ? `<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">LULUS</span>` 
          : `<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">TIDAK LULUS</span>`;

        let timeText = "-";
        if (sub.submittedAt?.toDate) {
          timeText = sub.submittedAt.toDate().toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        html += `
          <tr>
            <td>${count}</td>
            <td><b>👤 ${sub.studentName || "Siswa"}</b></td>
            <td><span style="color: #2563eb; font-weight: 500;">🎯 ${sub.simulationTitle || "Simulasi Ujian"}</span></td>
            <td><span style="background: ${scoreColor}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">${sub.score || 0}</span></td>
            <td>${statusBadge}</td>
            <td style="font-size: 12px; color: #64748b;">${timeText}</td>
          </tr>
        `;
      }
    });

    if (html === "") {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8;">Belum ada siswa yang menyelesaikan simulasi ujian.</td></tr>`;
    } else {
      tbody.innerHTML = html;
    }
  } catch (err) {
    console.error("Gagal memuat rekap simulasi admin:", err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Gagal memuat rekap simulasi.</td></tr>`;
  }
}

// ==========================
// TIMELINE
// ==========================
function renderTimeline(activity) {
  const timelineEl = document.getElementById("activityTimeline");
  if(!timelineEl) return;
  timelineEl.innerHTML = "";
  activity.forEach(act => {
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `${act.desc} <span>${act.time.toLocaleString()}</span>`;
    timelineEl.appendChild(div);
  });
}

// ==========================
// CHART MURID PER KELAS
// ==========================
function renderClassChart(studentSnap, classSnap) {
  const classCounts = {};
  classSnap.forEach(cls => { classCounts[cls.data().name] = 0; });
  studentSnap.forEach(s => {
    const className = s.data().className || "Lainnya";
    if(classCounts[className] !== undefined) classCounts[className]++;
  });

  const ctx = document.getElementById("classChart")?.getContext("2d");
  if(!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: { labels: Object.keys(classCounts), datasets: [{ label: 'Jumlah Murid', data: Object.values(classCounts), backgroundColor:'#3b82f6' }] },
    options: { responsive:true, plugins:{ legend:{ display:false } } }
  });
}

// ==========================
// PREVIEW AVATAR
// ==========================
window.openProfileModal = () => {
  document.getElementById("profileModal").classList.add("active");
  const avatarInput = document.getElementById("profileAvatarFile");
  if (avatarInput) {
    avatarInput.onchange = function(e){
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert("Ukuran gambar maksimal 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = function(event){
        document.getElementById("headerAvatarCard").src = event.target.result;
        const headerAvatar = document.getElementById("headerAvatarHeader");
        if (headerAvatar) headerAvatar.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };
  }
};

// ==========================
// PREVIEW LOGO SEKOLAH
// ==========================
document.getElementById("schoolLogoFile")?.addEventListener("change", function(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event){
    document.getElementById("schoolLogoCard").src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// ==========================
// TOAST FUNCTION
// ==========================
window.showToast = function(message, type = "success") {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");
  msg.innerText = message;
  toast.classList.remove("error");
  if (type === "error") {
    toast.classList.add("error");
  }
  toast.classList.add("active");
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
};

function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="
      display:flex;
      justify-content:center;
      align-items:center;
      height:80vh;
      flex-direction:column;
      text-align:center;
    ">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="logout()" class="btn-edit">
        Logout
      </button>
    </div>
  `;
}
