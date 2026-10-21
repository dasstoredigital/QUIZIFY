// ==========================================
// KONFIGURASI FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBjrWur9r7FJd8F-SE8jCaSQUIAmvACHp0",
    authDomain: "quizfy-3a608.firebaseapp.com",
    projectId: "quizfy-3a608",
    storageBucket: "quizfy-3a608.firebasestorage.app",
    messagingSenderId: "202213081570",
    appId: "1:202213081570:web:efd78763078505cf7c39bb"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// State Aplikasi
let currentSessionCode = "";
let currentQuizData = [];
let currentQuestionIndex = 0;
let studentScore = 0;
let studentNameGlobal = "";
let cheatWarningCount = 0;
let isQuizActive = false; // Status apakah kuis sedang aktif dikerjakan atau tidak

// Fungsi Pindah Tampilan (View Switcher)
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

// ==========================================
// 1. SISTEM AUTENTIKASI (FIREBASE AUTH)
// ==========================================

async function registerUser(email, password, role, name) {
    try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        await db.collection("users").doc(user.uid).set({
            name: name,
            email: email,
            role: role
        });

        alert("Registrasi berhasil! Silakan login.");
        switchView('view-home');
    } catch (error) {
        alert("Gagal mendaftar: " + error.message);
    }
}

async function loginUser(email, password) {
    try {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.role === "teacher") {
                switchView('view-teacher-dashboard');
                loadTeacherDashboard();
            } else {
                switchView('view-student-join');
            }
        }
    } catch (error) {
        alert("Login gagal: " + error.message);
    }
}

function loadTeacherDashboard() {
    console.log("Dashboard Guru Dimuat");
    document.getElementById('quiz-title').value = '';
    document.getElementById('questions-container').innerHTML = '';
}

// ==========================================
// 2. FITUR GURU: BUAT & KELOLA KUIS MANUAL
// ==========================================

function addQuestionField() {
    const container = document.getElementById('questions-container');
    const count = container.children.length + 1;
    if (count > 30) {
        alert("Maksimal 30 soal per kuis!");
        return;
    }

    const div = document.createElement('div');
    div.className = 'question-builder-item';
    div.style.cssText = "position: relative; background: #fff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; margin-bottom: 15px;";
    
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong class="q-number-label" style="color: #4338ca;">Soal #${count}</strong>
            <button type="button" class="btn-delete-q" onclick="removeQuestionField(this)" style="background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 13px;">
                <i class="fa-solid fa-trash"></i> Hapus Soal
            </button>
        </div>
        <input type="text" placeholder="Tulis pertanyaan..." class="q-text" required style="width: 100%; margin-bottom: 8px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan A" class="opt-a" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan B" class="opt-b" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan C" class="opt-c" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan D" class="opt-d" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Kunci Jawaban (Ketik persis teks pilihan yang benar)" class="q-ans" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
    `;
    container.appendChild(div);
}

function removeQuestionField(button) {
    const item = button.closest('.question-builder-item');
    item.remove();
    
    const container = document.getElementById('questions-container');
    const questionItems = container.getElementsByClassName('question-builder-item');
    for (let i = 0; i < questionItems.length; i++) {
        const label = questionItems[i].querySelector('.q-number-label');
        if (label) {
            label.innerText = `Soal #${i + 1}`;
        }
    }
}

