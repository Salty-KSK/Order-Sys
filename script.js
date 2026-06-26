// 自動で入力されるかテストするためのマッピング設定
// ※今後セルがズレていた場合は、ここにあるアルファベット（B8など）を直すだけで一瞬で修正できます！
const CELL_CONFIG = {
    issueDate: 'J4',        // 発行日
    zipCode: 'B8',          // 郵便番号
    address: 'B9',          // 住所
    companyName: 'B11',     // 宛名
    orderNumber: 'J8',      // 注文書番号 (JK8の結合セルであるため、左上のJ8を指定)
    quoteNumber: 'C16',     // 見積書番号 (16行目へ修正)
    quoteDate: 'E16',       // 見積書日付 (16行目へ修正)

    // 行削除に合わせて-2行シフトしました
    projectName: 'E23',     // 工事名 (23行目へ修正)
    projectLocation: 'E25', // 工事場所
    // === 金額の設定 ===
    projectPriceBase: 'E27',  // 税抜価格
    projectPriceTax: 'G27',   // 消費税
    projectPriceTotal: 'I27', // 契約額
    // === 工期の設定 ===
    projectStart: 'E29',      // 着工日
    projectEnd: 'G29',        // 完工日
    // =================
    orderContent: 'E31'       // 発注内容
};

