// ============================================
//  Gorilla Tag Depot Archive — Application Logic
// ============================================

const state = {
    currentPlatform: 'steam', 
    currentYear: 0,
    searchTerm: '',
    branchFilter: 'all', 
    isLoading: false,
    data: {
        'steam': window.steamData || [],
        'oculus-pc': window.oculusPcData || [],
        'oculus-quest': window.oculusQuestData || []
    }
};

const APIS = {
    'oculus-pc': '3262063300561328',
    'oculus-quest': '4979055762136823'
};

const QUEST_GUIDE_URL = "https://oculusdb.rui2015.me/guide/quest/qavs";

const formatUnixDate = (ts) => {
    const date = new Date(ts * 1000);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

const getActiveData = () => state.data[state.currentPlatform] || [];

const getYearsForPlatform = () => {
    const years = [...new Set(getActiveData().map(u => u.year))];
    return years.sort((a, b) => b - a);
};

// --- OculusDB Live Connection ---
async function ensureDataFetched(platform) {
    if (platform === 'steam' || state.data[platform].length > 10) {
        const availableYears = getYearsForPlatform();
        if (availableYears.length > 0 && !availableYears.includes(state.currentYear)) {
            state.currentYear = availableYears[0];
        }
        return;
    }

    state.isLoading = true;
    render(); 

    try {
        const response = await fetch(`https://oculusdb.rui2015.me/api/v1/connected/${APIS[platform]}`);
        if (!response.ok) throw new Error("API Connection Failed");
        
        const json = await response.json();
        
        // Parse raw OculusDB structures to standardized frontend layout items
        state.data[platform] = json.versions
            .filter(v => v.downloadable)
            .map(v => {
                const dt = new Date(v.created_date * 1000);
                return {
                    year: dt.getUTCFullYear(),
                    name: v.version.startsWith('v') ? v.version : `v${v.version}`,
                    date: formatUnixDate(v.created_date),
                    desc: `Build Code: ${v.versionCode}`,
                    id: v.id, 
                    branch: v.binary_release_channels?.nodes?.some(n => n.channel_name === 'LIVE') ? 'public' : 'beta',
                    code: v.versionCode 
                };
            })
            .sort((a, b) => b.code - a.code);

    } catch (err) {
        console.warn("Failed live API fetch, falling back to cached system database.");
    } finally {
        state.isLoading = false;
        const availableYears = getYearsForPlatform();
        if (availableYears.length > 0) {
            state.currentYear = availableYears[0];
        }
        render();
    }
}

// --- Platform & Year Controller Actions ---
window.setPlatform = async function(platform) {
    state.currentPlatform = platform;
    state.currentYear = 0; 
    state.branchFilter = 'all';
    updatePlatformUI();
    await ensureDataFetched(platform);
    render();
};

window.setYear = function(year) {
    state.currentYear = year;
    render();
};

window.toggleBranch = function() {
    const filters = { all: 'public', public: 'beta', beta: 'all' };
    state.branchFilter = filters[state.branchFilter] || 'all';
    render();
};

window.handleCopyAction = async function(versionId, btnElement) {
    let commandText = "";
    if (state.currentPlatform === 'steam') {
        commandText = `download_depot 1533390 1533391 ${versionId}`;
    } else if (state.currentPlatform === 'oculus-pc') {
        commandText = `"Oculus Downgrader.exe" -nU d --appid 3262063300561328 --versionid ${versionId} --headset rift`;
    }

    try {
        await navigator.clipboard.writeText(commandText);
        showToast("Command copied!");
        if (btnElement) {
            const label = btnElement.querySelector('.copy-label');
            const origText = label.textContent;
            btnElement.classList.add('bg-emerald-600/30', 'border-emerald-500');
            if(label) label.textContent = 'Copied!';
            setTimeout(() => {
                btnElement.classList.remove('bg-emerald-600/30', 'border-emerald-500');
                if(label) label.textContent = origText;
            }, 1500);
        }
    } catch (err) {
        alert("Copy failed. Manually capture:\n\n" + commandText);
    }
};

window.scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// --- Render Controllers ---
function render() {
    renderYearTabs();
    renderList();
    updateBranchButtonUI();
    calculateStats();
}

function updatePlatformUI() {
    ['steam', 'oculus-pc', 'oculus-quest'].forEach(p => {
        const btn = document.getElementById(`platform-${p}`);
        if (!btn) return;
        const isActive = p === state.currentPlatform;
        if (isActive) {
            btn.classList.add('platform-btn-active');
        } else {
            btn.classList.remove('platform-btn-active');
        }
    });
}

function updateBranchButtonUI() {
    const el = document.getElementById('branch-btn-text');
    const btn = document.getElementById('branch-btn');
    if (!el || !btn) return;
    const labels = { all: 'All Branches', public: 'Public only', beta: 'Beta/Patches' };
    el.textContent = labels[state.branchFilter];
    
    if (state.branchFilter !== 'all') {
        btn.classList.add('bg-emerald-600/20', 'text-emerald-400', 'border-emerald-500/40');
    } else {
        btn.classList.remove('bg-emerald-600/20', 'text-emerald-400', 'border-emerald-500/40');
    }
}

function renderYearTabs() {
    const container = document.getElementById('year-tabs-container');
    const years = getYearsForPlatform();
    if (state.isLoading) {
        container.innerHTML = `<div class="h-10 w-24 bg-white/5 rounded-xl animate-pulse"></div>`;
        return;
    }
    container.innerHTML = years.map(year => {
        const isActive = year === state.currentYear;
        return `<button onclick="setYear(${year})" 
            class="px-5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                isActive ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-black/20 text-gray-400 border-white/5 hover:text-gray-200 hover:bg-white/5'
            }">${year}</button>`;
    }).join('');
}

function renderList() {
    const container = document.getElementById('update-list-container');
    if (state.isLoading) {
        container.innerHTML = `
            <div class="flex flex-col items-center py-20 gap-4 text-gray-500">
                <div class="w-8 h-8 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin"></div>
                <p class="text-sm tracking-wider animate-pulse">Loading builds...</p>
            </div>`;
        return;
    }

    const filteredData = getActiveData().filter(u => {
        const matchesYear = u.year === state.currentYear;
        const s = state.searchTerm.toLowerCase();
        
        // Comprehensive search mapping covering title name, dates, BuildID and Manifest GID targets
        const matchesSearch = !state.searchTerm || 
                              u.name.toLowerCase().includes(s) || 
                              u.date.toLowerCase().includes(s) ||
                              (u.buildId && u.buildId.includes(s)) ||
                              u.id.includes(s);
                              
        let matchesFilter = true;
        if (state.branchFilter === 'public') matchesFilter = (u.branch === 'public');
        else if (state.branchFilter === 'beta') matchesFilter = (u.branch === 'beta');
        
        return matchesYear && matchesSearch && matchesFilter;
    });

    if (filteredData.length === 0) {
        container.innerHTML = `<div class="text-center py-24 text-gray-500 text-sm tracking-wide">No archived builds match your active filters.</div>`;
        return;
    }

    container.innerHTML = filteredData.map(u => {
        const isQuest = state.currentPlatform === 'oculus-quest';
        const isSteam = state.currentPlatform === 'steam';
        
        let identifierLine = "";
        if (isSteam) {
            identifierLine = `Build ID: <span class="text-emerald-400 font-bold">${u.buildId}</span> &bull; Manifest: <span class="text-gray-400 select-all font-semibold">${u.id}</span>`;
        } else {
            identifierLine = `Oculus Version ID: <span class="text-gray-400 select-all font-semibold">${u.id}</span>`;
        }

        return `
        <div class="monke-card border border-white/5 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 group">
            <div class="space-y-1.5">
                <div class="flex items-center flex-wrap gap-2.5">
                    <h3 class="text-md font-bold text-white group-hover:text-emerald-400 transition-colors duration-300">
                        ${u.name === "No title" ? "Public Minor Patch" : u.name}
                    </h3>
                    <span class="px-2 py-0.5 bg-gray-800/60 text-[10px] font-bold rounded-md text-gray-400 border border-white/5 uppercase tracking-wide">
                        ${u.date}
                    </span>
                    ${u.branch === 'beta' ? `<span class="text-[10px] bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider">Patch / Beta</span>` : ''}
                </div>
                <p class="text-gray-400 text-xs">${u.time ? `Released at ${u.time}` : (u.desc || 'No descriptor found')}</p>
                <p class="text-gray-500 text-[10px] font-mono tracking-wide">${identifierLine}</p>
            </div>
            <div>
                ${isQuest ? `
                    <button onclick="window.open('${QUEST_GUIDE_URL}', '_blank')" class="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white px-5 py-3 rounded-xl text-xs font-bold border border-emerald-500/20 transition-all active:scale-95">
                        <span>Install Guide</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </button>
                ` : `
                    <button onclick="handleCopyAction('${u.id}', this)" class="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-800/40 hover:bg-gray-800/80 px-5 py-3 rounded-xl text-xs font-bold border border-white/5 group-hover:border-emerald-500/30 transition-all active:scale-95">
                        <span class="copy-label">Copy Command</span>
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .415.162.787.428 1.062.263.27.629.438 1.034.438.405 0 .771-.168 1.034-.438.266-.275.428-.647.428-1.062 0-.231-.035-.454-.1-.664m-5.801 0A4.992 4.992 0 0110.125 3h1.5a4.992 4.992 0 014.676 3.08m-11.176 0c-1.132.094-1.976 1.057-1.976 2.192V16.5A2.25 2.25 0 005.25 18.75h3m7.5-13.5v12" /></svg>
                    </button>
                `}
            </div>
        </div>`;
    }).join('');
}

function calculateStats() {
    const countEl = document.getElementById('total-updates-count');
    const rangeEl = document.getElementById('year-range');
    const data = getActiveData();
    if(countEl) countEl.textContent = data.length;
    
    if(rangeEl && data.length > 0) {
        const sorted = data.map(u => u.year).sort();
        rangeEl.textContent = `(${sorted[0]} - ${sorted[sorted.length - 1]})`;
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if(!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.add('toast-visible');
    setTimeout(() => toast.classList.remove('toast-visible'), 2500);
}

// --- Event Listeners ---
document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    render();
});

window.addEventListener('scroll', () => {
    const btn = document.getElementById('back-to-top');
    if (btn) {
        if (window.scrollY > 400) btn.classList.add('visible');
        else btn.classList.remove('visible');
    }
}, { passive: true });

// Initial Page Load Bootstrap
window.setPlatform('steam');