async function publishQuiz() {
    const title = document.getElementById('quiz-title').value;
    const items = document.querySelectorAll('#questions-container .question-builder-item');
    
    if (!title || items.length < 1) {
        alert("Judul dan minimal 1 soal harus diisi!");
        return;
    }

    let questions = [];
    items.forEach(item => {
        questions.push({
            question: item.querySelector('.q-text').value,
            options: [
                item.querySelector('.opt-a').value,
                item.querySelector('.opt-b').value,
                item.querySelector('.opt-c').value,
                item.querySelector('.opt-d').value,
            ],
            answer: item.querySelector('.q-ans').value
        });
    });

    currentSessionCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    try {
        await db.collection("quizzes").doc(currentSessionCode).set({
            title: title,
            questions: questions,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('display-session-code').innerText = currentSessionCode;
        switchView('view-teacher-live');
        listenLiveLeaderboard(currentSessionCode);
    } catch (error) {
        console.error("Gagal menerbitkan kuis: ", error);
        alert("Terjadi kesalahan koneksi database.");
    }
}

function listenLiveLeaderboard(sessionCode) {
    db.collection("quizzes").doc(sessionCode).collection("leaderboard")
      .orderBy("score", "desc")
      .onSnapshot(snapshot => {
          let html = "";
          let rank = 1;
          snapshot.forEach(doc => {
              let data = doc.data();
              html += `<div class="leaderboard-item"><span>#${rank} ${data.name}</span> <span>${data.score} Poin</span></div>`;
              rank++;
          });
          document.getElementById('live-leaderboard').innerHTML = html || "<p>Belum ada murid yang bergabung.</p>";
      });
}

// ==========================================
// 3. FITUR MURID: MENGERJAKAN KUIS
// ==========================================

async function joinQuiz() {
    const name = document.getElementById('student-name').value.trim();
    const code = document.getElementById('session-code-input').value.trim().toUpperCase();

    if (!name || !code) {
        alert("Nama dan Kode Sesi wajib diisi!");
        return;
    }

    try {
        const docRef = await db.collection("quizzes").doc(code).get();
        if (!docRef.exists) {
            alert("Kode sesi kuis tidak ditemukan!");
            return;
        }

        const data = docRef.data();
        currentQuizData = data.questions;
        currentSessionCode = code;
        studentNameGlobal = name;
        currentQuestionIndex = 0;
        studentScore = 0;
        cheatWarningCount = 0;

        await db.collection("quizzes").doc(code).collection("leaderboard").doc(name).set({
            name: name,
            score: 0
        });

        switchView('view-student-quiz');
        loadQuestion();
        initAntiCheat();
    } catch (error) {
        console.error("Gagal bergabung: ", error);
        alert("Gagal terhubung ke kuis.");
    }
}

function loadQuestion() {
    if (currentQuestionIndex >= currentQuizData.length) {
        finishQuiz();
        return;
    }

    const q = currentQuizData[currentQuestionIndex];
    document.getElementById('question-tracker').innerText = `Soal ${currentQuestionIndex + 1} dari ${currentQuizData.length}`;
    document.getElementById('question-text').innerText = q.question;
    document.getElementById('current-points').innerText = studentScore;

    const optionsContainer = document.getElementById('options-grid');
    optionsContainer.innerHTML = '';

    q.options.forEach(optText => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = optText;
        btn.onclick = () => checkAnswer(optText, q.answer);
        optionsContainer.appendChild(btn);
    });
}

async function checkAnswer(selected, correct) {
    if (selected === correct) {
        studentScore += 10;
        alert("Benar! 🎉");
    } else {
        alert(`Salah! ❌ Jawaban yang benar: ${correct}`);
    }

    await db.collection("quizzes").doc(currentSessionCode).collection("leaderboard").doc(studentNameGlobal).update({
        score: studentScore
    });

    currentQuestionIndex++;
    loadQuestion();
}

async function finishQuiz() {
    isQuizActive = false; // Matikan status aktif agar anti-cheat berhenti total setelah kuis selesai
    switchView('view-student-finish');
    document.getElementById('final-score').innerText = `${studentScore} Poin`;

    const snapshot = await db.collection("quizzes").doc(currentSessionCode).collection("leaderboard")
                             .orderBy("score", "desc").get();
    
    let html = "";
    let rank = 1;
    snapshot.forEach(doc => {
        let data = doc.data();
        html += `<div class="leaderboard-item"><span>#${rank} ${data.name}</span> <span>${data.score} Poin</span></div>`;
        rank++;
    });
    document.getElementById('final-leaderboard').innerHTML = html;
}

// ==========================================
// 4. FITUR ANTI-CHEAT (DIPERBAIKI)
// ==========================================

function initAntiCheat() {
    isQuizActive = true; // Aktifkan anti-cheat saat mulai mengerjakan kuis
}

document.addEventListener("visibilitychange", async () => {
    // Hanya jalankan jika kuis benar-benar sedang aktif dikerjakan
    if (document.hidden && isQuizActive && currentSessionCode && studentNameGlobal) {
        cheatWarningCount++;
        
        if (cheatWarningCount === 1) {
            alert("PERINGATAN! Anda terdeteksi keluar dari halaman kuis. Jika keluar sekali lagi, kuis Anda akan dihentikan!");
        } else {
            alert("Anda terdeteksi keluar kuis berulang kali. Kuis Anda dihentikan karena dianggap curang!");
            
            try {
                await db.collection("quizzes").doc(currentSessionCode).collection("leaderboard").doc(studentNameGlobal).update({
                    status: "DISKUALIFIKASI (Curang / Pindah Tab)",
                    score: 0
                });
            } catch (e) {
                console.error("Gagal mencatat kecurangan:", e);
            }

            isQuizActive = false;
            finishQuiz();
        }
    }
});

// ==========================================
// 5. HELPER HANDLERS
// ==========================================

function handleRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-pass').value.trim();
    const role = document.getElementById('reg-role').value;

    if (!name || !email || !password) {
        alert("Semua kolom harus diisi!");
        return;
    }

    registerUser(email, password, role, name);
}