// 【便利機能】日付を「YYYY年M月D日」のフォーマットに変換する関数
function formatDateJP(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyIs0GDxRHv2GhNptnPyyX5glAaF8wF5blJmAtWjKyXXMEFKp-FzuhGX3lCv6XOuXTI/exec';

// === 予算管理システム連携 (Supabase) ===
const SUPABASE_URL = 'https://wwymcmsyixfgmteyashe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3eW1jbXN5aXhmZ210ZXlhc2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDY0MzEsImV4cCI6MjA5NTkyMjQzMX0.0nb2-kyRF-b9bZE-PlxWQ5AGA86BkFkB-uFyrXBxYRc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
    // === 発注内容データマージ ===
    const defaultOrderContents = ['配管工事一式', '加工管製作', '機器設置工事', '撤去工事一式', '保守点検業務', '保温工事'];
    const savedOrderContents = JSON.parse(localStorage.getItem('savedOrderContents') || '[]');
    let allOrderContents = [...new Set([...defaultOrderContents, ...savedOrderContents])];

    // === 予算管理プロジェクト一覧取得 ===
    const linkedProjectSelect = document.getElementById('linked-project');
    const orderRequestGroup = document.getElementById('order-request-group');
    const orderRequestSelect = document.getElementById('linked-order-request');
    let currentOrderRequests = []; // 選択中プロジェクトの発注申請一覧

    try {
        const { data: projects } = await supabaseClient.from('projects').select('id, site_name, address').order('created_at', { ascending: false });
        if (projects && projects.length > 0) {
            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.site_name;
                opt.dataset.address = p.address || '';
                opt.dataset.siteName = p.site_name || '';
                linkedProjectSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('予算管理プロジェクトの取得に失敗:', e);
    }

    // プロジェクト選択時: 工事名・工事場所を自動入力 + 発注申請一覧を取得
    linkedProjectSelect.addEventListener('change', async function() {
        const projectId = this.value;
        // セレクトをリセット
        orderRequestSelect.innerHTML = '<option value="">-- 選択してください --</option>';
        currentOrderRequests = [];

        if (!projectId) {
            orderRequestGroup.style.display = 'none';
            return;
        }

        // 工事名・工事場所を自動入力
        const selectedOption = this.options[this.selectedIndex];
        const projectNameEl = document.getElementById('project-name');
        const projectLocationEl = document.getElementById('project-location');
        if (projectNameEl && selectedOption.dataset.siteName) {
            projectNameEl.value = selectedOption.dataset.siteName;
        }
        if (projectLocationEl && selectedOption.dataset.address) {
            projectLocationEl.value = selectedOption.dataset.address;
        }

        try {
            // budget_items と order_requests を取得
            const [budgetRes, orderRes] = await Promise.all([
                supabaseClient.from('budget_items').select('id, name, category').eq('project_id', projectId),
                supabaseClient.from('order_requests').select('*').eq('project_id', projectId).eq('status', 'draft').order('request_number', { ascending: true }),
            ]);

            const budgetItems = budgetRes.data || [];
            const orderReqs = orderRes.data || [];
            currentOrderRequests = orderReqs;

            if (orderReqs.length > 0) {
                orderReqs.forEach(req => {
                    const budget = budgetItems.find(b => b.id === req.budget_item_id);
                    const opt = document.createElement('option');
                    opt.value = req.id;
                    const label = `${req.request_number} — ${req.company_name || '(未設定)'} ¥${Number(req.amount).toLocaleString()} [${budget ? budget.name : ''}]`;
                    opt.textContent = label;
                    orderRequestSelect.appendChild(opt);
                });
                orderRequestGroup.style.display = 'block';
            } else {
                orderRequestGroup.style.display = 'none';
            }
        } catch (e) {
            console.warn('発注申請データの取得に失敗:', e);
            orderRequestGroup.style.display = 'none';
        }
    });

    // 発注申請選択時: フォームに自動入力
    orderRequestSelect.addEventListener('change', function() {
        const selectedId = this.value;
        if (!selectedId) return;

        const req = currentOrderRequests.find(r => r.id === selectedId);
        if (!req) return;

        // 科目を設定
        const categoryMap = { A: 'materials', C: 'construction', D: 'expenses', E: 'temporary' };
        const category = categoryMap[req.category_code] || 'construction';
        const budgetCatEl = document.getElementById('budget-category');
        if (budgetCatEl) budgetCatEl.value = category;

        // 宛名（会社名）を設定
        const companyNameEl = document.getElementById('company-name');
        if (companyNameEl && req.company_name) companyNameEl.value = req.company_name;

        // 発注内容を設定
        const orderContentEl = document.getElementById('order-content');
        if (orderContentEl && req.description) orderContentEl.value = req.description;

        // 工事代金を設定
        const projectPriceEl = document.getElementById('project-price');
        if (projectPriceEl && req.amount) {
            projectPriceEl.value = Number(req.amount).toLocaleString();
            projectPriceEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // オートコンプリートUI管理関数
    function renderCustomDropdown(inputEl, dropdownEl, dataArray, onSelectCallback) {
        function renderList() {
            dropdownEl.innerHTML = '';
            const query = inputEl.value.trim().toLowerCase();
            const filtered = dataArray.filter(item => {
                const text = typeof item === 'object' ? item.dropdownText : item;
                return text.toLowerCase().includes(query);
            });

            if (filtered.length === 0) {
                dropdownEl.style.display = 'none';
                return;
            }

            filtered.forEach(item => {
                const li = document.createElement('li');
                li.textContent = typeof item === 'object' ? item.dropdownText : item;
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    inputEl.value = typeof item === 'object' ? item.value : item;
                    dropdownEl.style.display = 'none';
                    if (onSelectCallback) onSelectCallback(item);
                });
                dropdownEl.appendChild(li);
            });
            dropdownEl.style.display = 'block';
        }

        inputEl.addEventListener('focus', renderList);
        inputEl.addEventListener('input', renderList);
        document.addEventListener('click', (e) => {
            if (e.target !== inputEl && e.target !== dropdownEl) {
                dropdownEl.style.display = 'none';
            }
        });
    }

    const orderContentEl = document.getElementById('order-content');
    const orderDropdownEl = document.getElementById('custom-order-list');
    renderCustomDropdown(orderContentEl, orderDropdownEl, allOrderContents, null);

    const generateBtn = document.getElementById('btn-generate-number');
    const termInput = document.getElementById('company-term');
    const codeInput = document.getElementById('client-code');
    const orderNumberInput = document.getElementById('order-number');
    const issueDateInput = document.getElementById('issue-date');
    const form = document.getElementById('purchase-order-form');
    const submitBtn = form.querySelector('.submit-btn');

    const vendorSelect = document.getElementById('company-name');
    const zipCodeInput = document.getElementById('zip-code');
    const addressInput = document.getElementById('address');

    // 金額プレビュー用
    const priceInput = document.getElementById('project-price');
    const pricePreview = document.getElementById('price-preview');
    const taxPreview = document.getElementById('tax-preview');
    const totalPreview = document.getElementById('total-preview');

    let isPriceComposing = false;

    priceInput.addEventListener('compositionstart', () => {
        isPriceComposing = true;
    });

    priceInput.addEventListener('compositionend', (e) => {
        isPriceComposing = false;
        formatPriceInput(e);
    });

    priceInput.addEventListener('input', (e) => {
        if (isPriceComposing) return; // IME入力中（全角などの未確定状態）は処理をスキップし文字を残す
        formatPriceInput(e);
    });

    function formatPriceInput(e) {
        // 全角数字を半角数字に変換（Unicodeシフト）
        let value = e.target.value.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

        // カンマと数字以外の不要な文字列を削除
        let rawStr = value.replace(/,/g, '').replace(/[^0-9]/g, '');

        if (rawStr !== '') {
            // カンマ区切りフォーマットを適用
            e.target.value = parseInt(rawStr, 10).toLocaleString();
        } else {
            e.target.value = '';
        }

        const val = parseInt(rawStr, 10);
        if (!isNaN(val) && val > 0) {
            pricePreview.style.display = 'block';
            const tax = Math.floor(val * 0.1);
            const total = val + tax;
            taxPreview.textContent = `¥ ${tax.toLocaleString()}`;
            totalPreview.textContent = `¥ ${total.toLocaleString()}`;
        } else {
            pricePreview.style.display = 'none';
        }
    }

    // 発行日の初期値を本日に設定
    const today = new Date().toISOString().split('T')[0];
    issueDateInput.value = today;

    const savedTerm = localStorage.getItem('companyTerm');
    if (savedTerm) {
        termInput.value = savedTerm;
    }

    let currentSequenceData = null;
    let vendorList = [];

    // === Supabase 業者マスター取得 ===
    let supabaseVendors = [];
    try {
        const { data: sv } = await supabaseClient.from('vendors').select('id, name, kana, industry, postal_code, address, tel').order('kana', { ascending: true });
        if (sv && sv.length > 0) {
            supabaseVendors = sv.map(v => ({
                name: v.name,
                kana: v.kana || '',
                code: '',
                zip: v.postal_code || '',
                address: v.address || '',
                tel: v.tel || '',
                source: 'supabase'
            }));
        }
    } catch (e) {
        console.warn('Supabase業者マスター取得エラー:', e);
    }

    // マスター取得（GAS）
    try {
        if (!GAS_WEBAPP_URL.includes('ここに')) {
            const vendorUrl = `${GAS_WEBAPP_URL}?mode=get_vendors`;
            const vRes = await fetch(vendorUrl);
            if (vRes.ok) {
                const vData = await vRes.json();
                if (vData.vendors && vData.vendors.length > 0) {
                    vendorList = vData.vendors;
                }
            }
        }
    } catch (e) {
        console.error("GAS Vendor fetch failed:", e);
    }

    // GAS候補とSupabase候補をマージ（重複は名前で排除）
    const gasNames = new Set(vendorList.map(v => v.name));
    supabaseVendors.forEach(sv => {
        if (!gasNames.has(sv.name)) {
            vendorList.push(sv);
        }
    });

    // あいうえお順にソート（kana優先、なければnameでフォールバック）
    vendorList.sort((a, b) => {
        const kanaA = a.kana || a.name || '';
        const kanaB = b.kana || b.name || '';
        return kanaA.localeCompare(kanaB, 'ja');
    });

    // ドロップダウンに表示
    if (vendorList.length > 0) {
        vendorSelect.placeholder = '業者を選択または手入力';
        codeInput.placeholder = '記号を選択または入力';

        const vendorDropdown = document.getElementById('custom-vendor-list');
        const codeDatalist = document.getElementById('code-list');

        if (codeDatalist) {
            codeDatalist.innerHTML = '';
            const uniqueCodes = [...new Set(vendorList.map(v => v.code).filter(c => c))];
            if (!uniqueCodes.includes('A')) uniqueCodes.push('A');
            if (!uniqueCodes.includes('T')) uniqueCodes.push('T');

            uniqueCodes.sort().forEach(code => {
                const opt = document.createElement('option');
                opt.value = code;
                codeDatalist.appendChild(opt);
            });
        }

        const vendorDropdownData = vendorList.map(v => ({
            dropdownText: v.name,
            value: v.name,
            raw: v
        }));

        renderCustomDropdown(vendorSelect, vendorDropdown, vendorDropdownData, (selectedItem) => {
            const vendor = selectedItem.raw;
            codeInput.value = vendor.code || '';
            zipCodeInput.value = vendor.zip || '';
            addressInput.value = vendor.address || '';
        });
    } else {
        vendorSelect.placeholder = '(業者データがありません)';
        codeInput.placeholder = '(データなし)';
    }

    // === Phase 13: SPA Tabs & History Logic ===
    const tabCreate = document.getElementById('tab-create');
    const tabHistory = document.getElementById('tab-history');
    const formView = document.getElementById('form-view');
    const historyView = document.getElementById('history-view');
    const historyTableWrapper = document.getElementById('history-table-wrapper');
    const historyTbody = document.getElementById('history-tbody');
    const historyLoading = document.getElementById('history-loading');
    const tabsContainer = document.querySelector('.tabs');
    let historyLoaded = false;

    tabCreate.addEventListener('click', () => {
        tabCreate.classList.add('active');
        tabHistory.classList.remove('active');
        formView.style.display = 'block';
        historyView.style.display = 'none';
        tabsContainer.classList.remove('wide');
    });

    tabHistory.addEventListener('click', () => {
        tabHistory.classList.add('active');
        tabCreate.classList.remove('active');
        formView.style.display = 'none';
        historyView.style.display = 'block';
        tabsContainer.classList.add('wide');

        if (!historyLoaded) {
            loadHistory(currentFilter);
        }
    });

    const filterBtns = document.querySelectorAll('.filter-btn');
    let currentFilter = 'ALL';

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.comp;
            loadHistory(currentFilter);
        });
    });

    async function loadHistory(compFilter = 'ALL') {
        historyLoading.style.display = 'block';
        historyTableWrapper.style.display = 'none';
        historyTbody.innerHTML = '';

        try {
            const res = await fetch(`${GAS_WEBAPP_URL}?mode=get_history&comp=${compFilter}`);
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();

            if (data.history && data.history.length > 0) {
                data.history.forEach(row => {
                    const tr = document.createElement('tr');

                    let linksHTML = '';
                    if (row.pdfUrl) linksHTML += `<a href="${row.pdfUrl}" target="_blank" class="link-btn">PDFを閲覧</a> `;
                    if (row.ssUrl) linksHTML += `<a href="${row.ssUrl}" target="_blank" class="link-btn" style="color: #888888; border-color: #e5e5e5; margin-left:8px;">台帳を開く</a>`;

                    const dateFormatted = (row.date || '-').replace(' ', '<br>');

                    // 発注番号の短縮処理の修正：期数（例：35）を残し、「第」と「号」とスペースだけを消す
                    // "第 35T-001号" -> "35T-001"
                    const shortOrderNumber = row.orderNumber ? row.orderNumber.replace(/第|号/g, '').replace(/\s+/g, '') : '-';

                    tr.innerHTML = `
                        <td style="white-space: normal; line-height: 1.5;">${dateFormatted}</td>
                        <td style="color:#888; font-weight:600;">${shortOrderNumber}</td>
                        <td style="font-weight: 500;">${row.companyName || '-'}</td>
                        <td>${row.projectName || '-'}</td>
                        <td style="text-align:right;">${row.price ? '¥ ' + parseInt(row.price).toLocaleString() : '-'}</td>
                        <td>${linksHTML}</td>
                    `;
                    historyTbody.appendChild(tr);
                });
            } else {
                historyTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color:#888;">履歴データがありません。注文書を発行するとここに表示されます。</td></tr>';
            }
            historyLoaded = true;
        } catch (e) {
            console.error(e);
            historyTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color: red;">履歴の取得に失敗しました。</td></tr>';
        } finally {
            historyLoading.style.display = 'none';
            historyTableWrapper.style.display = 'block';
        }
    }

    termInput.addEventListener('change', () => {
        localStorage.setItem('companyTerm', termInput.value.trim());
    });

    // 採番ボタン
    generateBtn.addEventListener('click', async () => {
        if (GAS_WEBAPP_URL.includes('ここに')) {
            alert('現在、裏側のシステム更新待機中です。URLがセットされるまでお待ちください。');
            return;
        }

        const term = termInput.value.trim();
        const code = codeInput.value.trim();

        if (!term || !code) {
            alert('採番には「期」と「発注元会社記号」が必要です。');
            termInput.focus();
            return;
        }
        localStorage.setItem('companyTerm', term);

        generateBtn.textContent = '通信中...';
        generateBtn.disabled = true;

        try {
            const url = `${GAS_WEBAPP_URL}?mode=generate_number&term=${encodeURIComponent(term)}&comp=${encodeURIComponent(code)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            orderNumberInput.value = data.orderNumber;
            currentSequenceData = data;

            generateBtn.textContent = '完了 ✓';
            generateBtn.style.backgroundColor = '#1e8e3e';
            generateBtn.style.color = '#ffffff';
            generateBtn.style.borderColor = '#1e8e3e';

            setTimeout(() => {
                generateBtn.textContent = '自動採番する';
                generateBtn.style.backgroundColor = '';
                generateBtn.disabled = false;
            }, 3000);
        } catch (error) {
            console.error('Fetch error:', error);
            alert('エラー: ' + error.message);
            generateBtn.textContent = '自動採番する';
            generateBtn.disabled = false;
        }
    });

    // 保存・発行ボタン
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!orderNumberInput.value || !currentSequenceData) {
            alert('保存前に「自動採番する」ボタンを押してください。');
            generateBtn.focus();
            return;
        }

        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = '注文書ファイル自動生成中（約10秒かかります）...';
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);

            // 日付を「年月日」に変換
            const issueDateJP = formatDateJP(formData.get('issue-date'));
            const quoteDateJP = formatDateJP(formData.get('quote-date'));
            const startDateJP = formatDateJP(formData.get('project-start'));
            const endDateJP = formatDateJP(formData.get('project-end'));

            // 郵便番号に 〒 を付与
            let zipVal = formData.get('zip-code') || '';
            if (zipVal && !zipVal.startsWith('〒')) zipVal = '〒' + zipVal;

            // 動的セルマッピング（設定値から取得）
            const updates = [];
            updates.push({ cell: CELL_CONFIG.issueDate, value: issueDateJP });
            updates.push({ cell: CELL_CONFIG.zipCode, value: zipVal });
            updates.push({ cell: CELL_CONFIG.address, value: formData.get('address') });
            updates.push({ cell: CELL_CONFIG.companyName, value: formData.get('company-name') }); // 御中を削除

            // 注文番号（画面上の入力欄から確実に取得）
            const finalOrderNum = document.getElementById('order-number').value || (currentSequenceData ? currentSequenceData.orderNumber : '');
            updates.push({ cell: CELL_CONFIG.orderNumber, value: finalOrderNum });

            // 見積書番号と日付を「別々のマス」に分割して書き込む
            let quoteNumText = '';
            if (formData.get('quote-number')) quoteNumText = `No.${formData.get('quote-number')}`;

            // 文字数に応じてフォントサイズをより強力に自動調整
            let quoteFontSize = 10;
            let len = quoteNumText.length;
            if (len > 18) {
                quoteFontSize = 5;
            } else if (len > 14) {
                quoteFontSize = 6;
            } else if (len > 11) {
                quoteFontSize = 7;
            } else if (len > 8) {
                quoteFontSize = 8;
            }

            updates.push({ cell: CELL_CONFIG.quoteNumber, value: quoteNumText, fontSize: quoteFontSize });

            let quoteDateText = '';
            if (quoteDateJP) quoteDateText = `（${quoteDateJP}）`; // 日付の前後に括弧
            updates.push({ cell: CELL_CONFIG.quoteDate, value: quoteDateText });

            updates.push({ cell: CELL_CONFIG.projectName, value: formData.get('project-name') });
            updates.push({ cell: CELL_CONFIG.projectLocation, value: formData.get('project-location') });

            // 金額の自動計算と分割・補足文字
            const rawPriceText = formData.get('project-price') || '';
            const rawPrice = parseInt(rawPriceText.replace(/,/g, ''), 10);
            if (!isNaN(rawPrice)) {
                const tax = Math.floor(rawPrice * 0.1); // 消費税 10%
                const total = rawPrice + tax;           // 契約額
                updates.push({ cell: CELL_CONFIG.projectPriceBase, value: `${rawPrice.toLocaleString()}（税抜金額）` });
                updates.push({ cell: CELL_CONFIG.projectPriceTax, value: `${tax.toLocaleString()}（消費税額）` });
                updates.push({ cell: CELL_CONFIG.projectPriceTotal, value: `${total.toLocaleString()}（契約金額）` });
            }

            // 工期（着工日と完工日を別々のセルへ）
            updates.push({ cell: CELL_CONFIG.projectStart, value: startDateJP });
            updates.push({ cell: CELL_CONFIG.projectEnd, value: endDateJP });
            updates.push({ cell: CELL_CONFIG.orderContent, value: formData.get('order-content') });

            const payload = {
                mode: 'create_order',
                sequenceData: currentSequenceData,
                companyName: formData.get('company-name').trim(),
                projectName: formData.get('project-name').trim(),
                projectPrice: isNaN(rawPrice) ? 0 : rawPrice,
                orderContent: formData.get('order-content').trim(),
                zipCode: zipVal,
                address: formData.get('address').trim(),
                cellUpdates: updates // ここで構成情報をGASに送信
            };

            // === 手入力された「発注内容」の自動学習（LocalStorageに保存） ===
            const finalOrderContent = payload.orderContent;
            if (finalOrderContent) {
                let saved = JSON.parse(localStorage.getItem('savedOrderContents') || '[]');
                if (!saved.includes(finalOrderContent)) {
                    saved.push(finalOrderContent);
                    localStorage.setItem('savedOrderContents', JSON.stringify(saved));
                }
            }

            const response = await fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            alert('🎉 新しい注文書の実体ファイル（スプレッドシートおよびPDF）を作成しました！（ドライブをご確認ください）');

            // === 予算管理システム連携: linked_orders に保存 ===
            const linkedProjectId = document.getElementById('linked-project').value;
            const budgetCategory = document.getElementById('budget-category').value;
            if (linkedProjectId) {
                try {
                    await supabaseClient.from('linked_orders').insert({
                        project_id: linkedProjectId,
                        order_number: finalOrderNum,
                        category: budgetCategory,
                        budget_item_name: formData.get('order-content').trim(),
                        company_name: formData.get('company-name').trim(),
                        amount: isNaN(rawPrice) ? 0 : rawPrice,
                        order_date: formData.get('issue-date')
                    });
                    console.log('予算管理連携: linked_orders に保存成功');
                } catch (e) {
                    console.warn('予算管理連携エラー:', e);
                }

                // === 発注申請のステータスを「注文書発行済」に更新 ===
                const selectedOrderRequestId = document.getElementById('linked-order-request').value;
                if (selectedOrderRequestId) {
                    try {
                        await supabaseClient.from('order_requests').update({
                            status: 'ordered',
                            gas_order_number: finalOrderNum,
                            order_date: formData.get('issue-date'),
                            updated_at: new Date().toISOString()
                        }).eq('id', selectedOrderRequestId);
                        console.log('予算管理連携: 発注申請ステータスを更新');
                    } catch (e) {
                        console.warn('発注申請ステータス更新エラー:', e);
                    }
                }
            }

            // 履歴データを古くして次回タブ切り替え時に再読み込みさせる
            historyLoaded = false;

            currentSequenceData = null;
            orderNumberInput.value = '';

        } catch (error) {
            console.error('Save error:', error);
            alert('発行処理中にエラー。');
        } finally {
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    });
});
