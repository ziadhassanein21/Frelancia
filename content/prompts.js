// ==========================================
// content/prompts.js — Prompt template CRUD
// Depends on: utils.js (isContextValid)
// ==========================================

function loadPrompts(callback) {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    chrome.storage.local.get(['prompts'], (data) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading prompts:', chrome.runtime.lastError);
            return;
        }
        const storedPrompts = data.prompts || [];

        if (storedPrompts.length > 0) {
            callback(storedPrompts);
        } else {
            chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error fetching default prompts:', chrome.runtime.lastError);
                    return;
                }
                const defaults = (response && response.prompts) ? response.prompts : [];
                chrome.storage.local.set({ prompts: defaults }, () => {
                    callback(defaults);
                });
            });
        }
    });
}

function savePrompt(promptData, callback) {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    chrome.storage.local.get(['prompts'], (data) => {
        let prompts = data.prompts || [];
        let savedId = promptData.id;

        if (savedId) {
            const index = prompts.findIndex(p => p.id === savedId);
            if (index !== -1) {
                prompts[index] = { ...prompts[index], ...promptData };
            } else {
                prompts.push(promptData);
            }
        } else {
            savedId = crypto.randomUUID();
            const newPrompt = {
                id: savedId,
                title: promptData.title,
                content: promptData.content,
                createdAt: new Date().toISOString()
            };
            prompts.push(newPrompt);
        }

        chrome.storage.local.set({ prompts }, () => {
            if (callback) callback(savedId);
        });
    });
}

function createPromptModal(onSave, existingPrompt = null) {
    if (document.getElementById('mostaql-prompt-modal')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'mostaql-prompt-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'mostaql-modal-content';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'mostaql-form-group';

    const titleLabel = document.createElement('label');
    titleLabel.className = 'mostaql-form-label';
    titleLabel.textContent = 'عنوان القالب:';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'mostaql-form-input';
    if (existingPrompt) titleInput.value = existingPrompt.title;

    groupTitle.appendChild(titleLabel);
    groupTitle.appendChild(titleInput);

    const groupContent = document.createElement('div');
    groupContent.className = 'mostaql-form-group';

    const contentLabel = document.createElement('label');
    contentLabel.className = 'mostaql-form-label';
    contentLabel.textContent = 'محتوى القالب:';

    const contentHelp = document.createElement('div');
    contentHelp.className = 'mostaql-form-help';
    contentHelp.textContent = 'المتغيرات المتاحة: {title}, {description}, {url}, {tags}, {client_name}, {client_type}, {budget}, {duration}, {publish_date}, {project_id}, {project_status}, {category}, {hiring_rate}, {open_projects}, {underway_projects}, {client_joined}';

    const contentInput = document.createElement('textarea');
    contentInput.className = 'mostaql-form-textarea';
    contentInput.rows = '6';
    if (existingPrompt) contentInput.value = existingPrompt.content;

    groupContent.appendChild(contentLabel);
    groupContent.appendChild(contentInput);
    groupContent.appendChild(contentHelp);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'mostaql-modal-actions';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = existingPrompt ? 'حفظ التعديلات' : 'حفظ القالب';
    saveBtn.className = 'btn-modal-primary';
    saveBtn.onclick = () => {
        const t = titleInput.value.trim();
        const c = contentInput.value.trim();
        if (t && c) {
            saveBtn.textContent = 'جاري الحفظ...';
            saveBtn.disabled = true;

            const promptData = { title: t, content: c };
            if (existingPrompt) promptData.id = existingPrompt.id;

            savePrompt(promptData, (savedId) => {
                document.body.removeChild(modalOverlay);
                if (onSave) onSave(savedId);
            });
        } else {
            alert('يرجى ملء جميع الحقول');
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'إلغاء';
    cancelBtn.className = 'btn-modal-secondary';
    cancelBtn.onclick = () => {
        document.body.removeChild(modalOverlay);
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);

    modalContent.appendChild(groupTitle);
    modalContent.appendChild(groupContent);
    modalContent.appendChild(btnContainer);

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
}