function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value.trim();

    if (!email || !password) {
        alert("Email dan password wajib diisi!");
        return;
    }

    loginUser(email, password);
}

// ==========================================
// 6. FITUR BANK SOAL (PENGELOLAAN MULTI-SOAL)
// ==========================================

function openQuestionBank() {
    switchView('view-teacher-bank');
    document.getElementById('bank-category').value = '';
    document.getElementById('bank-questions-container').innerHTML = '';
    
    // Tambahkan 1 form default awal
    addBankQuestionField();
    loadQuestionBank();
}

// Tambah Form Input Soal di Bank Soal
function addBankQuestionField() {
    const container = document.getElementById('bank-questions-container');
    const count = container.children.length + 1;

    const div = document.createElement('div');
    div.className = 'bank-builder-item';
    div.style.cssText = "background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px; margin-bottom: 12px;";

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong class="bank-q-label" style="color: #6366f1;">Soal Bank #${count}</strong>
            <button type="button" onclick="removeBankQuestionField(this)" style="background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;">
                <i class="fa-solid fa-trash"></i> Hapus
            </button>
        </div>
        <input type="text" placeholder="Tulis pertanyaan..." class="bank-q-text" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan A" class="bank-opt-a" required style="width: 100%; margin-bottom: 4px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px;">
        <input type="text" placeholder="Pilihan B" class="bank-opt-b" required style="width: 100%; margin-bottom: 4px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px;">
        <input type="text" placeholder="Pilihan C" class="bank-opt-c" required style="width: 100%; margin-bottom: 4px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px;">
        <input type="text" placeholder="Pilihan D" class="bank-opt-d" required style="width: 100%; margin-bottom: 4px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px;">
        <input type="text" placeholder="Kunci Jawaban (Ketik persis teks pilihan yang benar)" class="bank-q-ans" required style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px;">
    `;

    container.appendChild(div);
}

// Hapus Form Soal di Bank Soal
function removeBankQuestionField(button) {
    const item = button.closest('.bank-builder-item');
    item.remove();

    const container = document.getElementById('bank-questions-container');
    const items = container.getElementsByClassName('bank-builder-item');
    for (let i = 0; i < items.length; i++) {
        const label = items[i].querySelector('.bank-q-label');
        if (label) label.innerText = `Soal Bank #${i + 1}`;
    }
}

