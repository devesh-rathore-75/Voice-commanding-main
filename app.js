// --- Data & State ---
let shoppingList = [];
let isListening = false;
let currentLanguage = 'en-US';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
}

// Product Database with Substitutes and Prices
const productDB = {
    'milk': { category: 'Dairy', price: 3.50, subs: ['almond milk', 'oat milk'] },
    'almond milk': { category: 'Dairy', price: 4.50, subs: ['milk', 'soy milk'] },
    'bread': { category: 'Bakery', price: 2.50, subs: ['whole wheat bread', 'bagels'] },
    'apples': { category: 'Produce', price: 1.50, subs: ['pears', 'oranges'] },
    'organic apples': { category: 'Produce', price: 2.50, subs: ['apples'] },
    'bananas': { category: 'Produce', price: 1.20, subs: ['plantains'] },
    'toothpaste': { category: 'Personal Care', price: 4.00, subs: ['mouthwash'] },
    'water': { category: 'Beverages', price: 1.00, subs: ['sparkling water'] },
    'chicken': { category: 'Meat', price: 8.00, subs: ['turkey', 'tofu'] },
    'eggs': { category: 'Dairy', price: 4.00, subs: ['egg substitute'] }
};

const defaultCategory = 'Other';

// Smart Suggestions (Mocking seasonal/history)
const suggestions = [
    { name: 'bread', reason: 'Running low', icon: '🍞' },
    { name: 'apples', reason: 'In season', icon: '🍎' },
    { name: 'milk', reason: 'Frequent purchase', icon: '🥛' }
];

// --- DOM Elements ---
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const feedbackContainer = document.getElementById('feedbackContainer');
const shoppingListEl = document.getElementById('shoppingList');
const emptyStateEl = document.getElementById('emptyState');
const itemCountEl = document.getElementById('itemCount');
const suggestionsContainer = document.getElementById('suggestionsContainer');
const languageSelect = document.getElementById('languageSelect');
const listeningOverlay = document.getElementById('listeningOverlay');
const searchModal = document.getElementById('searchModal');
const searchResults = document.getElementById('searchResults');
const closeSearch = document.getElementById('closeSearch');

// --- Initialization ---
function init() {
    renderSuggestions();
    renderList();
    
    if (!SpeechRecognition) {
        showFeedback("Voice recognition not supported in this browser.", true);
        micBtn.disabled = true;
        micBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    // Event Listeners
    micBtn.addEventListener('click', toggleListening);
    languageSelect.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        if(recognition) recognition.lang = currentLanguage;
    });
    closeSearch.addEventListener('click', () => searchModal.classList.add('hidden'));
    
    if(recognition) {
        recognition.lang = currentLanguage;
        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('pulse', 'bg-red-500');
            micBtn.classList.remove('bg-indigo-600');
            micIcon.classList.remove('fa-microphone');
            micIcon.classList.add('fa-stop');
            listeningOverlay.classList.add('active');
            showFeedback("Listening... Speak now.");
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase();
            showFeedback(`Heard: "${transcript}"`);
            processCommand(transcript);
        };
        
        recognition.onerror = (event) => {
            showFeedback(`Error: ${event.error}`, true);
            stopListening();
        };
        
        recognition.onend = () => {
            stopListening();
        };
    }
}

function toggleListening() {
    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch(e) {
            console.error(e);
        }
    }
}

function stopListening() {
    isListening = false;
    micBtn.classList.remove('pulse', 'bg-red-500');
    micBtn.classList.add('bg-indigo-600');
    micIcon.classList.add('fa-microphone');
    micIcon.classList.remove('fa-stop');
    listeningOverlay.classList.remove('active');
}

function showFeedback(msg, isError = false) {
    feedbackContainer.textContent = msg;
    if (isError) {
        feedbackContainer.classList.add('text-red-600', 'bg-red-100');
        feedbackContainer.classList.remove('text-gray-600', 'bg-gray-100');
    } else {
        feedbackContainer.classList.remove('text-red-600', 'bg-red-100');
        feedbackContainer.classList.add('text-gray-600', 'bg-gray-100');
    }
}

// --- NLP Command Processing ---
function processCommand(text) {
    // 1. Add Intent
    // Regex matches: "add 2 milks", "i need apples", "buy 1 bread"
    const addRegex = /(?:add|buy|get|i need|i want to buy)\s(?:(\d+)\s)?(.*)/i;
    // 2. Remove Intent
    const removeRegex = /(?:remove|delete|drop)\s(.*)/i;
    // 3. Search Intent
    const searchRegex = /(?:search|find|find me)\s(.*)/i;

    if (searchRegex.test(text)) {
        const match = text.match(searchRegex);
        handleSearch(match[1].trim());
    } else if (removeRegex.test(text)) {
        const match = text.match(removeRegex);
        let item = match[1].trim().replace(/\s+(from my list|from the list)$/i, '');
        handleRemove(item);
    } else if (addRegex.test(text)) {
        const match = text.match(addRegex);
        const qty = match[1] ? parseInt(match[1]) : 1;
        let item = match[2].trim().replace(/\s+(to my list|to the list)$/i, '');
        // basic singularization
        if(item.endsWith('s') && !item.endsWith('ss')) item = item.slice(0, -1);
        handleAdd(item, qty);
    } else {
        showFeedback("Didn't catch that. Try 'Add milk' or 'Remove apples'", true);
    }
}

