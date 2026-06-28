import { auth, db } from "../firebase/firebase-config.js";

// 1. IMPORT KHUSUS UNTUK AUTH
import {
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 2. IMPORT KHUSUS UNTUK FIRESTORE (DATABASE)
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { loadLayout } from "../assets/js/components.js";

let studentData = null;
let selectedPricing = null;
let selectedClass = null;

// State data global untuk simpan hasil fetch dari Firestore
let allFetchedClasses = [];
let ownedClassIds = [];
let pendingTransactionClassIds = []; // Melacak kelas yang sedang menunggu pembayaran/konfirmasi

/* =========================
   AUTH
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "../login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) return;

    studentData = userSnap.data();

    if (studentData.role !== "student") {
      alert("Akses hanya untuk student");
      return;
    }

    // LOAD LAYOUT
    await loadLayout("student");

    loadProfile(user);

    // Ambil semua data dan render ke UI
    await loadDashboardData();

    // Pasang Event Listener agar filter pencarian, level, kurikulum berjalan dinamis
    document.getElementById("searchClassName").addEventListener("input", renderClassesAvailable);
    document.getElementById("filterLevel").addEventListener("change", renderClassesAvailable);
    document.getElementById("filterCurriculum").addEventListener("change", renderClassesAvailable);

  } catch (err) {
    console.error(err);
  }
});

/* =========================
   PROFILE
========================= */
async function loadProfile(user) {
  document.getElementById("studentName").innerText = studentData.name || "Student";
  document.getElementById("studentEmail").innerText = studentData.email || "-";
  document.getElementById("studentLevel").innerText = `${studentData.level || '-'} - ${studentData.curriculum || '-'}`;
  document.getElementById("studentAvatar").src = studentData.avatarURL || "../assets/images/default-avatar.png";

  const headerName = document.getElementById("headerNameHeader");
  if (headerName) headerName.innerText = studentData.name || "Student";

  const headerAvatar = document.getElementById("headerAvatarHeader");
  if (headerAvatar) headerAvatar.src = studentData.avatarURL || "../assets/images/default-avatar.png";

  const profileName = document.getElementById("profileName");
  if (profileName) profileName.value = studentData.name || "";
}

/* =========================
   LOAD & FETCH DATA (FIRESTORE)
========================= */
async function loadDashboardData() {
  document.getElementById("myClassesContainer").innerHTML = "Loading kelas saya...";
  document.getElementById("classContainer").innerHTML = "Loading kelas tersedia...";

  try {
    // 1. AMBIL KELAS YANG DIMILIKI STUDENT
    const classStudentQuery = query(
      collection(db, "class_students"),
      where("studentId", "==", auth.currentUser.uid)
    );
    const classStudentSnap = await getDocs(classStudentQuery);
    
    ownedClassIds = [];
    const now = new Date().getTime();

    classStudentSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      // Jika kelas berbayar memiliki masa aktif, cek apakah sudah kedaluwarsa
      if (data.expiredAt) {
        const expireTime = data.expiredAt.toDate().getTime();
        if (now > expireTime) {
          return; // Jika sudah expired, lewati (tidak dimasukkan ke ownedClassIds)
        }
      }
      
      ownedClassIds.push(data.classId);
    });

    // 2. AMBIL TRANSAKSI PENDING (BELUM UPLOAD ATAU MENUNGGU KONFIRMASI)
    const txQuery = query(
      collection(db, "transactions"),
      where("userId", "==", auth.currentUser.uid),
      where("status", "in", ["waiting_upload", "waiting_confirmation"])
    );
    const txSnap = await getDocs(txQuery);
    pendingTransactionClassIds = txSnap.docs.map(doc => doc.data().classId);

    // 3. AMBIL HANYA KELAS YANG DIBUAT OLEH SUPER ADMIN
    const superAdminUid = "yI6KBEOIrAcIqIDFu56Mr1UYwNw1";
    const superAdminClassQuery = query(
      collection(db, "classes"),
      where("createdBy", "==", superAdminUid)
    );

    const allClassSnap = await getDocs(superAdminClassQuery);
    allFetchedClasses = allClassSnap.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    // Tampilkan data ke masing-masing kontainer
    renderMyClasses();
    renderClassesAvailable();

  } catch (error) {
    console.error("Gagal mengambil data dari Firestore:", error);
    document.getElementById("myClassesContainer").innerHTML = "Gagal memuat kelas saya.";
    document.getElementById("classContainer").innerHTML = "Gagal memuat kelas tersedia.";
  }
}