// Simpan Banyak Soal Sekaligus ke Bank Soal
async function saveToQuestionBank() {
    const category = document.getElementById('bank-category').value.trim();
    const items = document.querySelectorAll('.bank-builder-item');

    if (!category) {
        alert("Kategori / Topik Soal wajib diisi!");
        return;
    }

    if (items.length === 0) {
        alert("Minimal buat 1 form soal!");
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) {
        alert("Sesi login berakhir, silakan login ulang.");
        return;
    }

    try {
        const batch = db.batch();

        items.forEach(item => {
            const qText = item.querySelector('.bank-q-text').value.trim();
            const optA = item.querySelector('.bank-opt-a').value.trim();
            const optB = item.querySelector('.bank-opt-b').value.trim();
            const optC = item.querySelector('.bank-opt-c').value.trim();
            const optD = item.querySelector('.bank-opt-d').value.trim();
            const ans = item.querySelector('.bank-q-ans').value.trim();

            if (qText && optA && optB && optC && optD && ans) {
                const docRef = db.collection("question_bank").doc();
                batch.set(docRef, {
                    teacherUid: user.uid,
                    category: category,
                    question: qText,
                    options: [optA, optB, optC, optD],
                    answer: ans,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        });

        await batch.commit();

        alert("Semua soal berhasil disimpan ke Bank Soal!");

        // Reset form & reload
        document.getElementById('bank-questions-container').innerHTML = '';
        addBankQuestionField();
        loadQuestionBank();
    } catch (error) {
        console.error("Gagal menyimpan ke bank soal: ", error);
        alert("Gagal menyimpan soal ke bank.");
    }
}

async function loadQuestionBank() {
    const user = firebase.auth().currentUser;
    const container = document.getElementById('bank-questions-list');
    container.innerHTML = '<p>Memuat bank soal...</p>';

    if (!user) return;

    try {
        const snapshot = await db.collection("question_bank")
                                   .where("teacherUid", "==", user.uid)
                                   .get();

        if (snapshot.empty) {
            container.innerHTML = '<p style="color: #64748b;">Belum ada soal tersimpan di bank soal.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            html += `
                <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: white;">
                    <span style="background: #e0e7ff; color: #4338ca; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: bold;">${item.category}</span>
                    <p style="font-weight: 600; margin: 8px 0 4px 0;">${item.question}</p>
                    <small style="color: #10b981;">Jawaban Benar: ${item.answer}</small>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error("Gagal memuat bank soal: ", error);
        container.innerHTML = '<p>Gagal memuat data.</p>';
    }
}

// ==========================================
// 7. EKSPOR REKAP CSV
// ==========================================

async function exportLeaderboardToCSV() {
    if (!currentSessionCode) {
        alert("Tidak ada sesi kuis yang aktif saat ini!");
        return;
    }

    try {
        const snapshot = await db.collection("quizzes").doc(currentSessionCode).collection("leaderboard")
                                   .orderBy("score", "desc").get();

        if (snapshot.empty) {
            alert("Belum ada data nilai murid untuk diexport.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,No,Nama Murid,Skor Akhir,Status\n";
        let rank = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            const status = data.status || "Selesai";
            csvContent += `${rank},"${data.name}",${data.score},"${status}"\n`;
            rank++;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Rekap_Nilai_Kuis_${currentSessionCode}.csv`);
        document.body.appendChild(link);

        link.click();
        document.body.removeChild(link);

        alert("Rekap nilai berhasil diunduh!");
    } catch (error) {
        console.error("Gagal mengexport rekap nilai: ", error);
        alert("Terjadi kesalahan saat mengunduh rekap nilai.");
    }
}

// ==========================================
// 8. BANK PICKER (GURU PILIH SOAL UNTUK KUIS)
// ==========================================

async function openBankPicker() {
    const user = firebase.auth().currentUser;
    const container = document.getElementById('picker-questions-list');
    container.innerHTML = '<p>Memuat bank soal...</p>';
    
    switchView('view-bank-picker');

    if (!user) return;

    try {
        const snapshot = await db.collection("question_bank")
                                   .where("teacherUid", "==", user.uid)
                                   .get();

        if (snapshot.empty) {
            container.innerHTML = '<p style="color: #64748b;">Belum ada soal di Bank Soal. Silakan buat terlebih dahulu melalui menu Kelola Bank Soal.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            html += `
                <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: white; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="background: #e0e7ff; color: #4338ca; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: bold;">${item.category}</span>
                        <p style="font-weight: 600; margin: 8px 0 4px 0;">${item.question}</p>
                        <small style="color: #10b981;">Jawaban: ${item.answer}</small>
                    </div>
                    <button class="btn btn-primary" style="padding: 8px 15px; font-size: 14px;" onclick='insertQuestionToQuiz(${JSON.stringify(item)})'>
                        <i class="fa-solid fa-plus"></i> Pilih
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error("Gagal memuat pilihan bank soal: ", error);
        container.innerHTML = '<p>Gagal memuat data bank soal.</p>';
    }
}

function insertQuestionToQuiz(item) {
    const container = document.getElementById('questions-container');
    const count = container.children.length + 1;
    
    if (count > 30) {
        alert("Maksimal 30 soal per kuis!");
        return;
    }

    const div = document.createElement('div');
    div.className = 'question-builder-item';
    div.style.cssText = "position: relative; background: #fff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; margin-bottom: 15px;";
    
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong class="q-number-label" style="color: #4338ca;">Soal #${count} (Dari Bank Soal)</strong>
            <button type="button" class="btn-delete-q" onclick="removeQuestionField(this)" style="background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 13px;">
                <i class="fa-solid fa-trash"></i> Hapus Soal
            </button>
        </div>
        <input type="text" placeholder="Tulis pertanyaan..." class="q-text" value="${item.question}" required style="width: 100%; margin-bottom: 8px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan A" class="opt-a" value="${item.options[0]}" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan B" class="opt-b" value="${item.options[1]}" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan C" class="opt-c" value="${item.options[2]}" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Pilihan D" class="opt-d" value="${item.options[3]}" required style="width: 100%; margin-bottom: 6px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <input type="text" placeholder="Kunci Jawaban" class="q-ans" value="${item.answer}" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px;">
    `;
    container.appendChild(div);

    alert("Soal berhasil dimasukkan ke kuis!");
    switchView('view-teacher-dashboard');
}