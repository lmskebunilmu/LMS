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
   RENDER KELAS SAYA (DENGAN RE-ORDERING)
========================= */
function renderMyClasses() {
  const container = document.getElementById("myClassesContainer");
  container.innerHTML = "";

  // 1. Ambil kelas yang transaksinya menggantung (Menunggu Pembayaran)
  const pendingClasses = allFetchedClasses.filter(c => pendingTransactionClassIds.includes(c.id));

  // 2. Ambil kelas yang memang sudah resmi dimasuki/join (Sudah Aktif)
  //    (di-filter agar tidak double jika statusnya bentrok)
  const activeClasses = allFetchedClasses.filter(c => ownedClassIds.includes(c.id) && !pendingTransactionClassIds.includes(c.id));

  if (pendingClasses.length === 0 && activeClasses.length === 0) {
    container.innerHTML = `<p style="color: #64748b; font-size: 14px; grid-column: 1/-1;">Kamu belum masuk/bergabung ke kelas manapun.</p>`;
    return;
  }

  // Render PENDING CLASSES dulu supaya posisinya berada di paling atas
  pendingClasses.forEach(c => {
    const card = createClassCardElement(c, false); // isAlreadyJoined = false supaya tombolnya dinamis (Selesaikan Pembayaran)
    container.appendChild(card);
  });

  // Render ACTIVE CLASSES di bawah kelas pending
  activeClasses.forEach(c => {
    const card = createClassCardElement(c, true);  // isAlreadyJoined = true supaya keluar tombol "Masuk Kelas"
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
    // Sembunyikan dari daftar "Kelas Tersedia" jika user sudah membelinya atau sedang proses bayar
    if (ownedClassIds.includes(c.id) || pendingTransactionClassIds.includes(c.id)) return false;

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
      <div style="text-align: right; display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
        <span style="font-size: 12px; color: #f97316; font-weight: bold;">⏳ Menunggu Bukti</span>
        <button class="btn-modern btn-resume-pay" style="background: linear-gradient(135deg,#f97316,#ea580c); font-size: 12px; padding: 6px 12px;">
          Selesaikan Pembayaran
        </button>
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

  const resumePayBtn = div.querySelector(".btn-resume-pay");
  if (resumePayBtn) {
    resumePayBtn.onclick = () => buyClass(c); 
  }

  return div;
}

/* =========================
   PROSES BELI KELAS (MODERN STEP-BY-STEP)
========================= */
async function buyClass(classItem) {
  selectedClass = classItem;
  selectedPricing = null;

  // 1. Cek dulu apakah siswa sebetulnya punya transaksi pending/waiting untuk kelas ini
  const qTx = query(
    collection(db, "transactions"),
    where("userId", "==", auth.currentUser.uid),
    where("classId", "==", classItem.id),
    where("status", "in", ["waiting_upload", "waiting_confirmation"])
  );
  const snapTx = await getDocs(qTx);

  if (!snapTx.empty) {
    // Jika ada transaksi menggantung, langsung arahkan ke layar instruksi & upload bukti
    const currentTxData = { id: snapTx.docs[0].id, ...snapTx.docs[0].data() };
    showPaymentInstructionAndUpload(currentTxData);
    return;
  }

  // 2. RESET & TAMPILKAN STRUKTUR DASAR MODAL TERLEBIH DAHULU
  const modalContent = document.getElementById("paymentModal").querySelector(".modal-content");
  modalContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3 style="margin: 0; font-size: 18px; color: #0f172a;">💳 Pendaftaran Kelas</h3>
      <button onclick="closePaymentModal()" style="background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;">&times;</button>
    </div>
    <h4 style="margin: 0 0 10px 0; font-size: 15px; color: #334155;">1. Pilih Paket Belajar</h4>
    
    <div id="pricingOptions"></div> 
    
    <hr style="margin: 20px 0; border: none; border-top: 1px dashed #cbd5e1;">
    <h4 style="margin: 0 0 12px 0; font-size: 15px; color: #334155;">2. Pilih Metode Pembayaran</h4>
    <div class="payment-options" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
      <button class="payment-btn" onclick="selectPayment('transfer_bank')" style="padding: 12px; font-weight: 600; border-radius: 10px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">🏦 Transfer</button>
      <button class="payment-btn" onclick="selectPayment('dana')" style="padding: 12px; font-weight: 600; border-radius: 10px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">📱 DANA</button>
      <button class="payment-btn" onclick="selectPayment('cash')" style="padding: 12px; font-weight: 600; border-radius: 10px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">💵 Cash</button>
    </div>
    <div class="modal-actions" style="display: flex; justify-content: flex-end;">
      <button onclick="closePaymentModal()" class="danger" style="padding: 10px 20px; border-radius: 8px;">Batal</button>
    </div>
  `;

  // 3. SEKARANG AMBIL ELEMEN YANG BARU SAJA DI-RENDER DI ATAS
  const pricingWrap = document.getElementById("pricingOptions");
  pricingWrap.innerHTML = `
    <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Silakan tentukan durasi paket belajar yang kamu inginkan:</p>
  `;

  // 4. GENERATE DAN MASUKKAN DAFTAR HARGA
  classItem.pricing?.forEach((p, index) => {
    const label = p.billingPeriod == 30 ? "1 Bulan Belajar"
                : p.billingPeriod == 90 ? "3 Bulan Belajar"
                : p.billingPeriod == 180 ? "6 Bulan Belajar"
                : "12 Bulan Belajar";

    const div = document.createElement("div");
    div.className = "item";
    div.style = `
      cursor: pointer; padding: 14px; margin-bottom: 10px; border-radius: 12px;
      border: 1px solid #e2e8f0; background: #f8fafc; transition: all 0.2s ease;
      display: flex; justify-content: space-between; align-items: center;
    `;

    div.innerHTML = `
      <div>
        <b style="color: #1e293b; font-size: 14px;">${label}</b><br>
        <span style="color: #2563eb; font-weight: 700; font-size: 15px;">Rp ${Number(p.price).toLocaleString("id-ID")}</span>
      </div>
      <input type="radio" name="pricing" value="${index}" style="width: 18px; height: 18px; cursor: pointer;">
    `;

    div.onclick = () => {
      document.querySelectorAll('#pricingOptions .item').forEach(el => {
        el.style.border = "1px solid #e2e8f0";
        el.style.background = "#f8fafc";
        el.querySelector("input").checked = false;
      });
      div.style.border = "2px solid #2563eb";
      div.style.background = "#eff6ff";
      div.querySelector("input").checked = true;
      selectedPricing = p;
    };

    pricingWrap.appendChild(div);
  });

  // 5. AKTIFKAN MODAL
  document.getElementById("paymentModal").classList.add("active");
}

/* =========================
   PROSES SELEKSI & GENERATE INTRUKSI TRANSAKSI
========================= */
window.selectPayment = async (paymentMethod) => {
  if (!selectedClass || !selectedPricing) {
    alert("Silakan tentukan paket belajar terlebih dahulu.");
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) return alert("Sesi kamu berakhir, silakan login kembali.");

    const price = Number(selectedPricing.price || 0);
    const billingPeriod = Number(selectedPricing.billingPeriod || 30);

    const txStatus = paymentMethod === "cash" ? "waiting_confirmation" : "waiting_upload";

    // Simpan data transaksi awal ke Firestore
    const newTxDoc = await addDoc(collection(db, "transactions"), {
      userId: user.uid,
      classId: selectedClass.id,
      className: selectedClass.className || "-",
      studentName: studentData.name || "-",
      studentEmail: studentData.email || "-",
      price,
      billingPeriod,
      paymentMethod: paymentMethod,
      paymentStatus: "pending",
      status: txStatus,
      createdAt: serverTimestamp()
    });

    // Panggil layar instruksi pembayaran dinamis di dalam modal yang sama
    const transactionDataForUI = {
      id: newTxDoc.id,
      classId: selectedClass.id,
      className: selectedClass.className,
      price,
      paymentMethod,
      status: txStatus
    };

    await loadDashboardData(); // Refresh list background dashboard
    showPaymentInstructionAndUpload(transactionDataForUI);

  } catch(err){
    console.error(err);
    alert("Gagal memproses transaksi: " + err.message);
  }
};

/* =========================
   UI STEP 2: HALAMAN INSTRUKSI DAN UPLOAD DI MODAL
========================= */
function showPaymentInstructionAndUpload(tx) {
  const modalContent = document.getElementById("paymentModal").querySelector(".modal-content");
  
  let targetRekening = "";
  let uploadSectionHtml = "";

  if (tx.paymentMethod === "transfer_bank") {
    targetRekening = `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 10px; margin-top: 8px; font-family: monospace; font-size: 14px;">
        Bank BCA: <b>123-456789-012</b><br>
        A.N. M. ZAHWAN ANWAR
      </div>`;
  } else if (tx.paymentMethod === "dana") {
    targetRekening = `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 10px; margin-top: 8px; font-family: monospace; font-size: 14px;">
        Nomor DANA: <b>0878-8389-5814</b><br>
        A.N. MUHAMAD ZAHWAN ANWAR
      </div>`;
  } else {
    targetRekening = `
      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 8px; margin-top: 8px; font-size: 13px; color: #b45309;">
        Silakan temui petugas administrasi lembaga kursus secara langsung untuk melakukan pembayaran tunai.
      </div>`;
  }

  // Tampilkan form upload jika metodenya membutuhkan transfer gambar
  if (tx.status === "waiting_upload") {
    uploadSectionHtml = `
      <div style="background: #f8fafc; border: 2px dashed #cbd5e1; padding: 20px; border-radius: 12px; text-align: center; margin-top: 15px; position: relative;">
        <input type="file" id="modalReceiptFile" accept="image/*" style="display: none;" />
        <div id="uploadPreviewArea">
          <span style="font-size: 28px;">📸</span>
          <p style="margin: 8px 0 12px 0; font-size: 13px; color: #64748b;">Klik tombol di bawah untuk melampirkan foto bukti pembayaran kamu.</p>
        </div>
        <button class="btn-modern" id="btnModalUpload" onclick="document.getElementById('modalReceiptFile').click()" style="background: #2563eb; width: 100%; max-width: 200px; padding: 10px;">Pilih Gambar</button>
      </div>
      <button class="btn-modern" id="btnSubmitModalPayment" disabled style="background: #cbd5e1; color: #94a3b8; width: 100%; margin-top: 15px; padding: 12px; font-size: 14px; font-weight: bold; cursor: not-allowed;">Kirimi Bukti Sekarang &times;</button>
    `;
  } else {
    uploadSectionHtml = `
      <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 15px; border-radius: 10px; text-align: center; margin-top: 15px; color: #065f46; font-size: 13px; font-weight: 500;">
        ⏳ Menunggu verifikasi berkas atau pembayaran tunai dikonfirmasi oleh Admin. Akses kelas otomatis dibuka sesaat setelah disetujui.
      </div>
      <button onclick="closePaymentModal()" class="btn-modern" style="background: #64748b; width: 100%; margin-top: 15px; padding: 12px;">Tutup Halaman Pantauan</button>
    `;
  }

  modalContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3 style="margin: 0; font-size: 18px; color: #0f172a;">🔔 Menyelesaikan Invoice</h3>
      <button onclick="closePaymentModal()" style="background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;">&times;</button>
    </div>
    
    <div style="background: #eff6ff; padding: 14px; border-radius: 10px; margin-bottom: 15px;">
      <span style="font-size: 12px; color: #2563eb; font-weight: bold; text-transform: uppercase;">KELAS TARGET:</span>
      <h4 style="margin: 2px 0 8px 0; font-size: 16px; color: #1e3a8a;">${tx.className}</h4>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #bfdbfe; padding-top: 8px;">
        <span style="font-size: 13px; color: #1e40af;">Total Tagihan:</span>
        <span style="font-size: 16px; font-weight: bold; color: #2563eb;">Rp ${Number(tx.price).toLocaleString("id-ID")}</span>
      </div>
    </div>

    <p style="margin: 0; font-size: 14px; font-weight: bold; color: #334155;">Cara Pembayaran:</p>
    ${targetRekening}

    ${uploadSectionHtml}
  `;

  // Pasang listener jika elemen upload file tersedia
  const fileInput = modalContent.querySelector("#modalReceiptFile");
  if (fileInput) {
    let selectedFileRaw = null;

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedFileRaw = file;
        
        // Ganti area preview dengan informasi file terpilih
        const previewArea = modalContent.querySelector("#uploadPreviewArea");
        previewArea.innerHTML = `
          <span style="font-size: 28px;">📄</span>
          <p style="margin: 8px 0; font-size: 13px; color: #10b981; font-weight: 600;">Berhasil memuat berkas gambar!</p>
          <small style="color: #64748b; font-size: 11px; display:block; margin-bottom:10px;">${file.name}</small>
        `;

        // Aktifkan tombol kirim berkas utama
        const submitBtn = modalContent.querySelector("#btnSubmitModalPayment");
        submitBtn.disabled = false;
        submitBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        submitBtn.style.color = "white";
        submitBtn.style.cursor = "pointer";
        submitBtn.innerText = "🚀 Kirim & Beritahu Admin";

        // Logic kirim data ke Cloudinary saat tombol ditekan
        submitBtn.onclick = async () => {
          submitBtn.disabled = true;
          submitBtn.innerText = "⚡ Sedang Mengirim Berkas...";
          await uploadPaymentReceipt(tx.classId, selectedFileRaw);
          closePaymentModal();
        };
      }
    };
  }

  document.getElementById("paymentModal").classList.add("active");
}

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
   FUNGSI CLOSE MODAL
========================= */
function closePaymentModal() {
  document.getElementById("paymentModal").classList.remove("active");
  selectedClass = null;
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

/* =========================
   EXPORT GLOBAL (PENTING!)
========================= */
window.buyClass = buyClass;
window.selectPayment = selectPayment;
window.closePaymentModal = closePaymentModal;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfile = saveProfile;