/* =========================
   RENDER KELAS SAYA
========================= */
function renderMyClasses() {
  const container = document.getElementById("myClassesContainer");
  container.innerHTML = "";

  const myClasses = allFetchedClasses.filter(c => ownedClassIds.includes(c.id));

  if (myClasses.length === 0) {
    container.innerHTML = `<p style="color: #64748b; font-size: 14px; grid-column: 1/-1;">Kamu belum masuk/bergabung ke kelas manapun.</p>`;
    return;
  }

  myClasses.forEach(c => {
    const card = createClassCardElement(c, true);
    container.appendChild(card);
  });
}

/* =========================
   RENDER KELAS TERSEDIA + FILTER
========================= */
function renderClassesAvailable() {
  const container = document.getElementById("classContainer");
  container.innerHTML = "";

  const searchKeyword = document.getElementById("searchClassName").value.toLowerCase();
  const selectedLevel = document.getElementById("filterLevel").value;
  const selectedCurriculum = document.getElementById("filterCurriculum").value;

  const filteredClasses = allFetchedClasses.filter(c => {
    if (ownedClassIds.includes(c.id)) return false;

    const matchName = (c.className || "").toLowerCase().includes(searchKeyword);
    const matchLevel = selectedLevel === "" ? true : c.level === selectedLevel;
    const matchCurriculum = selectedCurriculum === "" ? true : c.curriculum === selectedCurriculum;

    return matchName && matchLevel && matchCurriculum;
  });

  if (filteredClasses.length === 0) {
    container.innerHTML = `<p style="color: #64748b; font-size: 14px; grid-column: 1/-1;">Tidak ada kelas tersedia yang cocok dengan pencarian Anda.</p>`;
    return;
  }

  filteredClasses.forEach(c => {
    const card = createClassCardElement(c, false);
    container.appendChild(card);
  });
}

/* =========================
   TEMPLATE CARD KELAS (GALERI)
========================= */
function createClassCardElement(c, isAlreadyJoined) {
  const div = document.createElement("div");
  div.className = "class-card";

  const thumbnail = c.thumbnail || "https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=1200";
  
  const priceDisplay = c.isPaid 
    ? (() => {
        const monthly = c.pricing?.find(p => Number(p.billingPeriod) === 30);
        return monthly 
          ? `Rp ${Number(monthly.price).toLocaleString("id-ID")} / Bulan`
          : `Mulai Rp ${Number(c.pricing?.[0]?.price || 0).toLocaleString("id-ID")}`;
      })()
    : "Gratis";

  let actionButtonHtml = "";
  const isPendingPayment = pendingTransactionClassIds.includes(c.id);

  if (isAlreadyJoined) {
    actionButtonHtml = `<button class="btn-modern btn-open">Masuk Kelas</button>`;
  } else if (isPendingPayment) {
    actionButtonHtml = `
      <div style="text-align: right; display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
        <span style="font-size: 12px; color: #f97316; font-weight: 600;">⏳ Menunggu Pembayaran</span>
        <input type="file" id="receipt-${c.id}" accept="image/*" style="display: none;" />
        <button class="btn-modern" id="btn-upload-${c.id}" style="background: linear-gradient(135deg,#f97316,#ff7e00); font-size: 11px; padding: 5px 10px;">
          📸 Upload Bukti
        </button>
        <small style="color:#64748b; font-size: 10px; font-weight: normal; line-height: 1.2;">Aktif maks 1x24 jam</small>
      </div>
    `;
  } else {
    actionButtonHtml = c.isPaid 
      ? `<button class="btn-modern btn-buy">Beli Kelas</button>` 
      : `<button class="btn-modern btn-open">Masuk Kelas</button>`;
  }

  div.innerHTML = `
    <div class="class-image-wrap">
      <img src="${thumbnail}" class="class-image">
      <div class="class-badge ${c.isPaid ? "badge-premium" : "badge-free"}">
        ${c.isPaid ? "PREMIUM" : "FREE"}
      </div>
    </div>
    <div class="class-content">
      <div>
        <h3 class="class-title">${c.className || "-"}</h3>
        <p class="class-desc">${c.description || "Kelas interaktif modern untuk meningkatkan skill belajar siswa."}</p>
        <div class="class-info">
          <div class="info-item">📚 ${c.subject || "-"}</div>
          <div class="info-item">👨‍🏫 ${c.teacherName || "-"}</div>
          <div class="info-item">🎓 ${c.level || "-"}</div>
          <div class="info-item">📘 ${c.curriculum || "-"}</div>
        </div>
      </div>
      <div class="class-footer">
        <div class="class-price">${priceDisplay}</div>
        ${actionButtonHtml}
      </div>
    </div>
  `;

  // EVENT LISTENERS BUTTON
  const buyBtn = div.querySelector(".btn-buy");
  if (buyBtn) buyBtn.onclick = () => buyClass(c);

  const openBtn = div.querySelector(".btn-open");
  if (openBtn) openBtn.onclick = () => openClass(c.id, c.isPaid);

  // EVENT LISTENER KHUSUS UPLOAD BUKTI TRANSFER
  if (isPendingPayment) {
    const uploadBtn = div.querySelector(`#btn-upload-${c.id}`);
    const fileInput = div.querySelector(`#receipt-${c.id}`);

    if (uploadBtn && fileInput) {
      uploadBtn.onclick = (e) => {
        e.stopPropagation();
        fileInput.click();
      };

      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          await uploadPaymentReceipt(c.id, file);
        }
      };
    }
  }

  return div;
}

