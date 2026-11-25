// ==================== 1. DATA KONSTANTA & STATE ====================
        const CRITERIA_LIST = [
            "GERAK SIKAP",
            "GERAK TANGAN SERANGAN",
            "GERAK TANGAN TANGKISAN",
            "GERAK KAKI SERANGAN",
            "RANGKAIAN GERAK DITEMPAT",
            "GERAK LANGKAH",
            "RANGKAIAN GERAK LANGKAH",
            "RANGKAIAN GERAK PENGARAHAN",
            "RANGKAIAN GERAK PRAKTIS",
            "RANGKAIAN GERAK TERIKAT",
            "TANGKAP KUNCI",
            "GERAK BEBAS",
            "PELEPASAN TANGKAP KUNCI"
        ];

        const STORAGE_KEY_RECORDS = 'mp_ukt_submitted_records_v1';
        const STORAGE_KEY_DRAFT = 'mp_ukt_examiner_draft_v1';
        const STORAGE_KEY_KKM = 'mp_ukt_kkm_setting_v1';

        let kkmThreshold = parseFloat(localStorage.getItem(STORAGE_KEY_KKM)) || 7.0;
        let submittedRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_RECORDS)) || [];
        let currentModalRecord = null;

        // State untuk sesi penguji (1 - 4 anggota bersamaan)
        let sessionState = {
            examinerName: '',
            examinerKolat: '',
            examDate: new Date().toISOString().split('T')[0],
            activeIndex: 0,
            participants: []
        };

        let pendingConfirmCallback = null;

        // Membuat objek peserta kosong
        function createEmptyParticipant(index) {
            return {
                id: 'P-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                name: '',
                examNo: '',
                level: 'Dasar I',
                scores: CRITERIA_LIST.map(() => [null, null, null, null]) // [unsur, stamina, koordinasi, kemantapan]
            };
        }

        // ==================== 2. INISIALISASI APLIKASI ====================
        function initApp() {
            // Muat KKM
            document.getElementById('kkmInput').value = kkmThreshold.toFixed(1);
            document.getElementById('displayKkmInfo').textContent = kkmThreshold.toFixed(2);

            // Muat draft sesi penguji jika ada
            const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed && Array.isArray(parsed.participants) && parsed.participants.length > 0) {
                        sessionState = parsed;
                    } else {
                        sessionState.participants = [createEmptyParticipant(0), createEmptyParticipant(1), createEmptyParticipant(2)];
                    }
                } catch (e) {
                    sessionState.participants = [createEmptyParticipant(0), createEmptyParticipant(1), createEmptyParticipant(2)];
                }
            } else {
                // Default sediakan 3 slot peserta siap dinilai sekaligus
                sessionState.participants = [
                    createEmptyParticipant(0),
                    createEmptyParticipant(1),
                    createEmptyParticipant(2)
                ];
            }

            // Sinkronisasi input identitas penguji
            document.getElementById('examinerName').value = sessionState.examinerName || '';
            document.getElementById('examinerKolat').value = sessionState.examinerKolat || '';
            document.getElementById('examDate').value = sessionState.examDate || new Date().toISOString().split('T')[0];

            renderParticipantTabs();
            loadActiveParticipantIntoForm();
            updateAdminBadge();
            renderAdminDashboard();
        }

        // ==================== 3. NAVIGASI MODE (PENGUJI / ADMIN) ====================
        function switchMode(mode) {
            const viewPenguji = document.getElementById('viewPenguji');
            const viewAdmin = document.getElementById('viewAdmin');
            const tabPenguji = document.getElementById('tabPenguji');
            const tabAdmin = document.getElementById('tabAdmin');

            if (mode === 'penguji') {
                viewPenguji.classList.remove('hidden');
                viewAdmin.classList.add('hidden');
                tabPenguji.className = 'flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-mp-red text-white shadow';
                tabAdmin.className = 'flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all text-slate-300 hover:text-white';
            } else {
                viewPenguji.classList.add('hidden');
                viewAdmin.classList.remove('hidden');
                tabAdmin.className = 'flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-mp-red text-white shadow';
                tabPenguji.className = 'flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all text-slate-300 hover:text-white';
                renderAdminDashboard();
            }
        }

        // ==================== 4. LOGIKA KALKULASI NILAI ====================
        function calculateParticipantMetrics(scoresMatrix) {
            let jumlahNilaiRataRata = 0;
            let activeCriteriaCount = 0;

            const rowDetails = scoresMatrix.map((aspects, idx) => {
                const a = parseFloat(aspects[0]) || 0;
                const b = parseFloat(aspects[1]) || 0;
                const c = parseFloat(aspects[2]) || 0;
                const d = parseFloat(aspects[3]) || 0;

                const rowTotal = a + b + c + d;
                const rowAvg = rowTotal > 0 ? (rowTotal / 4) : 0;

                // Hanya hitung materi yang diujikan (nilai > 0) seperti di blangko contoh
                if (rowTotal > 0) {
                    activeCriteriaCount++;
                    jumlahNilaiRataRata += rowAvg;
                }

                return {
                    no: idx + 1,
                    criteria: CRITERIA_LIST[idx],
                    a: aspects[0],
                    b: aspects[1],
                    c: aspects[2],
                    d: aspects[3],
                    rowTotal: Number(rowTotal.toFixed(2)),
                    rowAvg: Number(rowAvg.toFixed(2))
                };
            });

            const finalAverage = activeCriteriaCount > 0 ? (jumlahNilaiRataRata / activeCriteriaCount) : 0;
            const isPassed = activeCriteriaCount > 0 && Number(finalAverage.toFixed(2)) >= kkmThreshold;

            return {
                rowDetails,
                activeCriteriaCount,
                jumlahNilai: Number(jumlahNilaiRataRata.toFixed(2)),
                finalAverage: Number(finalAverage.toFixed(2)),
                isPassed
            };
        }

        // Format angka desimal rapi (misal 7.5 atau 7.75 atau 8)
        function formatNumberID(num) {
            if (num === null || num === undefined || num === '') return '';
            return Number(num).toLocaleString('id-ID', { maximumFractionDigits: 2 });
        }

        // ==================== 5. MANAJEMEN MULTI-PESERTA (1-4 ANGGOTA) ====================
        function renderParticipantTabs() {
            const container = document.getElementById('participantTabs');
            const btnAdd = document.getElementById('btnAddSlot');
            container.innerHTML = '';

            sessionState.participants.forEach((p, idx) => {
                const metrics = calculateParticipantMetrics(p.scores);
                const isActive = idx === sessionState.activeIndex;
                const displayName = p.name.trim() ? p.name : `Peserta #${idx + 1}`;

                const tabEl = document.createElement('div');
                tabEl.className = `relative flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition select-none ${
                    isActive 
                    ? 'bg-white border-mp-red shadow-sm ring-2 ring-mp-red/20' 
                    : 'bg-slate-50 border-slate-200 hover:bg-white'
                }`;
                tabEl.onclick = () => selectParticipantSlot(idx);

                tabEl.innerHTML = `
                    <div class="min-w-0 pr-2">
                        <div class="flex items-center gap-1.5">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-md text-[11px] font-bold ${isActive ? 'bg-mp-red text-white' : 'bg-slate-200 text-slate-700'}">
                                ${idx + 1}
                            </span>
                            <p class="text-xs sm:text-sm font-bold truncate ${isActive ? 'text-slate-900' : 'text-slate-600'}">
                                ${escapeHtml(displayName)}
                            </p>
                        </div>
                        <div class="flex items-center gap-2 mt-1 text-[11px]">
                            <span class="text-slate-500 truncate">${escapeHtml(p.level)}</span>
                            <span class="font-bold ${metrics.activeCriteriaCount > 0 ? (metrics.isPassed ? 'text-emerald-600' : 'text-mp-red') : 'text-slate-400'}">
                                ${metrics.activeCriteriaCount > 0 ? 'Rata2: ' + formatNumberID(metrics.finalAverage) : 'Kosong'}
                            </span>
                        </div>
                    </div>
                    ${sessionState.participants.length > 1 ? `
                        <button onclick="event.stopPropagation(); removeParticipantSlot(${idx})" title="Hapus Slot" class="w-6 h-6 rounded-lg text-slate-400 hover:text-mp-red hover:bg-red-50 flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    ` : ''}
                `;
                container.appendChild(tabEl);
            });

            // Batasi maksimal 4 peserta per sesi
            if (sessionState.participants.length >= 4) {
                btnAdd.disabled = true;
                btnAdd.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btnAdd.disabled = false;
                btnAdd.classList.remove('opacity-50', 'cursor-not-allowed');
            }

            document.getElementById('btnAllCount').textContent = sessionState.participants.length;
        }

        function selectParticipantSlot(index) {
            sessionState.activeIndex = index;
            saveSessionDraft();
            renderParticipantTabs();
            loadActiveParticipantIntoForm();
        }

        function addParticipantSlot() {
            if (sessionState.participants.length >= 4) {
                showToast('Maksimal 4 anggota dalam satu sesi penilaian.', 'warning');
                return;
            }
            sessionState.participants.push(createEmptyParticipant(sessionState.participants.length));
            sessionState.activeIndex = sessionState.participants.length - 1;
            saveSessionDraft();
            renderParticipantTabs();
            loadActiveParticipantIntoForm();
        }

        function removeParticipantSlot(index) {
            if (sessionState.participants.length <= 1) return;
            sessionState.participants.splice(index, 1);
            if (sessionState.activeIndex >= sessionState.participants.length) {
                sessionState.activeIndex = sessionState.participants.length - 1;
            }
            saveSessionDraft();
            renderParticipantTabs();
            loadActiveParticipantIntoForm();
        }

        function loadActiveParticipantIntoForm() {
            const p = sessionState.participants[sessionState.activeIndex];
            document.getElementById('activeSlotNumber').textContent = sessionState.activeIndex + 1;
            document.getElementById('memberName').value = p.name || '';
            document.getElementById('memberExamNo').value = p.examNo || '';
            document.getElementById('memberLevel').value = p.level || 'Dasar I';

            renderScoringTableRows(p.scores);
            updateFooterSummary(p.scores);
        }

        function updateActiveMemberMeta() {
            const p = sessionState.participants[sessionState.activeIndex];
            p.name = document.getElementById('memberName').value;
            p.examNo = document.getElementById('memberExamNo').value;
            p.level = document.getElementById('memberLevel').value;
            saveSessionDraft();
            renderParticipantTabs();
        }

        function saveSessionDraft() {
            sessionState.examinerName = document.getElementById('examinerName').value;
            sessionState.examinerKolat = document.getElementById('examinerKolat').value;
            sessionState.examDate = document.getElementById('examDate').value;
            localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(sessionState));
        }

        // ==================== 6. RENDER TABEL PENILAIAN 13 KRITERIA ====================
        function renderScoringTableRows(scoresMatrix) {
            const tbody = document.getElementById('scoringTableBody');
            tbody.innerHTML = '';

            CRITERIA_LIST.forEach((criteriaName, rowIdx) => {
                const rowScores = scoresMatrix[rowIdx];
                const a = parseFloat(rowScores[0]) || 0;
                const b = parseFloat(rowScores[1]) || 0;
                const c = parseFloat(rowScores[2]) || 0;
                const d = parseFloat(rowScores[3]) || 0;
                const total = a + b + c + d;
                const avg = total > 0 ? total / 4 : 0;

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-red-50/30 transition-colors';

                let inputsHtml = '';
                for (let colIdx = 0; colIdx < 4; colIdx++) {
                    const val = rowScores[colIdx] !== null && rowScores[colIdx] !== '' ? rowScores[colIdx] : '';
                    inputsHtml += `
                        <td class="p-1.5 text-center">
                            <input type="number" 
                                step="0.5" 
                                min="0" 
                                max="10" 
                                value="${val}"
                                placeholder="-"
                                oninput="handleScoreInput(${rowIdx}, ${colIdx}, this)"
                                class="w-full text-center py-1.5 px-1 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-mp-red focus:border-mp-red outline-none transition">
                        </td>
                    `;
                }

                tr.innerHTML = `
                    <td class="py-2 px-2 text-center font-semibold text-slate-500 bg-slate-50/70">${rowIdx + 1}</td>
                    <td class="py-2 px-3 font-semibold text-slate-800 text-xs sm:text-sm">${criteriaName}</td>
                    ${inputsHtml}
                    <td id="rowTotal_${rowIdx}" class="py-2 px-2 text-center font-bold text-slate-800 bg-slate-50">
                        ${total > 0 ? formatNumberID(total) : '0'}
                    </td>
                    <td id="rowAvg_${rowIdx}" class="py-2 px-2 text-center font-bold text-mp-red bg-red-50/40">
                        ${total > 0 ? formatNumberID(avg) : '0'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function handleScoreInput(rowIdx, colIdx, inputEl) {
            let valStr = inputEl.value;
            if (valStr === '') {
                sessionState.participants[sessionState.activeIndex].scores[rowIdx][colIdx] = null;
            } else {
                let num = parseFloat(valStr);
                if (isNaN(num)) num = 0;
                if (num > 10) {
                    num = 10;
                    inputEl.value = 10;
                    showToast('Maksimal nilai per aspek adalah 10.', 'warning');
                }
                if (num < 0) {
                    num = 0;
                    inputEl.value = 0;
                }
                sessionState.participants[sessionState.activeIndex].scores[rowIdx][colIdx] = num;
            }

            const p = sessionState.participants[sessionState.activeIndex];
            const row = p.scores[rowIdx];
            const total = (parseFloat(row[0]) || 0) + (parseFloat(row[1]) || 0) + (parseFloat(row[2]) || 0) + (parseFloat(row[3]) || 0);
            const avg = total > 0 ? total / 4 : 0;

            document.getElementById(`rowTotal_${rowIdx}`).textContent = total > 0 ? formatNumberID(total) : '0';
            document.getElementById(`rowAvg_${rowIdx}`).textContent = total > 0 ? formatNumberID(avg) : '0';

            updateFooterSummary(p.scores);
            saveSessionDraft();
            renderParticipantTabs();
        }

        function updateFooterSummary(scoresMatrix) {
            const metrics = calculateParticipantMetrics(scoresMatrix);
            document.getElementById('activeCriteriaCount').textContent = metrics.activeCriteriaCount;
            document.getElementById('footerActiveCount').textContent = metrics.activeCriteriaCount;
            document.getElementById('footerJumlahNilai').textContent = formatNumberID(metrics.jumlahNilai);
            document.getElementById('footerNilaiAkhir').textContent = formatNumberID(metrics.finalAverage);

            const badge = document.getElementById('footerStatusBadge');
            if (metrics.activeCriteriaCount === 0) {
                badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-600';
                badge.innerHTML = 'BELUM ADA NILAI';
            } else if (metrics.isPassed) {
                badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300';
                badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> LAYAK NAIK TINGKAT';
            } else {
                badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-mp-red border border-red-300';
                badge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> BELUM LAYAK / MENGULANG';
            }
        }

        // ==================== 7. MUAT CONTOH DATA PERSIS BLANGKO GAMBAR ====================
        function loadSamplePaperData() {
            const sampleScores = [
                [8, 7, 7.5, 7.5],     // 1. GERAK SIKAP -> 30 | 7.5
                [8, 7, 8, 8],         // 2. GERAK TANGAN SERANGAN -> 31 | 7.75 (7.8)
                [8, 7, 8, 7],         // 3. GERAK TANGAN TANGKISAN -> 30 | 7.5
                [8, 7, 7.5, 7.5],     // 4. GERAK KAKI SERANGAN -> 30 | 7.5
                [8, 7, 7.5, 8],       // 5. RANGKAIAN GERAK DITEMPAT -> 30.5 | 7.625 (7.6)
                [8, 7, 8, 8],         // 6. GERAK LANGKAH -> 31 | 7.75 (7.8)
                [8, 7, 8, 8],         // 7. RANGKAIAN GERAK LANGKAH -> 31 | 7.75 (7.8)
                [null, null, null, null], // 8. RANGKAIAN GERAK PENGARAHAN -> 0 | 0
                [8, 6.5, 7, 7],       // 9. RANGKAIAN GERAK PRAKTIS -> 28.5 | 7.125 (7.1)
                [7.5, 6.5, 6.5, 6.5], // 10. RANGKAIAN GERAK TERIKAT -> 27 | 6.75
                [6, 6.5, 6.5, 7.5],   // 11. TANGKAP KUNCI -> 26.5 | 6.625 (6.6)
                [7, 6.5, 7, 7],       // 12. GERAK BEBAS -> 27.5 | 6.875 (6.9)
                [null, null, null, null]  // 13. PELEPASAN TANGKAP KUNCI -> kosong
            ];

            if (!sessionState.examinerName) {
                sessionState.examinerName = 'Mas Agung Prasetyo';
                document.getElementById('examinerName').value = sessionState.examinerName;
            }
            if (!sessionState.examinerKolat) {
                sessionState.examinerKolat = 'Cabang Khusus / Pusat';
                document.getElementById('examinerKolat').value = sessionState.examinerKolat;
            }

            const p = sessionState.participants[sessionState.activeIndex];
            p.name = p.name || 'Ahmad Rizky Pratama';
            p.examNo = p.examNo || 'UKT-MP-001';
            p.level = 'Balik I';
            p.scores = sampleScores;

            saveSessionDraft();
            renderParticipantTabs();
            loadActiveParticipantIntoForm();
            showToast('Contoh data blangko kertas berhasil dimuat!', 'success');
        }

        function openResetConfirm() {
            showConfirmModal(
                'Reset Form Penilaian?',
                'Seluruh nilai yang sedang diketik pada peserta aktif saat ini akan dikosongkan.',
                () => {
                    const idx = sessionState.activeIndex;
                    sessionState.participants[idx] = createEmptyParticipant(idx);
                    saveSessionDraft();
                    renderParticipantTabs();
                    loadActiveParticipantIntoForm();
                    showToast('Form peserta aktif berhasil di-reset.', 'info');
                }
            );
        }

        // ==================== 8. KIRIM DATA KE ADMIN ====================
        function submitSingleParticipant() {
            const examinerName = document.getElementById('examinerName').value.trim();
            const examinerKolat = document.getElementById('examinerKolat').value.trim();
            const examDate = document.getElementById('examDate').value;

            if (!examinerName) {
                showToast('Harap isi Nama Penguji terlebih dahulu!', 'error');
                document.getElementById('examinerName').focus();
                return;
            }

            const p = sessionState.participants[sessionState.activeIndex];
            if (!p.name.trim()) {
                showToast('Harap isi Nama Anggota sebelum mengirim nilai!', 'error');
                document.getElementById('memberName').focus();
                return;
            }

            const metrics = calculateParticipantMetrics(p.scores);
            if (metrics.activeCriteriaCount === 0) {
                showToast('Nilai masih kosong! Masukkan minimal 1 kriteria penilaian.', 'error');
                return;
            }

            const record = {
                recordId: 'REC-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
                submittedAt: new Date().toISOString(),
                examinerName,
                examinerKolat: examinerKolat || '-',
                examDate: examDate || new Date().toISOString().split('T')[0],
                memberName: p.name.trim(),
                memberExamNo: p.examNo.trim() || '-',
                memberLevel: p.level,
                scores: JSON.parse(JSON.stringify(p.scores)),
                activeCriteriaCount: metrics.activeCriteriaCount,
                jumlahNilai: metrics.jumlahNilai,
                finalAverage: metrics.finalAverage
            };

            submittedRecords.unshift(record);
            localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(submittedRecords));
            updateAdminBadge();

            showToast(`Nilai ${record.memberName} (Rata-rata: ${formatNumberID(record.finalAverage)}) berhasil dikirim ke Admin!`, 'success');
        }

        function submitAllParticipants() {
            const examinerName = document.getElementById('examinerName').value.trim();
            const examinerKolat = document.getElementById('examinerKolat').value.trim();
            const examDate = document.getElementById('examDate').value;

            if (!examinerName) {
                showToast('Harap isi Nama Penguji terlebih dahulu!', 'error');
                document.getElementById('examinerName').focus();
                return;
            }

            let validCount = 0;
            sessionState.participants.forEach((p, idx) => {
                const metrics = calculateParticipantMetrics(p.scores);
                if (p.name.trim() && metrics.activeCriteriaCount > 0) {
                    const record = {
                        recordId: 'REC-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 5),
                        submittedAt: new Date().toISOString(),
                        examinerName,
                        examinerKolat: examinerKolat || '-',
                        examDate: examDate || new Date().toISOString().split('T')[0],
                        memberName: p.name.trim(),
                        memberExamNo: p.examNo.trim() || '-',
                        memberLevel: p.level,
                        scores: JSON.parse(JSON.stringify(p.scores)),
                        activeCriteriaCount: metrics.activeCriteriaCount,
                        jumlahNilai: metrics.jumlahNilai,
                        finalAverage: metrics.finalAverage
                    };
                    submittedRecords.unshift(record);
                    validCount++;
                }
            });

            if (validCount === 0) {
                showToast('Tidak ada peserta valid yang siap dikirim. Pastikan Nama Anggota dan Nilai terisi.', 'error');
                return;
            }

            localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(submittedRecords));
            updateAdminBadge();
            showToast(`${validCount} data penilaian peserta berhasil dikirim ke Admin!`, 'success');
        }

        // ==================== 9. DASHBOARD ADMIN & REKAPITULASI ====================
        function updateAdminBadge() {
            document.getElementById('adminBadgeCount').textContent = submittedRecords.length;
        }

        function updateKkmSetting(newVal) {
            let val = parseFloat(newVal);
            if (isNaN(val) || val < 1 || val > 10) {
                val = 7.0;
                document.getElementById('kkmInput').value = '7.0';
            }
            kkmThreshold = val;
            localStorage.setItem(STORAGE_KEY_KKM, kkmThreshold.toString());
            document.getElementById('displayKkmInfo').textContent = kkmThreshold.toFixed(2);
            updateFooterSummary(sessionState.participants[sessionState.activeIndex].scores);
            renderParticipantTabs();
            renderAdminDashboard();
            showToast(`Standar kelulusan (KKM) diperbarui menjadi ${kkmThreshold.toFixed(1)}`, 'info');
        }

        function renderAdminDashboard() {
            const total = submittedRecords.length;
            let lulus = 0;
            let tidakLulus = 0;
            let sumAvg = 0;

            submittedRecords.forEach(rec => {
                sumAvg += rec.finalAverage;
                if (rec.finalAverage >= kkmThreshold) {
                    lulus++;
                } else {
                    tidakLulus++;
                }
            });

            document.getElementById('statTotal').textContent = total;
            document.getElementById('statLulus').textContent = lulus;
            document.getElementById('statTidakLulus').textContent = tidakLulus;
            document.getElementById('statAvgAll').textContent = total > 0 ? formatNumberID((sumAvg / total).toFixed(2)) : '0.00';

            renderAdminTable();
        }

        function renderAdminTable() {
            const tbody = document.getElementById('adminTableBody');
            const emptyState = document.getElementById('adminEmptyState');
            const searchQuery = document.getElementById('adminSearch').value.toLowerCase();
            const filterLevel = document.getElementById('adminFilterLevel').value;
            const filterStatus = document.getElementById('adminFilterStatus').value;

            const filtered = submittedRecords.filter(rec => {
                const isPassed = rec.finalAverage >= kkmThreshold;
                const matchSearch = rec.memberName.toLowerCase().includes(searchQuery) ||
                                    rec.memberExamNo.toLowerCase().includes(searchQuery) ||
                                    rec.examinerName.toLowerCase().includes(searchQuery);
                const matchLevel = !filterLevel || rec.memberLevel === filterLevel;
                const matchStatus = !filterStatus ||
                                    (filterStatus === 'LULUS' && isPassed) ||
                                    (filterStatus === 'TIDAK_LULUS' && !isPassed);
                return matchSearch && matchLevel && matchStatus;
            });

            tbody.innerHTML = '';

            if (filtered.length === 0) {
                emptyState.classList.remove('hidden');
                return;
            }
            emptyState.classList.add('hidden');

            filtered.forEach((rec, index) => {
                const isPassed = rec.finalAverage >= kkmThreshold;
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition';

                tr.innerHTML = `
                    <td class="py-3.5 px-4 font-semibold text-slate-500">${index + 1}</td>
                    <td class="py-3.5 px-4">
                        <div class="font-bold text-slate-900">${escapeHtml(rec.memberName)}</div>
                        <div class="text-xs text-slate-500">No. Ujian: ${escapeHtml(rec.memberExamNo)}</div>
                    </td>
                    <td class="py-3.5 px-4">
                        <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                            ${escapeHtml(rec.memberLevel)}
                        </span>
                    </td>
                    <td class="py-3.5 px-4">
                        <div class="font-medium text-slate-800">${escapeHtml(rec.examinerName)}</div>
                        <div class="text-xs text-slate-500">${escapeHtml(rec.examinerKolat)} &bull; ${escapeHtml(rec.examDate)}</div>
                    </td>
                    <td class="py-3.5 px-4 text-center font-semibold text-slate-700">
                        ${rec.activeCriteriaCount} / 13
                    </td>
                    <td class="py-3.5 px-4 text-center font-bold text-slate-800">
                        ${formatNumberID(rec.jumlahNilai)}
                    </td>
                    <td class="py-3.5 px-4 text-center">
                        <span class="text-base font-display font-extrabold ${isPassed ? 'text-emerald-600' : 'text-mp-red'}">
                            ${formatNumberID(rec.finalAverage)}
                        </span>
                    </td>
                    <td class="py-3.5 px-4 text-center">
                        ${isPassed 
                            ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"><i class="fa-solid fa-check"></i> LAYAK NAIK TINGKAT</span>'
                            : '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-mp-red"><i class="fa-solid fa-xmark"></i> BELUM LAYAK</span>'
                        }
                    </td>
                    <td class="py-3.5 px-4 text-right">
                        <div class="inline-flex items-center gap-1.5">
                            <button onclick="openBlangkoDetail('${rec.recordId}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition" title="Lihat & Cetak Blangko">
                                <i class="fa-solid fa-eye"></i> Blangko
                            </button>
                            <button onclick="directExportSinglePDF('${rec.recordId}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition" title="Download Langsung PDF Blangko">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                            <button onclick="deleteSingleRecord('${rec.recordId}')" title="Hapus Data" class="p-1.5 rounded-lg text-slate-400 hover:text-mp-red hover:bg-red-50 transition">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function deleteSingleRecord(recordId) {
            showConfirmModal(
                'Hapus Data Penilaian?',
                'Data penilaian anggota ini akan dihapus permanen dari rekapitulasi Admin.',
                () => {
                    submittedRecords = submittedRecords.filter(r => r.recordId !== recordId);
                    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(submittedRecords));
                    updateAdminBadge();
                    renderAdminDashboard();
                    showToast('Data berhasil dihapus.', 'info');
                }
            );
        }

        function openClearAdminConfirm() {
            if (submittedRecords.length === 0) return;
            showConfirmModal(
                'Hapus Semua Rekap Data?',
                'Seluruh data hasil ujian yang masuk ke Admin akan dihapus permanen.',
                () => {
                    submittedRecords = [];
                    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(submittedRecords));
                    updateAdminBadge();
                    renderAdminDashboard();
                    showToast('Seluruh data admin telah dibersihkan.', 'info');
                }
            );
        }

        // ==================== 10. MODAL DETAIL BLANGKO RESMI & EXPORT PDF ====================
        function populateBlangkoContent(rec) {
            currentModalRecord = rec;
            const isPassed = rec.finalAverage >= kkmThreshold;
            const metrics = calculateParticipantMetrics(rec.scores);

            document.getElementById('modalMemberName').textContent = rec.memberName;
            document.getElementById('modalMemberNo').textContent = rec.memberExamNo;
            document.getElementById('modalLevel').textContent = rec.memberLevel;
            document.getElementById('modalExaminerName').textContent = rec.examinerName;
            document.getElementById('modalKolat').textContent = rec.examinerKolat;
            document.getElementById('modalDate').textContent = rec.examDate;
            document.getElementById('modalSignExaminer').textContent = `( ${rec.examinerName} )`;

            const badge = document.getElementById('modalPrintBadge');
            if (isPassed) {
                badge.className = 'inline-block px-3 py-1 rounded border border-emerald-600 bg-emerald-50 text-emerald-700 font-bold uppercase';
                badge.textContent = 'LAYAK NAIK TINGKAT';
            } else {
                badge.className = 'inline-block px-3 py-1 rounded border border-red-600 bg-red-50 text-mp-red font-bold uppercase';
                badge.textContent = 'BELUM LAYAK';
            }

            const tbody = document.getElementById('modalTableBody');
            tbody.innerHTML = '';

            metrics.rowDetails.forEach(row => {
                const hasScore = row.rowTotal > 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="py-1.5 px-1.5 text-center">${row.no}</td>
                    <td class="py-1.5 px-2.5 font-medium">${row.criteria}</td>
                    <td class="py-1.5 px-1 text-center">${hasScore ? formatNumberID(row.a) : ''}</td>
                    <td class="py-1.5 px-1 text-center">${hasScore ? formatNumberID(row.b) : ''}</td>
                    <td class="py-1.5 px-1 text-center">${hasScore ? formatNumberID(row.c) : ''}</td>
                    <td class="py-1.5 px-1 text-center">${hasScore ? formatNumberID(row.d) : ''}</td>
                    <td class="py-1.5 px-1 text-center font-semibold">${hasScore ? formatNumberID(row.rowTotal) : '0'}</td>
                    <td class="py-1.5 px-1 text-center font-bold">${hasScore ? formatNumberID(row.rowAvg) : '0'}</td>
                `;
                tbody.appendChild(tr);
            });

            document.getElementById('modalActiveCount').textContent = metrics.activeCriteriaCount;
            document.getElementById('modalJumlahNilai').textContent = formatNumberID(metrics.jumlahNilai);
            document.getElementById('modalKkmVal').textContent = formatNumberID(kkmThreshold);
            document.getElementById('modalNilaiAkhir').textContent = formatNumberID(metrics.finalAverage);
        }

        function openBlangkoDetail(recordId) {
            const rec = submittedRecords.find(r => r.recordId === recordId);
            if (!rec) return;
            populateBlangkoContent(rec);
            document.getElementById('blangkoModal').classList.remove('hidden');
        }

        function closeBlangkoModal() {
            document.getElementById('blangkoModal').classList.add('hidden');
        }

        // Export PDF Blangko dari dalam Modal
        function downloadCurrentBlangkoPDF() {
            if (!currentModalRecord) return;
            const element = document.getElementById('printArea');
            const safeName = currentModalRecord.memberName.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `Blangko_UKT_MP_${safeName}_${currentModalRecord.examDate}.pdf`;

            showToast('Sedang menyiapkan file PDF blangko...', 'info');

            const opt = {
                margin: [8, 8, 8, 8],
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                showToast(`File ${filename} berhasil diunduh!`, 'success');
            });
        }

        // Export Langsung PDF Blangko dari Baris Tabel Admin
        function directExportSinglePDF(recordId) {
            const rec = submittedRecords.find(r => r.recordId === recordId);
            if (!rec) return;

            populateBlangkoContent(rec);
            const modal = document.getElementById('blangkoModal');
            modal.classList.remove('hidden');

            setTimeout(() => {
                downloadCurrentBlangkoPDF();
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 400);
            }, 150);
        }

        // Export Semua Blangko Peserta ke dalam 1 File PDF (1 Halaman per Anggota)
        function exportAllBlangkoToPDF() {
            if (submittedRecords.length === 0) {
                showToast('Belum ada data penilaian untuk di-export ke PDF.', 'warning');
                return;
            }

            showToast(`Membuat PDF untuk ${submittedRecords.length} blangko peserta...`, 'info');

            const batchContainer = document.getElementById('batchPdfContainer');
            batchContainer.innerHTML = '';

            submittedRecords.forEach((rec, index) => {
                const isPassed = rec.finalAverage >= kkmThreshold;
                const metrics = calculateParticipantMetrics(rec.scores);

                const rowsHtml = metrics.rowDetails.map(row => {
                    const hasScore = row.rowTotal > 0;
                    return `
                        <tr>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center;">${row.no}</td>
                            <td style="border:1px solid #1e293b; padding:5px 8px; font-weight:500;">${escapeHtml(row.criteria)}</td>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center;">${hasScore ? formatNumberID(row.a) : ''}</td>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center;">${hasScore ? formatNumberID(row.b) : ''}</td>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center;">${hasScore ? formatNumberID(row.c) : ''}</td>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center;">${hasScore ? formatNumberID(row.d) : ''}</td>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center; font-weight:600;">${hasScore ? formatNumberID(row.rowTotal) : '0'}</td>
                            <td style="border:1px solid #1e293b; padding:5px 4px; text-align:center; font-weight:700;">${hasScore ? formatNumberID(row.rowAvg) : '0'}</td>
                        </tr>
                    `;
                }).join('');

                const pageDiv = document.createElement('div');
                pageDiv.style.padding = '16px 20px';
                pageDiv.style.backgroundColor = '#ffffff';
                pageDiv.style.color = '#0f172a';
                pageDiv.style.fontFamily = 'Inter, sans-serif';
                if (index < submittedRecords.length - 1) {
                    pageDiv.style.pageBreakAfter = 'always';
                }

                pageDiv.innerHTML = `
                    <div style="border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:10px; font-weight:700; letter-spacing:1.5px; color:#DC2626; text-transform:uppercase;">PERGURUAN PENCAK SILAT BELADIRI TANGAN KOSONG</div>
                            <div style="font-size:20px; font-weight:800; color:#0f172a;">MERPATI PUTIH</div>
                            <div style="font-size:11px; color:#475569; font-weight:600;">BLANGKO PENILAIAN UJIAN KENAIKAN TINGKAT (UKT)</div>
                        </div>
                        <div>
                            <span style="display:inline-block; padding:5px 10px; border-radius:6px; border:1px solid ${isPassed ? '#059669' : '#DC2626'}; background:${isPassed ? '#ecfdf5' : '#fef2f2'}; color:${isPassed ? '#047857' : '#DC2626'}; font-size:11px; font-weight:700;">
                                ${isPassed ? 'LAYAK NAIK TINGKAT' : 'BELUM LAYAK'}
                            </span>
                        </div>
                    </div>

                    <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:14px; background:#f8fafc; border:1px solid #cbd5e1;">
                        <tr>
                            <td style="padding:5px 8px; color:#64748b; width:18%;">Nama Anggota:</td>
                            <td style="padding:5px 8px; font-weight:700; width:32%;">${escapeHtml(rec.memberName)}</td>
                            <td style="padding:5px 8px; color:#64748b; width:18%;">Nama Penguji:</td>
                            <td style="padding:5px 8px; font-weight:700; width:32%;">${escapeHtml(rec.examinerName)}</td>
                        </tr>
                        <tr>
                            <td style="padding:5px 8px; color:#64748b;">No. Ujian / NIA:</td>
                            <td style="padding:5px 8px; font-weight:700;">${escapeHtml(rec.memberExamNo)}</td>
                            <td style="padding:5px 8px; color:#64748b;">Kolat / Cabang:</td>
                            <td style="padding:5px 8px; font-weight:700;">${escapeHtml(rec.examinerKolat)}</td>
                        </tr>
                        <tr>
                            <td style="padding:5px 8px; color:#64748b;">Tingkatan:</td>
                            <td style="padding:5px 8px; font-weight:700;">${escapeHtml(rec.memberLevel)}</td>
                            <td style="padding:5px 8px; color:#64748b;">Tanggal Ujian:</td>
                            <td style="padding:5px 8px; font-weight:700;">${escapeHtml(rec.examDate)}</td>
                        </tr>
                    </table>

                    <table style="width:100%; border-collapse:collapse; font-size:11px;">
                        <thead>
                            <tr style="background:#f1f5f9; font-weight:700;">
                                <th rowspan="2" style="border:1px solid #1e293b; padding:6px 4px; text-align:center; width:30px;">NO</th>
                                <th rowspan="2" style="border:1px solid #1e293b; padding:6px 8px; text-align:left;">KRITERIA PENILAIAN</th>
                                <th colspan="6" style="border:1px solid #1e293b; padding:5px; text-align:center;">KEMAMPUAN PENGUASAAN MATERI</th>
                            </tr>
                            <tr style="background:#f1f5f9; font-weight:700; font-size:9px;">
                                <th style="border:1px solid #1e293b; padding:5px 3px; text-align:center; width:72px;">PENGUASAAN<br>UNSUR GERAK</th>
                                <th style="border:1px solid #1e293b; padding:5px 3px; text-align:center; width:56px;">STAMINA</th>
                                <th style="border:1px solid #1e293b; padding:5px 3px; text-align:center; width:72px;">KOORDINASI &<br>IRAMA GERAK</th>
                                <th style="border:1px solid #1e293b; padding:5px 3px; text-align:center; width:72px;">KEMANTAPAN<br>GERAK</th>
                                <th style="border:1px solid #1e293b; padding:5px 3px; text-align:center; width:54px;">NILAI</th>
                                <th style="border:1px solid #1e293b; padding:5px 3px; text-align:center; width:68px;">NILAI<br>RATA - RATA</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                        <tfoot style="font-weight:700; background:#f8fafc;">
                            <tr>
                                <td colspan="2" style="border:1px solid #1e293b; padding:6px 8px;">JUMLAH NILAI</td>
                                <td colspan="5" style="border:1px solid #1e293b; padding:6px 8px; text-align:right; font-weight:400; font-size:10px; color:#475569;">
                                    Total rata-rata dari ${metrics.activeCriteriaCount} kriteria diujikan
                                </td>
                                <td style="border:1px solid #1e293b; padding:6px 4px; text-align:center; font-size:12px;">${formatNumberID(metrics.jumlahNilai)}</td>
                            </tr>
                            <tr>
                                <td colspan="2" style="border:1px solid #1e293b; padding:6px 8px;">NILAI RATA - RATA</td>
                                <td colspan="5" style="border:1px solid #1e293b; padding:6px 8px; text-align:right; font-weight:400; font-size:10px; color:#475569;">
                                    Standar Kelulusan (KKM): ${formatNumberID(kkmThreshold)}
                                </td>
                                <td style="border:1px solid #1e293b; padding:6px 4px; text-align:center; font-size:13px; font-weight:800;">${formatNumberID(metrics.finalAverage)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div style="margin-top:24px; display:flex; justify-content:space-between; text-align:center; font-size:11px;">
                        <div style="width:45%;">
                            <div style="color:#475569;">Mengetahui,</div>
                            <div style="font-weight:700;">Dewan Penguji / Ketua Cabang</div>
                            <div style="height:48px;"></div>
                            <div style="font-weight:600; text-decoration:underline;">( ........................................ )</div>
                        </div>
                        <div style="width:45%;">
                            <div style="color:#475569;">Penguji Lapangan,</div>
                            <div style="font-weight:700;">Pelatih / Penguji UKT</div>
                            <div style="height:48px;"></div>
                            <div style="font-weight:700; text-decoration:underline;">( ${escapeHtml(rec.examinerName)} )</div>
                        </div>
                    </div>
                `;
                batchContainer.appendChild(pageDiv);
            });

            batchContainer.classList.remove('hidden');

            const opt = {
                margin: [6, 6, 6, 6],
                filename: `Semua_Blangko_UKT_Merpati_Putih_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(batchContainer).save().then(() => {
                batchContainer.classList.add('hidden');
                batchContainer.innerHTML = '';
                showToast('Semua blangko PDF berhasil diunduh!', 'success');
            });
        }

        // ==================== 11. EXPORT CSV / EXCEL ====================
        function exportToCSV() {
            if (submittedRecords.length === 0) {
                showToast('Belum ada data untuk di-export.', 'warning');
                return;
            }

            const headers = [
                'No',
                'Nama Anggota',
                'No Ujian',
                'Tingkatan',
                'Nama Penguji',
                'Kolat/Cabang',
                'Tanggal Ujian',
                'Materi Diujikan',
                'Jumlah Nilai',
                'Nilai Rata-Rata Akhir',
                'Standar KKM',
                'Status Kelayakan'
            ];

            const rows = submittedRecords.map((rec, idx) => {
                const isPassed = rec.finalAverage >= kkmThreshold;
                return [
                    idx + 1,
                    `"${rec.memberName.replace(/"/g, '""')}"`,
                    `"${rec.memberExamNo.replace(/"/g, '""')}"`,
                    `"${rec.memberLevel}"`,
                    `"${rec.examinerName.replace(/"/g, '""')}"`,
                    `"${rec.examinerKolat.replace(/"/g, '""')}"`,
                    rec.examDate,
                    rec.activeCriteriaCount,
                    rec.jumlahNilai,
                    rec.finalAverage,
                    kkmThreshold,
                    isPassed ? 'LAYAK NAIK TINGKAT' : 'BELUM LAYAK'
                ].join(',');
            });

            const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Rekap_UKT_Merpati_Putih_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('File CSV rekapitulasi berhasil diunduh!', 'success');
        }

        // ==================== 12. UTILITIES (TOAST & CONFIRM MODAL) ====================
        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            
            const styles = {
                success: 'bg-slate-900 text-white border-l-4 border-emerald-500',
                error: 'bg-slate-900 text-white border-l-4 border-mp-red',
                warning: 'bg-slate-900 text-white border-l-4 border-amber-500',
                info: 'bg-slate-900 text-white border-l-4 border-sky-500'
            };

            const icons = {
                success: '<i class="fa-solid fa-circle-check text-emerald-400"></i>',
                error: '<i class="fa-solid fa-circle-exclamation text-mp-red"></i>',
                warning: '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>',
                info: '<i class="fa-solid fa-circle-info text-sky-400"></i>'
            };

            toast.className = `${styles[type] || styles.info} px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs sm:text-sm font-medium pointer-events-auto transform transition-all duration-300 translate-x-0`;
            toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-x-4');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        function showConfirmModal(title, message, onConfirm) {
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            pendingConfirmCallback = onConfirm;
            document.getElementById('confirmModal').classList.remove('hidden');
        }

        function closeConfirmModal() {
            document.getElementById('confirmModal').classList.add('hidden');
            pendingConfirmCallback = null;
        }

        document.getElementById('confirmActionBtn').onclick = () => {
            if (typeof pendingConfirmCallback === 'function') {
                pendingConfirmCallback();
            }
            closeConfirmModal();
        };

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // Jalankan aplikasi saat halaman dimuat
        window.addEventListener('DOMContentLoaded', initApp);