function handleAdd(itemName, qty = 1) {
    const dbInfo = productDB[itemName] || { category: defaultCategory, price: 0 };
    
    // Check for substitutes warning
    let subMsg = '';
    if(!productDB[itemName] && getSubstitute(itemName)) {
        subMsg = ` (Suggested sub: ${getSubstitute(itemName)})`;
    }

    const existing = shoppingList.find(i => i.name === itemName);
    if (existing) {
        existing.qty += qty;
    } else {
        shoppingList.push({
            id: Date.now(),
            name: itemName,
            qty: qty,
            category: dbInfo.category,
            price: dbInfo.price,
            completed: false
        });
    }
    
    showFeedback(`Added ${qty} ${itemName}${subMsg}`);
    renderList();
}

function handleRemove(itemName) {
    // basic singularization match
    let searchName = itemName;
    if(searchName.endsWith('s') && !searchName.endsWith('ss')) searchName = searchName.slice(0, -1);
    
    const initialLen = shoppingList.length;
    shoppingList = shoppingList.filter(i => i.name !== itemName && i.name !== searchName);
    
    if (shoppingList.length < initialLen) {
        showFeedback(`Removed ${itemName}`);
    } else {
        showFeedback(`${itemName} not found on list`, true);
    }
    renderList();
}

function handleSearch(query) {
    // Check for price filter: "organic apples under $5" or "toothpaste under 5"
    let maxPrice = Infinity;
    let searchTerm = query;
    const priceMatch = query.match(/(.*)\sunder\s\$?(\d+)/i);
    
    if (priceMatch) {
        searchTerm = priceMatch[1].trim();
        maxPrice = parseInt(priceMatch[2]);
    }
    
    // Find in DB
    const results = Object.entries(productDB).filter(([name, info]) => {
        return name.includes(searchTerm) && info.price <= maxPrice;
    });

    displaySearchResults(results, searchTerm);
}

function getSubstitute(itemName) {
    // simplistic match
    for(let [key, val] of Object.entries(productDB)) {
        if(val.subs && val.subs.includes(itemName)) return key;
    }
    return null;
}

// --- UI Rendering ---

function renderSuggestions() {
    suggestionsContainer.innerHTML = '';
    suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'flex-shrink-0 bg-white border border-indigo-100 rounded-lg p-2 px-3 text-left shadow-sm hover:shadow-md hover:border-indigo-300 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 group';
        btn.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xl">${s.icon}</span>
                <div>
                    <div class="font-semibold text-gray-800 text-sm group-hover:text-indigo-700">${s.name}</div>
                    <div class="text-xs text-gray-400">${s.reason}</div>
                </div>
                <div class="ml-2 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i class="fas fa-plus-circle"></i>
                </div>
            </div>
        `;
        btn.onclick = () => handleAdd(s.name, 1);
        suggestionsContainer.appendChild(btn);
    });
}

function renderList() {
    itemCountEl.textContent = shoppingList.length;
    
    if (shoppingList.length === 0) {
        shoppingListEl.innerHTML = '';
        emptyStateEl.style.display = 'flex';
        return;
    }
    
    emptyStateEl.style.display = 'none';
    
    // Group by category
    const grouped = {};
    shoppingList.forEach(item => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
    });
    
    let html = '';
    Object.keys(grouped).sort().forEach(category => {
        html += `
            <div class="mb-4 last:mb-0">
                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">${category}</h3>
                <ul class="space-y-2">
        `;
        
        grouped[category].forEach(item => {
            const subBadge = getSubBadge(item.name);
            html += `
                <li class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition group">
                    <div class="flex items-center gap-3">
                        <button onclick="toggleComplete(${item.id})" class="w-5 h-5 rounded border ${item.completed ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'} flex items-center justify-center focus:outline-none">
                            ${item.completed ? '<i class="fas fa-check text-white text-xs"></i>' : ''}
                        </button>
                        <div>
                            <span class="font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'} capitalize">${item.name}</span>
                            <span class="text-xs text-gray-500 ml-1">x${item.qty}</span>
                            ${subBadge}
                        </div>
                    </div>
                    <button onclick="removeItemById(${item.id})" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition focus:outline-none">
                        <i class="fas fa-trash"></i>
                    </button>
                </li>
            `;
        });
        
        html += `</ul></div>`;
    });
    
    shoppingListEl.innerHTML = html;
}

function getSubBadge(name) {
    if(productDB[name] && productDB[name].subs && productDB[name].subs.length > 0) {
        return `<span class="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full" title="Substitute available">Sub available</span>`;
    }
    return '';
}

window.toggleComplete = (id) => {
    const item = shoppingList.find(i => i.id === id);
    if(item) {
        item.completed = !item.completed;
        renderList();
    }
};

window.removeItemById = (id) => {
    shoppingList = shoppingList.filter(i => i.id !== id);
    renderList();
};

function displaySearchResults(results, term) {
    searchModal.classList.remove('hidden');
    
    if (results.length === 0) {
        searchResults.innerHTML = `<div class="text-center text-gray-500 py-4">No items found for "${term}"</div>`;
        return;
    }
    
    let html = `<div class="text-sm text-gray-500 mb-2">Found ${results.length} result(s)</div>`;
    results.forEach(([name, info]) => {
        html += `
            <div class="flex justify-between items-center p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                <div>
                    <div class="font-medium capitalize text-gray-800">${name}</div>
                    <div class="text-sm text-gray-500">$${info.price.toFixed(2)} &bull; ${info.category}</div>
                </div>
                <button onclick="handleAdd('${name}', 1); document.getElementById('searchModal').classList.add('hidden');" class="text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-md text-sm font-medium transition">
                    Add
                </button>
            </div>
        `;
    });
    
    searchResults.innerHTML = html;
}

// Start
init();