/* =========================
   PROSES BELI KELAS
========================= */
async function buyClass(classItem) {
  selectedClass = classItem;
  selectedPricing = null;

  const pricingWrap = document.getElementById("pricingOptions");
  pricingWrap.innerHTML = "";

  classItem.pricing?.forEach((p, index) => {
    const label = p.billingPeriod == 30 ? "1 Bulan"
                : p.billingPeriod == 90 ? "3 Bulan"
                : p.billingPeriod == 180 ? "6 Bulan"
                : "12 Bulan";

    const div = document.createElement("div");
    div.className = "item";
    div.style.cursor = "pointer";
    div.style.padding = "10px";
    div.style.marginBottom = "5px";
    div.style.borderRadius = "8px";

    div.innerHTML = `
      <label style="display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%;">
        <div>
          <b>${label}</b><br>
          Rp ${Number(p.price).toLocaleString("id-ID")}
        </div>
        <input type="radio" name="pricing" value="${index}">
      </label>
    `;

    div.onclick = () => {
      document.querySelectorAll('#pricingOptions .item').forEach(el => {
        el.style.border = "none";
        el.querySelector("input").checked = false;
      });
      div.style.border = "2px solid #2563eb";
      div.querySelector("input").checked = true;
      selectedPricing = p;
    };

    pricingWrap.appendChild(div);
  });

  document.getElementById("paymentModal").classList.add("active");
}

window.closePaymentModal = () => {
  document.getElementById("paymentModal").classList.remove("active");
  selectedClass = null;
};

window.selectPayment = async (paymentMethod) => {
  if (!selectedClass || !selectedPricing) {
    alert("Pilih paket terlebih dahulu");
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) return alert("User tidak ditemukan");

    const price = Number(selectedPricing.price || 0);
    const billingPeriod = Number(selectedPricing.billingPeriod || 30);

    // 1. PENANGANAN UNTUK CASH
    if (paymentMethod === "cash") {
      await addDoc(collection(db, "transactions"), {
        userId: user.uid,
        classId: selectedClass.id,
        className: selectedClass.className || "-",
        studentName: studentData.name || "-",
        studentEmail: studentData.email || "-",
        price,
        billingPeriod,
        paymentMethod: "cash",
        paymentStatus: "pending",
        status: "waiting_confirmation",
        createdAt: serverTimestamp()
      });

      alert("Request pembayaran cash berhasil dikirim");
      closePaymentModal();
      await loadDashboardData();
      return;
    }

    // 2. PENANGANAN UNTUK TRANSFER BANK DAN DANA (MANUAL)
    if (paymentMethod === "transfer_bank" || paymentMethod === "dana") {
      await addDoc(collection(db, "transactions"), {
        userId: user.uid,
        classId: selectedClass.id,
        className: selectedClass.className || "-",
        studentName: studentData.name || "-",
        studentEmail: studentData.email || "-",
        price,
        billingPeriod,
        paymentMethod: paymentMethod,
        paymentStatus: "pending",
        status: "waiting_upload",
        createdAt: serverTimestamp()
      });

      alert(`Pilihan ${paymentMethod === 'dana' ? 'DANA' : 'Transfer Bank'} berhasil. Status sekarang: Menunggu Pembayaran. Silakan upload bukti transfer.`);
      closePaymentModal();
      await loadDashboardData();
      return;
    }

  } catch(err){
    console.error(err);
    alert(err.message);
  }
};

/* =========================
   MASUK KELAS
========================= */
async function openClass(classId, isPaid) {
  if (!isPaid && !ownedClassIds.includes(classId)) {
    try {
      await addDoc(collection(db, "class_students"), {
        classId,
        studentId: auth.currentUser.uid,
        joinedAt: new Date(),
        paymentStatus: "free"
      });
    } catch (e) {
      console.error("Auto join kelas gratis gagal", e);
    }
  }
  window.location = `./classDetail.html?id=${classId}`;
}

/* =========================
   MODAL PROFILE LOGIC
========================= */
window.openProfileModal = () => document.getElementById("profileModal").classList.add("active");
window.closeProfileModal = () => document.getElementById("profileModal").classList.remove("active");

window.saveProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("profileName").value.trim();
  const file = document.getElementById("profileAvatarFile").files[0];

  if (!name) return alert("Nama wajib diisi");

  try {
    let avatarURL = studentData.avatarURL || "../assets/images/default-avatar.png";

    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "avatar_upload");

      const res = await fetch(`https://api.cloudinary.com/v1_1/djlvnubgn/image/upload`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (!data.secure_url) throw new Error("Upload gagal");
      avatarURL = data.secure_url;
    }

    await updateDoc(doc(db, "users", user.uid), { name, avatarURL });

    studentData.name = name;
    studentData.avatarURL = avatarURL;

    await loadProfile(user);
    closeProfileModal();
    alert("Profil berhasil diupdate");
  } catch (err) {
    console.error(err);
    alert("Gagal update profil");
  }
};

/* =========================
   PROSES UPLOAD BUKTI PEMBAYARAN
========================= */
async function uploadPaymentReceipt(classId, file) {
  try {
    // 1. Cari dokumen transaksi yang sesuai di Firestore
    const qTx = query(
      collection(db, "transactions"),
      where("userId", "==", auth.currentUser.uid),
      where("classId", "==", classId),
      where("status", "==", "waiting_upload")
    );
    const snapTx = await getDocs(qTx);
    
    if (snapTx.empty) {
      alert("Transaksi tidak ditemukan atau sudah diproses.");
      return;
    }
    
    const txDocRef = doc(db, "transactions", snapTx.docs[0].id);

    // Tampilkan loading sederhana pada tombol
    const uploadBtn = document.getElementById(`btn-upload-${classId}`);
    if (uploadBtn) {
      uploadBtn.innerText = "⏳ Mengupload...";
      uploadBtn.disabled = true;
    }

    // 2. Upload file gambar ke Cloudinary
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "avatar_upload");

    const res = await fetch(`https://api.cloudinary.com/v1_1/djlvnubgn/image/upload`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (!data.secure_url) throw new Error("Gagal mengunggah gambar ke Cloudinary");

    const receiptURL = data.secure_url;

    // 3. Update data transaksi di Firestore
    await updateDoc(txDocRef, {
      receiptURL: receiptURL,
      status: "waiting_confirmation",
      paymentStatus: "pending",
      uploadedAt: serverTimestamp()
    });

    alert("Bukti pembayaran berhasil diunggah! Kelas akan aktif maksimal 1x24 jam setelah diverifikasi oleh Admin.");
    
    // 4. Refresh Dashboard agar UI terupdate
    await loadDashboardData();

  } catch (err) {
    console.error(err);
    alert("Gagal mengunggah bukti pembayaran: " + err.message);
    
    const uploadBtn = document.getElementById(`btn-upload-${classId}`);
    if (uploadBtn) {
      uploadBtn.innerText = "📸 Upload Bukti";
      uploadBtn.disabled = false;
    }
  }
}
